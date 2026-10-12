"""The shapes everything else uses: the setup a business writes, and the state of one call."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, Field, computed_field, model_validator

from . import settings

AnswerType = Literal["text", "number", "date", "time", "yes_no", "choice"]
Tone = Literal["friendly", "warm", "professional", "energetic", "calm"]
ReplyLength = Literal["brief", "balanced", "chatty"]
Formality = Literal["casual", "neutral", "formal"]


class Question(BaseModel):
    """One step of the call. Most are questions; two other kinds sit in the same line.

    kind "ask"  the assistant asks, and the customer's answer is saved as `save_as`.
    kind "say"  the assistant tells them something (`ask` is what), and no answer is expected.
    kind "end"  the call ends here, once the answer it waits on (`only_if`) comes in. `ask` is what is said
                last; empty, and the assistant writes a goodbye. With `handoff`, it is a hand-over to a
                person: the call is marked so, and nothing is dialled yet.
    """

    kind: Literal["ask", "say", "end"] = "ask"
    handoff: bool = False
    # Where it sits on the studio canvas. Layout only: the call goes in the order of the list. None is
    # "wherever the default layout puts it".
    x: float | None = None
    y: float | None = None
    save_as: str = Field(description="short snake_case name for the answer, e.g. party_size")
    ask: str = Field(description="the question as the assistant would say it, under 15 words")
    type: AnswerType = "text"
    rule: str = Field("", description="what makes an answer acceptable, in plain English")
    options: list[str] = Field(default_factory=list, description="allowed answers, only for type choice")
    required: bool = True
    # Asked only when an earlier question was answered with one of these values, e.g. only ask what went
    # wrong when on_time is "no". Code decides this, not the AI, so a skipped question is never asked.
    only_if: str = Field("", description="leave empty")
    only_if_is: list[str] = Field(default_factory=list, description="leave empty")


class BusinessSetup(BaseModel):
    """Everything a business decides. Saved as config/business.json and edited in the browser."""

    business_name: str = "Your business"
    assistant_name: str = "Assistant"
    purpose: str = ""
    calling_from: str = ""                        # e.g. "the customer care team"
    ai_disclosure: Literal["when_asked", "at_start"] = "when_asked"
    language: str = "English"
    business_info: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    max_minutes: float = 4
    questions: list[Question] = Field(default_factory=list)
    # Where the greeting and the close sit on the studio canvas: [x, y], or empty for the default place.
    open_at: list[float] = Field(default_factory=list)
    close_at: list[float] = Field(default_factory=list)

    # personality
    tone: Tone = "friendly"
    reply_length: ReplyLength = "balanced"
    formality: Formality = "neutral"

    # voice and speech
    voice_id: str = ""                            # empty: settings.ELEVEN_VOICE
    speaking_speed: float = Field(1.0, ge=0.7, le=1.2)
    other_languages: list[str] = Field(default_factory=list)

    # how the conversation runs
    tries_per_question: int = Field(settings.TRIES_PER_QUESTION, ge=1, le=5)
    silences_before_ending: int = Field(settings.SILENCES_BEFORE_ENDING, ge=1, le=5)
    confirm_at_end: bool = True
    allow_interruptions: bool = True
    wait_after_speech_ms: int = Field(450, ge=300, le=1500)

    def question(self, save_as: str) -> Question | None:
        return next((q for q in self.questions if q.save_as == save_as), None)


FlowStatus = Literal["Draft", "Live", "Scheduled"]
KEPT_VERSIONS = 10                                # published versions a flow remembers


class Version(BaseModel):
    """A setup as it was when it was published, so an earlier one can be brought back."""

    at: str
    name: str = ""
    setup: BusinessSetup
Channel = Literal["Website", "WhatsApp", "Call"]


class Flow(BaseModel):
    """One setup as a business keeps it: a name, the setup itself, and where it has been published.

    Saved as config/flows/<id>.json. Publishing records where a flow should go and when; it does not send
    anything to anyone yet.

    `setup` is the draft, which every edit saves into. `published` is the copy publishing took, which is what
    customers get: editing a live flow changes nothing for them until it is published again.
    """

    id: str
    name: str = "Untitled flow"
    status: FlowStatus = "Draft"
    channels: list[Channel] = Field(default_factory=list)
    audience: str = ""                            # a note on who it is for; who it goes to is `groups`
    groups: list[str] = Field(default_factory=list)   # the contact groups it is sent to
    when: Literal["Now", "Schedule"] = "Now"
    scheduled_for: str = ""                       # local date and time, as the browser wrote it
    created: str = ""                             # ISO time it was made
    edited: str = ""                              # ISO time of the last save
    published_at: str = ""                        # ISO time of the last publish
    # Goes up on every save. A save names the version it was made from, so two tabs on one flow can't
    # silently overwrite each other.
    version: int = 0
    setup: BusinessSetup = Field(default_factory=BusinessSetup)
    published: BusinessSetup | None = None
    history: list[Version] = Field(default_factory=list)       # newest first

    @model_validator(mode="after")
    def _published_copy(self):
        # Flows from before drafts and published copies were kept apart: what was live was the setup.
        if self.status != "Draft" and self.published is None:
            self.published = self.setup.model_copy(deep=True)
        return self

    @computed_field
    @property
    def unpublished_changes(self) -> bool:
        return self.published is not None and self.published != self.setup


# ── what the AI returns for one turn ─────────────────────────────────────────

class Answer(BaseModel):
    save_as: str
    value: str
    valid: bool
    # Only filled in when the answer was refused, and most are not, so it is not required: the model
    # would otherwise write "problem": null for every answer on every turn, and each of those tokens is
    # made one at a time while the customer waits.
    problem: str = ""


class Turn(BaseModel):
    answers: list[Answer]
    intent: Literal["answering", "confirms", "wants_to_stop"]
    reply: str


class Summary(BaseModel):
    summary: str
    follow_up_needed: bool


# ── the state of one call ────────────────────────────────────────────────────

@dataclass
class Call:
    setup: BusinessSetup
    customer: dict
    flow_id: str = ""                            # the flow it was made from, so its calls can be told apart
    said: set = field(default_factory=set)       # messages (kind "say") already told to the customer
    cut: set = field(default_factory=set)        # questions never asked because the call ended before them
    handoff: bool = False                        # ended by handing over to a person
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    step: str = "ask"                            # ask -> confirm -> finish
    answers: dict = field(default_factory=dict)  # save_as -> {"value": ..., "said": their words}
    skipped: set = field(default_factory=set)
    failed: dict = field(default_factory=dict)
    changes: list = field(default_factory=list)  # answers revised later in the call
    transcript: list = field(default_factory=list)
    events: list = field(default_factory=list)   # what the manager decided, for the live view
    silences: int = 0
    hurry: bool = False                          # near the time limit: nothing optional, no read-back
    outcome: str | None = None
    end_reason: str | None = None
    summary: dict | None = None
    started: float = field(default_factory=time.monotonic)

    def applies(self, question: Question) -> bool | None:
        """Whether a question is wanted on this call: None until the answer it depends on is in."""
        if not question.only_if:
            return True
        parent = self.setup.question(question.only_if)
        if parent is None:
            return True
        given = self.answers.get(parent.save_as)
        if given is None:
            return False if parent.save_as in self.skipped or self.applies(parent) is False else None
        return given["value"].strip().lower() in {value.strip().lower() for value in question.only_if_is}

    def _open(self, question: Question) -> bool:
        return (question.save_as not in self.answers and question.save_as not in self.skipped
                and question.save_as not in self.cut)

    def asks(self) -> list[Question]:
        """The steps that are questions: what gets answered, and so what the call has to collect."""
        return [q for q in self.setup.questions if q.kind == "ask"]

    def unanswered(self) -> list[Question]:
        """What can be asked now."""
        return [q for q in self.asks() if self._open(q) and self.applies(q)]

    def still_to_come(self) -> list[Question]:
        """What may yet be asked: `unanswered`, plus questions waiting on an earlier answer."""
        return [q for q in self.asks() if self._open(q) and self.applies(q) is not False]

    def not_needed(self) -> list[Question]:
        return [q for q in self.asks()
                if q.save_as not in self.answers and (self.applies(q) is False or q.save_as in self.cut)]

    def missing_required(self) -> list[Question]:
        return [q for q in self.asks() if q.required and q.save_as not in self.answers
                and q.save_as not in self.cut and self.applies(q) is not False]

    def pending_says(self) -> list[Question]:
        """Messages due now: those before the next question to ask (or all left, once nothing is left to ask)
        whose own condition, if any, is met."""
        steps = self.setup.questions
        left = self.unanswered()
        limit = steps.index(left[0]) if left else len(steps)
        return [q for q in steps[:limit]
                if q.kind == "say" and q.save_as not in self.said and self.applies(q) is True]

    def triggered_end(self) -> Question | None:
        """The end step whose condition has just been met, if any. An end with no condition would end every
        call before it began, so it never triggers."""
        return next((q for q in self.setup.questions
                     if q.kind == "end" and q.only_if and self.applies(q) is True), None)

    def add(self, speaker: str, text: str):
        self.transcript.append({"speaker": speaker, "text": text})

    def cut_off(self):
        """The customer talked over the last reply, so they may not have heard all of it."""
        for line in reversed(self.transcript):
            if line["speaker"] == "assistant":
                line["cut_off"] = True
                return

    def note(self, text: str):
        self.events.append({"at": round(self.seconds(), 1), "text": text})

    def last_said(self) -> str:
        return next((line["text"] for line in reversed(self.transcript) if line["speaker"] == "customer"), "")

    def last_asked(self) -> str:
        return next((line["text"] for line in reversed(self.transcript) if line["speaker"] == "assistant"), "")

    def recent(self, turns: int = settings.RECENT_TURNS) -> str:
        lines = [f"{'You' if t['speaker'] == 'assistant' else 'Customer'}"
                 f"{' (they talked over this, so may not have heard all of it)' if t.get('cut_off') else ''}"
                 f": {t['text']}"
                 for t in self.transcript[-turns:]]
        return "\n".join(lines) or "(the call has just started)"

    def answers_text(self) -> str:
        return ", ".join(f"{k} = {a['value']}" for k, a in self.answers.items()) or "nothing"

    def seconds(self) -> float:
        return time.monotonic() - self.started

    def seconds_left(self) -> float:
        return self.setup.max_minutes * 60 - self.seconds()

    def snapshot(self) -> dict:
        """Everything the browser needs to draw the live view."""
        return {
            "id": self.id, "step": self.step, "outcome": self.outcome, "end_reason": self.end_reason,
            "answers": {k: a["value"] for k, a in self.answers.items()},
            "said": {k: a["said"] for k, a in self.answers.items()},
            "unanswered": [q.save_as for q in self.unanswered()],
            "missing_required": [q.save_as for q in self.missing_required()],
            "not_needed": [q.save_as for q in self.not_needed()],
            "skipped": sorted(self.skipped), "failed": dict(self.failed), "changes": self.changes,
            "transcript": self.transcript, "events": self.events, "seconds": round(self.seconds(), 1),
            "summary": self.summary,
        }
