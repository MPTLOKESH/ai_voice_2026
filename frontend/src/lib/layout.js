/* Where things sit on the studio canvas, with no UI in it.
 *
 * The call goes in the order of the list of questions; the canvas is only where each step is drawn. A "node"
 * is one thing to move: the greeting, the close, a message or an end (one tile each), or a question (two
 * tiles, the assistant asking and the customer answering, kept together). Nodes are drawn in call order and
 * joined by connectors, wherever they have been put. A node with no place of its own sits where the
 * horizontal layout would put it.
 */
import { CLOSE, OPEN, SLOT, TILE, answerId, askId } from "./thread.js";

export const LABEL_H = 54;                // room under a tile for its name and its line of detail
export const NODE_H = TILE + LABEL_H;
export const ROW_Y = 120;                 // where the default horizontal line runs
export const PAIR_W = SLOT + TILE;        // a question: two tiles, side by side

const kindOf = (question) => question.kind || "ask";

/**
 * Every node in call order, each with its place, size and tiles.
 *   id      "open", "close", or the question's key
 *   tiles   what can be selected in it: [{id, kind, dx}], dx being how far along the node the tile is
 */
export function layoutNodes(questions, openAt = [], closeAt = []) {
  const at = (explicit, fallback) => (explicit?.length === 2 ? { x: explicit[0], y: explicit[1] } : fallback);
  const nodes = [{
    id: OPEN, type: "open", ...at(openAt, { x: 0, y: ROW_Y }), w: TILE,
    tiles: [{ id: OPEN, kind: "open", dx: 0 }],
  }];
  let slot = 1;
  questions.forEach((question, index) => {
    const kind = kindOf(question);
    const base = { x: slot * SLOT, y: ROW_Y };
    const place = question.x != null && question.y != null ? { x: question.x, y: question.y } : base;
    if (kind === "ask") {
      nodes.push({
        id: question._key, type: "question", kind, question, index, ...place, w: PAIR_W,
        tiles: [{ id: askId(question), kind: "ask", dx: 0 }, { id: answerId(question), kind: "answer", dx: SLOT }],
      });
      slot += 2;
    } else {
      nodes.push({
        id: question._key, type: "question", kind, question, index, ...place, w: TILE,
        tiles: [{ id: askId(question), kind, dx: 0 }],
      });
      slot += 1;
    }
  });
  nodes.push({
    id: CLOSE, type: "close", ...at(closeAt, { x: slot * SLOT, y: ROW_Y }), w: TILE,
    tiles: [{ id: CLOSE, kind: "close", dx: 0 }],
  });
  return nodes;
}

// ── connectors ──────────────────────────────────────────────────────────────

const out = (node) => ({ x: node.x + node.w, y: node.y + TILE / 2 });
const into = (node) => ({ x: node.x, y: node.y + TILE / 2 });

/**
 * The curve from one node to the next, as control points. Side to side it leaves the right edge and enters
 * the left; when the next node is well below, it leaves under the name and enters from the top, so a column
 * of nodes reads as a column rather than a row of loops.
 */
function curve(a, b) {
  const lastTile = a.x + a.w - TILE / 2;
  const firstTile = b.x + TILE / 2;
  const down = b.y - (a.y + NODE_H);
  if (down > 24 && Math.abs(firstTile - lastTile) < down * 1.2) {
    const from = { x: lastTile, y: a.y + NODE_H - 6 };
    const to = { x: firstTile, y: b.y - 4 };
    const reach = Math.max(36, Math.min(140, (to.y - from.y) / 2));
    return [from, { x: from.x, y: from.y + reach }, { x: to.x, y: to.y - reach }, to];
  }
  const from = out(a), to = into(b);
  const reach = Math.max(48, Math.min(180, Math.abs(to.x - from.x) / 2));
  return [from, { x: from.x + reach, y: from.y }, { x: to.x - reach, y: to.y }, to];
}

