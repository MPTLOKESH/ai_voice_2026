"""The browser UI: a page to set the assistant up, and a page to call it.

A turn is one request. The reply text comes back immediately, then the speech streams in the same response, so
the customer hears the first words while the rest is still being made.

Response shape for a turn:  {json line}\n followed by raw 24 kHz 16-bit audio.

Built on the standard library, so nothing extra needs installing. Run it with:  python -m voice_call
"""
from __future__ import annotations

import json
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from pydantic import ValidationError

from . import contacts, engine, gemini, results, settings, sources, storage, voices
from .models import KEPT_VERSIONS, BusinessSetup, Call, Version
from .suggestions import reword, suggest_questions

calls: dict[str, Call] = {}
lock = threading.Lock()

# One turn of a call at a time. Nothing stopped a second turn being sent while the first was still
# thinking — talking over the reply does exactly that — and two threads then ran `reply_to` on the same
# call at once, interleaving the answers they saved and the step they moved it to.
_turns: dict[str, threading.Lock] = {}


def turn_lock(call_id: str) -> threading.Lock:
    with lock:
        return _turns.setdefault(call_id, threading.Lock())


take_notices = gemini.take_notices


def check_setup(setup: BusinessSetup) -> list[str]:
    """Plain rules, so a broken setup fails here rather than in front of a customer."""
    problems = []
    if not any(q.kind == "ask" for q in setup.questions):
        problems.append("Add at least one question.")
    if not setup.purpose.strip():
        problems.append("Say what the call is for.")
    names = [q.save_as for q in setup.questions]
    for name in sorted({n for n in names if names.count(n) > 1}):
        problems.append(f"Two questions are saved as '{name}'.")
    for q in setup.questions:
        if not q.save_as.isidentifier():
            problems.append(f"'{q.save_as}': use letters, numbers and underscores only.")
        if q.kind == "ask" and q.type == "choice" and len(q.options) < 2:
            problems.append(f"'{q.save_as}': a choice needs at least two options.")
        if q.kind == "say" and not q.ask.strip():
            problems.append(f"'{q.save_as}': write what it should say.")
        if q.kind == "end" and not q.only_if:
            problems.append(f"'{q.save_as}': an end step needs a condition, or it would end every call.")
    for at, q in enumerate(setup.questions):
        if not q.only_if:
            continue
        # Only an earlier question, so no two questions can each wait for the other.
        above = [other.save_as for other in setup.questions[:at] if other.kind == "ask"]
        if q.only_if not in above:
            problems.append(f"'{q.save_as}' can only depend on a question above it.")
        elif not q.only_if_is:
            problems.append(f"'{q.save_as}': say which answer to '{q.only_if}' it is asked after.")
    return problems


def explain(failure: ValidationError) -> str:
    """The first thing wrong with a setup, in a line: "speaking_speed: Input should be less than or equal to 1.2"."""
    first = failure.errors()[0]
    where = ".".join(str(part) for part in first["loc"])
    return f"{where}: {first['msg']}" if where else first["msg"]


REMEMBER_CALLS = 20        # finished calls kept in memory, so the page can still read them


def finish(call: Call):
    """Summarise, save again with the summary, and let old calls go."""
    try:
        call.summary = engine.summarise(call).model_dump()
    except Exception as exc:                      # a summary is not worth losing the call over
        call.note(f"summary failed: {exc}")
    # Nothing is listening for these any more — the browser has had its last reply — so they go into the
    # call's own log, where the saved file will keep them.
    for notice in take_notices():
        call.note(notice)
    call.note(f"saved to {storage.save_call(call)}")

    with lock:
        finished = [c for c in calls.values() if c.outcome]
        for old in finished[:-REMEMBER_CALLS]:
            calls.pop(old.id, None)
            _turns.pop(old.id, None)


