import {
  AudioWaveform, Flag, Map as MapIcon, Maximize2, Megaphone, MessagesSquare, Minus, Phone, PhoneForwarded, PhoneOff, Plus, RotateCcw,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";
import { LABEL_H, NODE_H, boundsOf, connectorsOf, hitTest, joinsOf } from "../../lib/layout.js";
import { SLOT, TILE, humanize } from "../../lib/thread.js";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.6;
const DRAG_FROM = 4;     // pixels the pointer must travel before a press becomes a drag

// What each kind of tile looks like: its icon and its soft tint.
const KINDS = {
  open: { icon: AudioWaveform, tile: "bg-brand-soft text-brand" },
  ask: { icon: AudioWaveform, tile: "bg-brand-soft text-brand" },
  answer: { icon: MessagesSquare, tile: "bg-human-soft text-human" },
  say: { icon: Megaphone, tile: "bg-[#e3f7fb] text-[#0891b2]" },
  end: { icon: PhoneOff, tile: "bg-bad-soft text-bad" },
  handoff: { icon: PhoneForwarded, tile: "bg-loop-soft text-loop" },
  close: { icon: Flag, tile: "bg-end-soft text-end" },
};
const kindOf = (tile, node) => (tile.kind === "end" && node.question?.handoff ? "handoff" : tile.kind);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * The call drawn on a canvas of its own. Every node can be put anywhere: drag it, or drag the background
 * to move about; scroll to move, Ctrl+scroll (or the buttons) to zoom. Nodes are joined in the order of
 * the call, so dropping something on a connector puts it there.
 *
 *   nodes       from layoutNodes
 *   details     {tileId: {title, sub, flag}} for the labels under each tile
 *   probe       {x, y} client position of a block being dragged in from outside, or null
 *   trashRef    the element a node can be dropped on to delete it
 *
 * Through its ref: hit(clientX, clientY) says what is there, fit() and zoomBy(±1) move the view.
 */
export const Canvas = forwardRef(function Canvas({
  nodes, details, selectedId, activeId, tries, probe, trashRef, empty,
  onSelect, onDeselect, onPlace, onRelocate, onDelete, onTrash, onInsertHere,
}, ref) {
  const viewport = useRef(null);
  const [view, setView] = useState({ tx: 80, ty: 40, z: 1 });
  const [drag, setDrag] = useState(null);          // {id, x, y}: a node on its way somewhere
  const [panning, setPanning] = useState(false);
  const [map, setMap] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 900));
  const press = useRef(null);                      // the press that may turn into a drag or a pan
  const latest = useRef({});

  // The nodes as drawn: the one being dragged is where the pointer has it.
  const shown = useMemo(() => (drag ? nodes.map((node) => (node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node)) : nodes), [nodes, drag]);
  const connectors = useMemo(() => connectorsOf(shown), [shown]);
  const joins = useMemo(() => joinsOf(shown), [shown]);
  const bounds = useMemo(() => boundsOf(shown, joins), [shown, joins]);

  const size = () => {
    const box = viewport.current?.getBoundingClientRect();
    return { width: box?.width || 800, height: box?.height || 500 };
  };

  /** A client position as a place on the canvas. */
  const toWorld = useCallback((clientX, clientY) => {
    const box = viewport.current.getBoundingClientRect();
    return { x: (clientX - box.left - view.tx) / view.z, y: (clientY - box.top - view.ty) / view.z };
  }, [view]);

  const resolve = useCallback((clientX, clientY, skip = "") => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return { inside: false, world: { x: 0, y: 0 }, hit: null };
    const inside = clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
    const world = toWorld(clientX, clientY);
    return { inside, world, hit: inside ? hitTest(world, shown, connectors, { reach: 34 / view.z, skip }) : null };
  }, [toWorld, shown, connectors, view.z]);

  // ── the view ───────────────────────────────────────────────────────────────
  /**
   * Everything in view. `minZoom` stops a long call being shrunk past reading: it is then lined up at its
   * start instead, to be moved along.
   */
  const fit = useCallback(({ minZoom = MIN_ZOOM } = {}) => {
    const { width, height } = size();
    const wanted = Math.min(1, (width - 140) / bounds.width, (height - 140) / bounds.height);
    const z = clamp(Math.max(wanted, minZoom), MIN_ZOOM, 1);
    const tx = bounds.width * z + 120 <= width ? (width - bounds.width * z) / 2 - bounds.left * z : 72 - bounds.left * z;
    setView({ z, tx, ty: Math.max(64, (height - bounds.height * z) / 2) - bounds.top * z });
  }, [bounds]);

  const zoomTo = useCallback((next, around) => {
    setView((now) => {
      const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const box = size();
      const px = around?.x ?? box.width / 2, py = around?.y ?? box.height / 2;
      return { z, tx: px - ((px - now.tx) / now.z) * z, ty: py - ((py - now.ty) / now.z) * z };
    });
  }, []);

  latest.current = { view, zoomTo, fit };
  useImperativeHandle(ref, () => ({
    hit: resolve,
    fit: () => fit(),
    zoomBy: (direction) => zoomTo(view.z * (direction > 0 ? 1.25 : 0.8)),
    zoom: view.z,
    focus: (id) => {
      const node = shown.find((one) => one.id === id || one.tiles.some((tile) => tile.id === id));
      if (!node) return;
      const { width, height } = size();
      setView((now) => ({ ...now, tx: width / 2 - (node.x + node.w / 2) * now.z, ty: height / 2 - (node.y + TILE / 2) * now.z }));
    },
  }), [resolve, fit, zoomTo, view.z, shown]);

  // Fitted once, when the canvas first has a size; after that the view is the person's.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    if (fitted.current || !viewport.current) return;
    fitted.current = true;
    latest.current.fit({ minZoom: 0.55 });
  }, []);

  // Scroll moves the view, Ctrl+scroll (and a pinch on a trackpad) zooms where the pointer is.
  useEffect(() => {
    const node = viewport.current;
    const wheel = (event) => {
      event.preventDefault();
      const { view: now, zoomTo: zoom } = latest.current;
      if (event.ctrlKey || event.metaKey) {
        const box = node.getBoundingClientRect();
        zoom(now.z * Math.exp(-event.deltaY * 0.01), { x: event.clientX - box.left, y: event.clientY - box.top });
      } else {
        setView((current) => ({ ...current, tx: current.tx - (event.shiftKey ? event.deltaY : event.deltaX), ty: current.ty - (event.shiftKey ? 0 : event.deltaY) }));
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);

  // ── pressing: a node to drag, or the background to move about with ─────────
  const overTrash = (clientX, clientY) => {
    const box = trashRef?.current?.getBoundingClientRect();
    return Boolean(box && clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom);
  };

  function pressNode(event, node, tile) {
    if (event.button !== 0) return;
    event.stopPropagation();
    press.current = { kind: "node", node, tile, start: { x: event.clientX, y: event.clientY }, origin: { x: node.x, y: node.y }, moved: false };
    attach();
  }

  function pressBackground(event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (!(event.target === viewport.current || event.target.dataset.canvas)) return;
    press.current = { kind: "pan", start: { x: event.clientX, y: event.clientY }, origin: { tx: view.tx, ty: view.ty }, moved: false };
    attach();
  }

  // The window listeners are the same two functions for the life of the canvas, and look up the latest
  // handlers when they fire, so they can always be taken off again.
  const handlers = useRef({});
  const onMove = useCallback((event) => handlers.current.move(event), []);
  const onUp = useCallback((event) => handlers.current.release(event), []);
  function attach() {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }
  function detach() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  }

  function move(event) {
    const now = press.current;
    if (!now) return;
    const dx = event.clientX - now.start.x, dy = event.clientY - now.start.y;
    if (!now.moved && Math.hypot(dx, dy) < DRAG_FROM) return;
    if (!now.moved) { now.moved = true; if (now.kind === "pan") setPanning(true); }
    const { view: current } = latest.current;
    if (now.kind === "pan") {
      setView({ ...current, tx: now.origin.tx + dx, ty: now.origin.ty + dy });
    } else {
      setDrag({ id: now.node.id, x: now.origin.x + dx / current.z, y: now.origin.y + dy / current.z, cx: event.clientX, cy: event.clientY });
      onTrash?.(now.node.type === "question" && overTrash(event.clientX, event.clientY));
    }
  }

  function release(event) {
    const now = press.current;
    press.current = null;
    detach();
    setPanning(false);
    if (!now) return;
    if (now.kind === "pan") {
      if (!now.moved) onDeselect();
      return;
    }
    const { node, tile } = now;
    if (!now.moved) { onSelect(tile.id); return; }
    const { view: current } = latest.current;
    const at = { x: now.origin.x + (event.clientX - now.start.x) / current.z, y: now.origin.y + (event.clientY - now.start.y) / current.z };
    setDrag(null);
    onTrash?.(false);
    if (node.type === "question" && overTrash(event.clientX, event.clientY)) { onDelete(node.id); return; }
    if (node.type === "question") {
      const found = resolve(event.clientX, event.clientY, node.id).hit;
      // Dropped on a connector: it goes there in the call too, not only on the canvas.
      if (found?.type === "connector" && found.connector.index !== node.index && found.connector.index !== node.index + 1) {
        onRelocate(node.id, found.connector.index, at.x, at.y);
        return;
      }
    }
    onPlace(node.id, at.x, at.y);
  }

  handlers.current = { move, release };
  useEffect(() => detach, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── what is lit up: under a block coming in from outside, or under a node being moved ──
  const target = useMemo(() => {
    if (drag) {
      const dragged = shown.find((node) => node.id === drag.id);
      if (!dragged || dragged.type !== "question") return null;
      const hit = resolve(drag.cx, drag.cy, drag.id).hit;
      return hit?.type === "connector" && hit.connector.index !== dragged.index && hit.connector.index !== dragged.index + 1 ? hit : null;
    }
    if (probe) {
      const found = resolve(probe.x, probe.y);
      return found.inside ? (found.hit || { type: "canvas" }) : null;
    }
    return null;
  }, [probe, drag, shown, resolve]);

  // ── the overview ───────────────────────────────────────────────────────────
  const MAP_W = 188, MAP_H = 120;
  const mapScale = Math.min((MAP_W - 16) / Math.max(bounds.width, 1), (MAP_H - 16) / Math.max(bounds.height, 1));
  // Centred in the box, so a short call does not sit in its corner.
  const mapPad = { x: (MAP_W - bounds.width * mapScale) / 2, y: (MAP_H - bounds.height * mapScale) / 2 };
  const mapAt = (x, y) => ({ left: mapPad.x + (x - bounds.left) * mapScale, top: mapPad.y + (y - bounds.top) * mapScale });
  const { width: vw, height: vh } = viewport.current ? size() : { width: 0, height: 0 };

  function mapPress(event) {
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left - mapPad.x) / mapScale + bounds.left;
    const y = (event.clientY - box.top - mapPad.y) / mapScale + bounds.top;
    setView((now) => ({ ...now, tx: vw / 2 - x * now.z, ty: vh / 2 - y * now.z }));
  }

  return (
    <div ref={viewport} onPointerDown={pressBackground}
         style={{ backgroundPosition: `${view.tx}px ${view.ty}px`, backgroundSize: `${22 * view.z}px ${22 * view.z}px` }}
         className={cn("bg-dotted relative min-h-0 flex-1 touch-none overflow-hidden bg-dots select-none",
                       panning ? "cursor-grabbing" : "cursor-grab",
                       target?.type === "canvas" && "ring-2 ring-brand/35 ring-inset")}>
      <div data-canvas="true" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`, transformOrigin: "0 0" }}
           className="absolute top-0 left-0">
        <svg data-canvas="true" width="1" height="1" className="pointer-events-none absolute top-0 left-0 overflow-visible">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9 z" fill="#b4b4be" />
            </marker>
            <marker id="arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9 z" fill="#6e4cf5" />
            </marker>
            <marker id="arrow-join" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M1 1 L9 5 L1 9 z" fill="#3b5bdb" />
            </marker>
          </defs>
          {connectors.map((connector) => {
            const hot = target?.type === "connector" && target.connector.index === connector.index;
            return (
              <path key={`c-${connector.index}`} d={connector.d} fill="none" strokeLinecap="round"
                    stroke={hot ? "#6e4cf5" : "#c4c4cc"} strokeWidth={hot ? 4 : 2}
                    markerEnd={hot ? "url(#arrow-hot)" : "url(#arrow)"} className={cn("transition-[stroke-width,stroke]", hot && "drop-shadow-[0_0_6px_rgb(110_76_245/0.55)]")} />
            );
          })}
          {joins.map((join) => (
            <path key={`j-${join.node.id}`} d={join.d} fill="none" stroke="#3b5bdb" strokeWidth="2" strokeDasharray="6 5"
                  strokeLinecap="round" markerEnd="url(#arrow-join)" opacity="0.85" />
          ))}
        </svg>

        {joins.map((join) => (
          <span key={`jl-${join.node.id}`} style={{ left: join.label.x, top: join.label.y }}
                className="pointer-events-none absolute z-[3] max-w-[240px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full bg-human-soft px-2.5 py-[3px] text-[11px] font-semibold text-human">
            {join.node.kind === "end" ? "ends if" : "only if"} {humanize(join.node.question.only_if)}
            {join.node.question.only_if_is?.length ? ` is ${join.node.question.only_if_is.join(" or ")}` : ""}
          </span>
        ))}

        {target?.type === "connector" && (
          <span style={{ left: target.connector.middle.x, top: target.connector.middle.y }}
                className="pointer-events-none absolute z-[6] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-[0_6px_18px_rgb(110_76_245/0.45)] motion-safe:animate-bounce">
            <Plus aria-hidden="true" className="size-3.5" strokeWidth={3} />Put it here
          </span>
        )}

        {/* Connectors can be clicked to add something on them */}
        {!drag && !probe && connectors.map((connector) => (
          <button key={`add-${connector.index}`} type="button" aria-label="Add a step here" title="Add a step here"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onInsertHere(connector.index, connector.middle)}
                  style={{ left: connector.middle.x, top: connector.middle.y }}
                  className="absolute z-[4] grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-brand text-white opacity-35 shadow-[0_4px_12px_rgb(110_76_245/0.4)] transition-all hover:scale-110 hover:opacity-100 focus-visible:opacity-100">
            <Plus aria-hidden="true" className="size-3" strokeWidth={3.4} />
          </button>
        ))}

        {shown.map((node) => {
          const dragging = drag?.id === node.id;
          const lit = target?.type === "node" && target.node.id === node.id;
          return (
            <div key={node.id} style={{ left: node.x, top: node.y, width: node.w, height: NODE_H, zIndex: dragging ? 20 : 1 }}
                 className={cn("group absolute", dragging ? "opacity-95 drop-shadow-[0_18px_28px_rgb(17_17_20/0.18)]" : "motion-safe:animate-[node-in_.28s_ease-out]")}>
              {lit && <span className="pointer-events-none absolute -inset-3 rounded-[28px] border-2 border-dashed border-brand bg-brand/5" />}

              {node.type === "open" && (
                <>
                  <span className="absolute grid size-14 place-items-center rounded-full border-[1.5px] border-edge bg-white text-body shadow-tile"
                        style={{ left: -160, top: TILE / 2 - 28 }}>
                    <Phone aria-hidden="true" className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="absolute w-[100px] text-center text-xs font-medium text-faint" style={{ left: -182, top: TILE / 2 + 38 }}>Call starts</span>
                  <span className="absolute h-0.5 bg-[#c9c9d1]" style={{ left: -104, top: TILE / 2 - 1, width: 104 }} />
                </>
              )}

              {node.kind === "ask" && <span className="absolute h-0.5 bg-[#c9c9d1]" style={{ left: TILE, top: TILE / 2 - 1, width: SLOT - TILE }} />}

              {node.tiles.map((tile) => {
                const detail = details[tile.id] || {};
                const kind = KINDS[kindOf(tile, node)];
                const Icon = kind.icon;
                const on = tile.id === selectedId;
                const hot = on || tile.id === activeId;
                return (
                  <div key={tile.id}>
                    <button type="button" aria-pressed={on} aria-label={`${detail.title}. ${detail.sub}`}
                            onPointerDown={(event) => pressNode(event, node, tile)}
                            onClick={(event) => { if (event.detail === 0) onSelect(tile.id); }}
                            style={{ left: tile.dx, top: 0, width: TILE, height: TILE }}
                            className={cn("absolute flex touch-none items-center justify-center rounded-[22px] border-[1.5px] bg-white transition-[box-shadow,border-color,transform]",
                                          dragging ? "cursor-grabbing" : "cursor-grab",
                                          on ? "border-brand" : "border-edge hover:-translate-y-0.5 hover:border-[#c4c4cc]",
                                          hot ? "shadow-[0_0_0_6px_rgb(110_76_245/0.14),0_8px_20px_rgb(17_17_20/0.08)]" : "shadow-tile")}>
                      {detail.flag && (
                        <span title={detail.flag.note} className={cn("absolute top-2.5 right-2.5 size-2 rounded-full", detail.flag.ok ? "bg-live" : "bg-amber")} />
                      )}
                      <span className={cn("grid size-[52px] place-items-center rounded-2xl", kind.tile)}>
                        <Icon aria-hidden="true" className="size-[26px]" strokeWidth={2} />
                      </span>
                      {tile.kind === "ask" && tries > 1 && (
                        <span title={`Asks again, up to ${tries} tries`}
                              className="absolute -top-2 -left-2 flex items-center gap-0.5 rounded-full bg-loop-soft px-1.5 py-0.5 text-[10px] font-bold text-loop-ink">
                          <RotateCcw aria-hidden="true" className="size-2.5" strokeWidth={2.6} />{tries}
                        </span>
                      )}
                    </button>
                    <div className="pointer-events-none absolute text-center" style={{ left: tile.dx - 22, top: TILE + 10, width: 140 }}>
                      <span className={cn("block truncate text-[13px] font-semibold", on ? "text-brand" : "text-body")}>{detail.title}</span>
                      <span className={cn("block truncate text-xs", detail.flag && !detail.flag.ok ? "font-medium text-warn" : "text-faint")}>{detail.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {empty && (
          <p className="pointer-events-none absolute w-[300px] text-[13px] leading-snug text-faint" style={{ left: SLOT, top: 120 + NODE_H + 30 }}>
            Drag a block from the bar above onto the canvas, or onto a line to put it there. Or let the AI suggest questions.
          </p>
        )}
      </div>

      {/* Moving about */}
      <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border border-line bg-white p-0.5 shadow-card"
           onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomTo(view.z * 0.8)} disabled={view.z <= MIN_ZOOM}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink disabled:opacity-40">
          <Minus aria-hidden="true" className="size-4" strokeWidth={2.2} />
        </button>
        <span className="w-11 text-center font-mono text-xs text-muted tabular-nums">{Math.round(view.z * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomTo(view.z * 1.25)} disabled={view.z >= MAX_ZOOM}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink disabled:opacity-40">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.2} />
        </button>
        <button type="button" aria-label="Fit the whole call on screen" title="Fit the whole call" onClick={() => fit()}
                className="grid size-8 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
          <Maximize2 aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
        <button type="button" aria-label={map ? "Hide the overview" : "Show the overview"} aria-pressed={map} title="Overview"
                onClick={() => setMap(!map)}
                className={cn("grid size-8 place-items-center rounded-full hover:bg-fill hover:text-ink", map ? "bg-brand-soft text-brand" : "text-muted")}>
          <MapIcon aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      </div>

      {map && (
        <div role="img" aria-label="Overview of the whole call" onPointerDown={mapPress}
             style={{ width: MAP_W, height: MAP_H }}
             className="absolute bottom-3 left-3 cursor-pointer overflow-hidden rounded-2xl border border-line bg-white/90 shadow-card backdrop-blur-sm">
          {shown.map((node) => {
            const where = mapAt(node.x, node.y);
            return (
              <span key={node.id} className={cn("absolute rounded-[3px]", node.type === "open" ? "bg-brand/60" : node.type === "close" ? "bg-end/60" : node.kind === "end" ? "bg-bad/50" : node.kind === "say" ? "bg-[#0891b2]/50" : "bg-brand/40")}
                    style={{ left: where.left, top: where.top, width: Math.max(4, node.w * mapScale), height: Math.max(4, TILE * mapScale) }} />
            );
          })}
          <span className="pointer-events-none absolute rounded-[4px] border-[1.5px] border-brand bg-brand/[0.06]"
                style={{ ...mapAt((-view.tx) / view.z, (-view.ty) / view.z), width: Math.min(MAP_W, (vw / view.z) * mapScale), height: Math.min(MAP_H, (vh / view.z) * mapScale) }} />
        </div>
      )}
    </div>
  );
});