const at = (curvePoints, t) => {
  const [a, b, c, d] = curvePoints;
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

export const pathOf = (points) => `M${points[0].x} ${points[0].y} C${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y} ${points[3].x} ${points[3].y}`;

/**
 * The connectors between consecutive nodes. Connector `i` is the place a question can be put to become
 * question `i`: between the node before it and the node after.
 */
export function connectorsOf(nodes) {
  const found = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const points = curve(nodes[i], nodes[i + 1]);
    found.push({
      index: i, from: nodes[i].id, to: nodes[i + 1].id, points, d: pathOf(points),
      samples: Array.from({ length: 25 }, (_, step) => at(points, step / 24)),
      middle: at(points, 0.5),
    });
  }
  return found;
}

/** A step that waits on an earlier answer, joined to the question it waits on by an arch above them. */
export function joinsOf(nodes) {
  const found = [];
  for (const node of nodes) {
    const want = node.question?.only_if;
    if (!want) continue;
    const parent = nodes.find((other) => other.kind === "ask" && other.index < node.index && other.question.save_as === want);
    if (!parent) continue;
    const from = { x: parent.x + TILE / 2 + 8, y: parent.y };
    const to = { x: node.x + TILE / 2 - 8, y: node.y };
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    const rise = Math.max(54, Math.min(170, 44 + span * 0.14));
    const top = Math.min(from.y, to.y) - rise;
    const points = [from, { x: from.x, y: top }, { x: to.x, y: top }, to];
    found.push({ node, parent, points, d: pathOf(points), label: at(points, 0.5), to });
  }
  return found;
}

// ── where a point is ────────────────────────────────────────────────────────

const near = (point, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const along = dx || dy ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(point.x - (a.x + dx * along), point.y - (a.y + dy * along));
};

/**
 * What is under a point of the canvas: a node (its tiles and the name under them), else the nearest
 * connector within `reach`, else nothing. `skip` is a node to look past: the one being dragged.
 */
export function hitTest(point, nodes, connectors, { reach = 30, skip = "" } = {}) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.id === skip) continue;
    if (point.x >= node.x - 8 && point.x <= node.x + node.w + 8 && point.y >= node.y - 8 && point.y <= node.y + NODE_H) {
      return { type: "node", node };
    }
  }
  let best = null;
  for (const connector of connectors) {
    if (connector.from === skip || connector.to === skip) continue;
    for (let i = 0; i < connector.samples.length - 1; i++) {
      const gap = near(point, connector.samples[i], connector.samples[i + 1]);
      if (gap <= reach && (!best || gap < best.gap)) best = { type: "connector", connector, gap };
    }
  }
  return best;
}

/** The box round everything, for fitting it to the screen and for the overview. */
export function boundsOf(nodes, joins = []) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const node of nodes) {
    // The call-start bubble hangs off the greeting's left.
    left = Math.min(left, node.x - (node.type === "open" ? 170 : 0));
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.w + (node.type === "close" ? 0 : 0));
    bottom = Math.max(bottom, node.y + NODE_H);
  }
  for (const join of joins) top = Math.min(top, ...join.points.map((point) => point.y));
  return { left, top: top - 28, right, bottom, width: right - left, height: bottom - top + 28 };
}

// ── tidying ─────────────────────────────────────────────────────────────────

export const TIDY = {
  horizontal: { label: "Horizontal", hint: "One line, left to right" },
  vertical: { label: "Vertical", hint: "Top to bottom" },
  snake: { label: "Wrapped", hint: "Rows of four, like a page" },
};

/**
 * New places for every node. `null` is "clear them": back to the default horizontal line.
 * Returns {open, close, spots: {key: [x, y]}}.
 */
export function tidy(questions, mode) {
  if (mode === "horizontal") return null;
  const nodes = layoutNodes(questions.map((one) => ({ ...one, x: null, y: null })));
  const pitchY = NODE_H + 70;
  const place = (index) => {
    if (mode === "vertical") return [0, ROW_Y + index * pitchY];
    const perRow = 4, pitchX = PAIR_W + 110;
    return [(index % perRow) * pitchX, ROW_Y + Math.floor(index / perRow) * pitchY];
  };
  const spots = {};
  nodes.forEach((node, index) => {
    if (node.type === "question") spots[node.id] = place(index);
  });
  return { open: place(0), close: place(nodes.length - 1), spots };
}