class Handler(BaseHTTPRequestHandler):
    server_version = "voice_call"
    protocol_version = "HTTP/1.1"                 # needed for a streamed reply

    def log_message(self, format, *args):         # quieter console
        pass

    # ── sending ──────────────────────────────────────────────────────────────
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, name: str):
        path = (settings.WEB_FOLDER / name).resolve()
        if not path.is_file() or settings.WEB_FOLDER.resolve() not in path.parents:
            return self.send_json({"error": f"{name} not found"}, 404)
        # A wasm file served as text/plain is refused by the browser's streaming compiler, and the VAD
        # model would never load.
        kind = {"html": "text/html", "js": "text/javascript", "mjs": "text/javascript",
                "css": "text/css", "svg": "image/svg+xml", "json": "application/json",
                "wasm": "application/wasm", "onnx": "application/octet-stream"}.get(
            name.rsplit(".", 1)[-1], "text/plain")
        # A charset only means something for text. On the wasm file it made the type "application/wasm;
        # charset=utf-8", which the browser's fast streaming compile refuses as the wrong type.
        if kind.startswith("text/") or kind in ("application/json", "image/svg+xml"):
            kind += "; charset=utf-8"
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        # The page itself is never cached, so a rebuilt UI reaches the person testing it on the next
        # reload. What it loads can be: the build names every file in assets/ after its contents, so an
        # edit arrives under a new name, and the vendored voice model never changes.
        # `name` has no leading slash: "assets/…", "vendor/…", "index.html".
        lasting = name.replace("\\", "/").startswith(("assets/", "vendor/"))
        self.send_header("Cache-Control", "public, max-age=86400" if lasting else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def start_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def write_chunk(self, data: bytes):
        self.wfile.write(f"{len(data):X}\r\n".encode())
        self.wfile.write(data)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def end_stream(self):
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    # ── receiving ────────────────────────────────────────────────────────────
    def body(self) -> dict:
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        return json.loads(raw or "{}")

    def raw_body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length") or 0))

    # ── pages ────────────────────────────────────────────────────────────────
    def do_GET(self):
        url = urlparse(self.path)
        route = url.path
        try:
            if route in ("/", "/drafts", "/studio", "/voices", "/call", "/history", "/contacts", "/results"):
                return self.send_file("index.html")     # one page: the page shown is chosen in the browser
            # The built UI (frontend/, built into web/): its scripts and styles, the voice model, the icon.
            if route.startswith(("/assets/", "/vendor/")) or route == "/favicon.svg":
                return self.send_file(route.removeprefix("/"))
            if route == "/api/flows":
                return self.send_json({"flows": [flow.model_dump() for flow in storage.list_flows()]})
            if route == "/api/calls":
                query = {key: values[0] for key, values in parse_qs(url.query).items()}
                return self.send_json(storage.recent_calls(
                    limit=min(max(int(query.get("limit") or 20), 1), 100), offset=max(int(query.get("offset") or 0), 0),
                    flow=query.get("flow", ""), outcome=query.get("outcome", ""), contact=query.get("contact", "")))
            if route == "/api/contacts" or route.startswith("/api/contacts/"):
                return self.contacts_read(route.removeprefix("/api/contacts").strip("/"),
                                          {key: values[0] for key, values in parse_qs(url.query).items()})
            if route == "/api/stats":
                return self.send_json(results.stats())
            if route.startswith("/api/flows/") and route.count("/") == 4:
                return self.flow_read(route.split("/")[3], route.split("/")[4])
            if route == "/api/models":
                return self.send_json({"models": gemini.current})
            if route == "/api/voices":
                return self.send_json({"voices": voices.choices(), "default": settings.ELEVEN_VOICE})
            return self.send_json({"error": "unknown route"}, 404)
        except Exception as exc:
            traceback.print_exc()
            return self.send_json({"error": str(exc)}, 500)

    # ── actions ──────────────────────────────────────────────────────────────
    def do_POST(self):
        route = urlparse(self.path).path
        try:
            if route == "/api/flows":
                data = self.body()
                setup = BusinessSetup(**data["setup"]) if data.get("setup") else None
                return self.send_json(storage.new_flow(data.get("name") or "Untitled flow", setup).model_dump())

            if route.startswith("/api/flows/"):
                return self.flow_action(route.removeprefix("/api/flows/"))

            if route == "/api/contacts" or route.startswith("/api/contacts/"):
                return self.contacts_action(route.removeprefix("/api/contacts").strip("/"))

            if route == "/api/suggest":
                found = suggest_questions(BusinessSetup(**self.body()))
                return self.send_json({"questions": [q.model_dump() for q in found], "notices": take_notices()})

            if route == "/api/suggest/reword":
                data = self.body()
                options = reword(BusinessSetup(**data["setup"]), data.get("text") or "", data.get("kind") or "ask")
                return self.send_json({"options": options, "notices": take_notices()})

            if route == "/api/hear":
                return self.hear_voice()

            if route == "/api/call/start":
                return self.start_call()

            if route == "/api/call/turn":
                return self.take_turn()

            return self.send_json({"error": "unknown route"}, 404)
        except ValidationError as exc:
            return self.send_json({"error": explain(exc)}, 400)
        except contacts.Problem as exc:
            return self.send_json({"error": str(exc)}, 400)
        except (json.JSONDecodeError, KeyError) as exc:
            return self.send_json({"error": f"the request was not understood: {exc}"}, 400)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # The browser stopped listening mid-reply. That is what talking over the assistant looks
            # like from here, so it is ordinary: there is nobody left to send an error to.
            return
        except Exception as exc:
            traceback.print_exc()
            return self.send_json({"error": f"{type(exc).__name__}: {exc}"}, 500)

    def flow_action(self, rest: str):
        """/api/flows/<id> saves the draft; /<id>/publish, /<id>/discard and /<id>/delete do what they say."""
        flow_id, _, action = rest.partition("/")
        try:
            flow = storage.get_flow(flow_id)
        except KeyError:
            return self.send_json({"error": "that flow does not exist"}, 404)
        data = self.body()

        if action == "delete":
            storage.delete_flow(flow_id)
            return self.send_json({"deleted": flow_id})

        if action == "duplicate":
            copy = storage.new_flow(f"{flow.name} (copy)", flow.setup.model_copy(deep=True))
            copy.groups, copy.channels = list(flow.groups), list(flow.channels)
            return self.send_json(storage.save_flow(copy, touch=False).model_dump())

        if action == "restore":
            # An earlier published version becomes the draft. Nothing goes live until it is published again.
            version = next((one for one in flow.history if one.at == data.get("at")), None)
            if version is None:
                return self.send_json({"error": "That version is no longer kept."}, 404)
            flow.setup = version.setup.model_copy(deep=True)
            return self.send_json(storage.save_flow(flow).model_dump())

        if action == "unpublish":
            # Back to a draft: nothing is live or scheduled. The choices made when publishing are kept.
            flow.status, flow.published, flow.scheduled_for = "Draft", None, ""
            return self.send_json(storage.save_flow(flow).model_dump())

        if action == "discard":
            # Back to what is live: the draft's edits since the last publish are dropped.
            if flow.published is None:
                return self.send_json({"error": "It has never been published, so there is nothing to go back to."}, 400)
            flow.setup = flow.published.model_copy(deep=True)
            return self.send_json(storage.save_flow(flow).model_dump())

        if action == "publish":
            channels = [c for c in data.get("channels") or [] if c in ("Website", "WhatsApp", "Call")]
            when = "Schedule" if data.get("when") == "Schedule" else "Now"
            if not channels:
                return self.send_json({"error": "Pick at least one place for it to go."}, 400)
            at = (data.get("scheduled_for") or "").strip()
            if when == "Schedule":
                if not at:
                    return self.send_json({"error": "Pick a date and time to schedule it for."}, 400)
                try:
                    moment = datetime.fromisoformat(at)
                except ValueError:
                    return self.send_json({"error": "That date and time could not be read."}, 400)
                # A minute's grace, for a time picked just before pressing Publish.
                if moment.tzinfo is None and moment < datetime.now() - timedelta(minutes=1):
                    return self.send_json({"error": "That time has already passed. Pick one in the future."}, 400)
            problems = check_setup(flow.setup)
            if problems:
                return self.send_json({"error": " ".join(problems)}, 400)
            known = {group["id"] for group in contacts.list_groups()["groups"]}
            groups = [group for group in dict.fromkeys(data.get("groups") or []) if group in known]
            # The website widget is opened by whoever visits; calls and WhatsApp go to people, who must be named.
            if not groups and any(channel in ("WhatsApp", "Call") for channel in channels):
                return self.send_json({"error": "Pick the groups of contacts it goes to."}, 400)
            flow.channels, flow.when, flow.groups = channels, when, groups
            flow.audience = (data.get("audience") or "").strip()
            flow.scheduled_for = at if when == "Schedule" else ""
            flow.status = "Scheduled" if when == "Schedule" else "Live"
            flow.published = flow.setup.model_copy(deep=True)
            flow.published_at = datetime.now().isoformat(timespec="seconds")
            # Publishing the same thing again is not a new version.
            if not flow.history or flow.history[0].setup != flow.published:
                flow.history.insert(0, Version(at=flow.published_at, name=flow.name, setup=flow.published))
                del flow.history[KEPT_VERSIONS:]
            return self.send_json(storage.save_flow(flow).model_dump())

        if action:
            return self.send_json({"error": "unknown route"}, 404)
        # Made from an older version than the one stored: another tab saved in between. Saving anyway would
        # throw that tab's work away without anyone knowing, so say so and send what is stored now.
        if data.get("version") is not None and int(data["version"]) != flow.version:
            return self.send_json({"error": "This flow was changed somewhere else.", "conflict": True,
                                   "flow": flow.model_dump()}, 409)
        flow.name = (data.get("name") or flow.name).strip() or flow.name
        if data.get("setup"):
            flow.setup = BusinessSetup(**data["setup"])
        return self.send_json(storage.save_flow(flow).model_dump())

    def flow_read(self, flow_id: str, what: str):
        """GET /api/flows/<id>/results, and /<id>/export.csv: one flow's answers, summed up or one row a call."""
        try:
            flow = storage.get_flow(flow_id)
        except KeyError:
            return self.send_json({"error": "that flow does not exist"}, 404)
        if what == "results":
            groups = flow.groups
            return self.send_json(results.flow_results(
                flow, contacts.audience(groups, results.called_contacts(flow_id)) if groups else {}))
        if what == "export.csv":
            body = ("\ufeff" + results.flow_csv(flow)).encode("utf-8")      # the mark makes Excel read it as UTF-8
            name = "".join(ch if ch.isalnum() else "-" for ch in flow.name).strip("-").lower() or "flow"
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{name}-results.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return self.send_json({"error": "unknown route"}, 404)

    # ── contacts ─────────────────────────────────────────────────────────────
    def contacts_read(self, rest: str, query: dict):
        """GET /api/contacts (a page of them), /groups, /sources, and /<id> (one, with its calls)."""
        if rest == "":
            return self.send_json(contacts.list_contacts(
                group=query.get("group", ""), search=query.get("search", ""), status=query.get("status", ""),
                offset=max(int(query.get("offset") or 0), 0), limit=min(max(int(query.get("limit") or 50), 1), 200)))
        if rest == "groups":
            return self.send_json(contacts.list_groups())
        if rest == "sources":
            return self.send_json({"drivers": sources.drivers(), "connections": sources.list_connections(),
                                   "country": contacts.DEFAULT_COUNTRY})
        if "/" not in rest:
            try:
                found = contacts.get_contact(rest)
            except KeyError:
                return self.send_json({"error": "That contact no longer exists."}, 404)
            return self.send_json({**found, "calls": storage.recent_calls(limit=20, contact=rest)["calls"]})
        return self.send_json({"error": "unknown route"}, 404)

    def contacts_action(self, rest: str):
        """POST under /api/contacts: adding and changing contacts and groups, imports, and databases."""
        if rest == "file":
            return self.send_json(sources.read_file(unquote(self.headers.get("X-Filename", "")), self.raw_body()))
        data = self.body()
        parts = rest.split("/")
        country = data.get("country") or contacts.DEFAULT_COUNTRY
        try:
            if rest == "":
                return self.send_json(contacts.save_contact(data, country=country))
            if rest == "delete":
                return self.send_json({"deleted": contacts.delete_contacts(list(data.get("ids") or []))})
            if rest == "opt-out":
                return self.send_json({"changed": contacts.set_opted_out(list(data.get("ids") or []),
                                                                          bool(data.get("opted_out")))})
            if rest == "reach":
                return self.send_json(contacts.reach(list(data.get("groups") or [])))
            if rest == "import":
                return self.send_json(contacts.bring_in(
                    list(data.get("columns") or []), list(data.get("rows") or []), dict(data.get("mapping") or {}),
                    country=country, group_id=data.get("group_id") or "", new_group=data.get("new_group") or "",
                    dry_run=bool(data.get("dry_run"))))
            if rest == "groups":
                return self.send_json(contacts.create_group(data.get("name") or "", data.get("description") or ""))
            if parts[0] == "groups" and len(parts) == 2:
                return self.send_json(contacts.update_group(parts[1], data.get("name"), data.get("description")))
            if parts[0] == "groups" and len(parts) == 3:
                return self.group_action(parts[1], parts[2], data)
            if rest == "connections":
                return self.send_json(sources.save_connection(data.get("name") or "", data.get("kind") or "",
                                                              data.get("address") or ""))
            if parts[0] == "connections" and len(parts) == 3 and parts[2] == "delete":
                sources.delete_connection(parts[1])
                return self.send_json({"deleted": parts[1]})
            if parts[0] == "connections" and len(parts) == 3 and parts[2] == "tables":
                return self.send_json({"tables": sources.list_tables(sources._find(parts[1]))})
            if rest == "query":
                return self.send_json(sources.read_rows(data.get("connection") or "", data.get("table") or "",
                                                        data.get("query") or ""))
            if rest == "database-group":
                return self.database_group(data, country)
            if len(parts) == 1:
                return self.send_json(contacts.save_contact(data, contact_id=parts[0], country=country))
        except KeyError:
            return self.send_json({"error": "That contact or group no longer exists."}, 404)
        return self.send_json({"error": "unknown route"}, 404)

    def group_action(self, group_id: str, action: str, data: dict):
        if action == "delete":
            using = [flow.name for flow in storage.list_flows() if flow.status != "Draft" and group_id in flow.groups]
            if using and not data.get("force"):
                verb = "is" if len(using) == 1 else "are"
                return self.send_json({"error": f"{', '.join(using)} {verb} sent to this group.", "flows": using}, 409)
            return self.send_json({"removed": contacts.delete_group(group_id, bool(data.get("with_contacts")))})
        if action == "sync":
            return self.send_json(sources.sync_group(group_id))
        if action == "members":
            return self.send_json({"changed": contacts.change_members(group_id, list(data.get("ids") or []),
                                                                       bool(data.get("add", True)))})
        return self.send_json({"error": "unknown route"}, 404)

    def database_group(self, data: dict, country: str):
        """A new group read from a database. Everything is read first, so a query that fails leaves no empty group."""
        config = {"connection": data.get("connection") or "", "table": data.get("table") or "",
                  "query": data.get("query") or "", "mapping": dict(data.get("mapping") or {}), "country": country}
        found = sources.read_rows(config["connection"], config["table"], config["query"], limit=contacts.MAX_IMPORT)
        if found["more"]:
            raise contacts.Problem(f"The query gives more than {contacts.MAX_IMPORT:,} rows. Narrow it with a WHERE.")
        return self.send_json(contacts.bring_in(found["columns"], found["rows"], config["mapping"], country=country,
                                                new_group=data.get("name") or "", source="database", config=config))

    def hear_voice(self):
        """A sample line in the voice as set up, so the voice and speed can be tried before a call."""
        data = self.body()
        setup = BusinessSetup(**data["setup"])
        text = (data.get("text") or "").strip()[:300]
        if not text:
            return self.send_json({"error": "nothing to say"}, 400)
        if not voices.ready():
            return self.send_json({"error": voices.NO_KEY}, 400)
        # Like a turn, the text goes first and the audio behind it, so a problem while speaking can't travel
        # with it. The page notices the missing audio; the reason goes to the console.
        self.start_stream()
        self.write_chunk(json.dumps({"say": text}).encode("utf-8") + b"\n")
        for piece in voices.speak(text, setup, on_problem=lambda problem: print(f"  voice sample: {problem}")):
            self.write_chunk(piece)
        self.end_stream()

    # ── a call ───────────────────────────────────────────────────────────────
    def start_call(self):
        data = self.body()
        if not data.get("setup"):
            return self.send_json({"error": "no setup was sent with the call"}, 400)
        setup = BusinessSetup(**data["setup"])
        problems = check_setup(setup)
        if problems:
            return self.send_json({"error": " ".join(problems)}, 400)

        call, greeting = engine.start(setup, data.get("customer") or {})
        flow_id = str(data.get("flow_id") or "")
        call.flow_id = flow_id if flow_id.isalnum() and len(flow_id) <= 32 else ""
        with lock:
            calls[call.id] = call
        self.stream_reply(call, heard="", say=greeting, ended=False, think_ms=0,
                          with_audio=bool(data.get("speak", True)))

    def take_turn(self):
        call = calls.get(self.headers.get("X-Call-Id", ""))
        if call is None:
            return self.send_json({"error": "that call has finished or was never started"}, 404)
        speaking = self.headers.get("X-Speak", "1") != "0"
        interrupted = self.headers.get("X-Interrupted") == "1"     # they talked over the last reply

        # Read the body off the socket before queueing behind another turn. It is still arriving on this
        # connection, and leaving it there would stall the socket rather than just the work.
        audio = self.headers.get("Content-Type", "").startswith("audio/")
        wav = self.raw_body() if audio else b""
        typed = "" if audio else (self.body().get("message") or "")

        with turn_lock(call.id):
            heard_ms = 0
            if audio:
                began = time.monotonic()
                heard = voices.transcribe(wav, voices.listening_for(call.setup), call.last_asked()) if wav else ""
                heard_ms = int((time.monotonic() - began) * 1000)
            else:
                heard = typed

            # The voice detector fires on a loud room as well as on a voice. A recording with no words in it
            # was the room: it is not an answer, and not a silence either, so the call carries on as if it
            # never happened — and whatever the assistant is still saying is left to finish.
            if audio and not voices.has_words(heard):
                call.note("only noise heard: ignored")
                return self.stream_reply(call, heard="", say="", ended=False, think_ms=0, heard_ms=heard_ms,
                                         with_audio=False, ignored=True)

            result = engine.reply_to(call, heard, interrupted=interrupted)
            if result["ended"]:
                storage.save_call(call)        # written before the goodbye, so "all confirmed" is true
            self.stream_reply(call, heard=heard, say=result["say"], ended=result["ended"],
                              think_ms=result["think_ms"], heard_ms=heard_ms, with_audio=speaking)
        if result["ended"]:
            finish(call)                       # the summary is another AI request: do it after they hang up

    def stream_reply(self, call: Call, *, heard: str, say: str, ended: bool, think_ms: int,
                     heard_ms: int = 0, with_audio: bool, ignored: bool = False):
        """The reply text first, then its speech as it is made."""
        self.start_stream()
        self.write_chunk(json.dumps({
            "heard": heard, "say": say, "ended": ended, "think_ms": think_ms, "heard_ms": heard_ms,
            "ignored": ignored,
            "speech_model": settings.ELEVEN_SPEAK_MODEL,
            "listen_model": settings.ELEVEN_HEAR_MODEL,
            "state": call.snapshot(), "notices": take_notices(),
        }).encode("utf-8") + b"\n")

        if with_audio and say:
            try:
                for piece in voices.speak(say, call.setup, on_problem=call.note):
                    self.write_chunk(piece)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                call.note("stopped speaking: the customer talked over it")
                return                            # the connection is gone; there is no stream to end
            except Exception as exc:              # losing the voice shouldn't lose the call
                traceback.print_exc()
                call.note(f"speech failed: {exc}")
        self.end_stream()


class OnePortServer(ThreadingHTTPServer):
    # The standard server lets the address be reused. On Windows that lets a second copy start on a port the
    # first still holds, and requests keep reaching the first, running whatever code it started with.
    allow_reuse_address = sys.platform != "win32"


def serve(port: int = 8000, open_browser: bool = True):
    settings.DATA_FOLDER.mkdir(parents=True, exist_ok=True)
    # Build the Gemini client now rather than inside the first request, so the greeting isn't the thing
    # that pays for it. It opens no connection — that still happens on the first real request — but it
    # does read the key, which turns a missing one into a line here rather than a failed call later.
    # Not a reason to refuse to start: the setup page is worth serving either way.
    try:
        gemini.client()
    except Exception as exc:
        print(f"  note: {exc}")
    try:
        server = OnePortServer(("127.0.0.1", port), Handler)
    except OSError:
        raise SystemExit(f"Port {port} is already in use, most likely by Voice Call started earlier. Stop that one "
                         f"first, or run this one on another port: python -m voice_call --port {port + 1}")
    address = f"http://127.0.0.1:{port}"
    print(f"Voice Call is running at {address}")
    print("  /        set up your business")
    print("  /call    make a test call")
    print("  /history past calls")
    print("Press Ctrl+C to stop.")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(address)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()
