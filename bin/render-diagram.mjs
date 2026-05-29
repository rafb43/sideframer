#!/usr/bin/env node
// Render a sideframer diagram (JSON) to a standalone SVG file.
//
// Usage:
//   node bin/render-diagram.mjs diagram.json -o out.svg
//   cat diagram.json | node bin/render-diagram.mjs -o out.svg
//   node bin/render-diagram.mjs diagram.json   # writes to stdout
//
// The SVG is self-contained (inline <style>, no external assets) so it can
// be opened directly in a browser, Preview, or any SVG-aware viewer.

import { readFileSync, writeFileSync } from "node:fs";

const CANVAS_W = 1600;
const CANVAS_H = 1000;
const PAD = 88;
const CENTER_W = 360;
const CENTER_H = 200;
const CENTER_X = (CANVAS_W - CENTER_W) / 2;
const CENTER_Y = (CANVAS_H - CENTER_H) / 2;
const CENTER_ID = "@center";

const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENT[c]);

function findEndpoint(state, id) {
  if (id === CENTER_ID) return { x: CENTER_X, y: CENTER_Y, w: CENTER_W, h: CENTER_H };
  const box = (state.boxes ?? []).find((b) => b.id === id);
  if (!box) return null;
  if (box.shape === "user") {
    const m = userFigureMetrics(box);
    const halfW = Math.max(m.armSpan, m.headR);
    const cx = box.x + box.w / 2;
    return { x: cx - halfW, y: box.y, w: halfW * 2, h: box.h };
  }
  return box;
}

function userFigureMetrics(b) {
  const figureH = b.h * 0.62;
  const headR = Math.min(figureH * 0.2, b.w * 0.18);
  const armSpan = Math.min(figureH * 0.3, b.w * 0.36);
  const legSpan = Math.min(figureH * 0.22, b.w * 0.24);
  return { figureH, headR, armSpan, legSpan };
}

function rectBoundary(r, toX, toY) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toX - cx;
  const dy = toY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const tx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + t * dx, y: cy + t * dy };
}

function renderShape(b, fill, stroke, sw) {
  const { x, y, w, h } = b;
  const a = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  switch (b.shape) {
    case "rect":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
    case "rounded":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" ${a}/>`;
    case "document":
      return `<path d="M ${x},${y} L ${x + w},${y} L ${x + w},${y + h * 0.85} C ${x + w * 0.75},${y + h * 1.05} ${x + w * 0.25},${y + h * 0.7} ${x},${y + h * 0.85} Z" ${a}/>`;
    case "subprocess":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>
        <line x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/>
        <line x1="${x + w - 8}" y1="${y}" x2="${x + w - 8}" y2="${y + h}" stroke="${stroke}" stroke-width="${sw}"/>`;
    case "database": {
      const eh = Math.min(10, Math.max(3, h * 0.2));
      return `<path d="M ${x},${y + eh} L ${x},${y + h - eh} C ${x},${y + h + eh * 0.5} ${x + w},${y + h + eh * 0.5} ${x + w},${y + h - eh} L ${x + w},${y + eh} Z" ${a}/>
        <ellipse cx="${x + w / 2}" cy="${y + eh}" rx="${w / 2}" ry="${eh}" ${a}/>`;
    }
    case "server": {
      const sOff = Math.min(13, Math.max(4, h * 0.22));
      const cOff = Math.min(7, Math.max(3, h * 0.12));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" ${a}/>
        <line x1="${x}" y1="${y + sOff}" x2="${x + w}" y2="${y + sOff}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <line x1="${x}" y1="${y + h - sOff}" x2="${x + w}" y2="${y + h - sOff}" stroke="${stroke}" stroke-width="${sw}" opacity="0.5"/>
        <circle cx="${x + w - 10}" cy="${y + cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 10}" cy="${y + h - cOff}" r="1.5" fill="${stroke}"/>
        <circle cx="${x + w - 16}" cy="${y + h - cOff}" r="1.5" fill="${stroke}"/>`;
    }
    case "cloud": {
      const sx = w / 22;
      const sy = h / 15;
      return `<path transform="translate(${x - 1 * sx},${y - 4.5 * sy}) scale(${sx},${sy})" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" ${a} vector-effect="non-scaling-stroke"/>`;
    }
    case "user": {
      const { figureH, headR, armSpan, legSpan } = userFigureMetrics(b);
      const cx = x + w / 2;
      const headCy = y + headR + figureH * 0.04;
      const neckTop = headCy + headR;
      const waistY = y + figureH * 0.62;
      const feetY = y + figureH;
      const armsY = neckTop + (waistY - neckTop) * 0.35;
      const line = `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" fill="none"`;
      return `<circle cx="${cx}" cy="${headCy}" r="${headR}" ${a}/>
        <line x1="${cx}" y1="${neckTop}" x2="${cx}" y2="${waistY}" ${line}/>
        <line x1="${cx - armSpan}" y1="${armsY}" x2="${cx + armSpan}" y2="${armsY}" ${line}/>
        <line x1="${cx}" y1="${waistY}" x2="${cx - legSpan}" y2="${feetY}" ${line}/>
        <line x1="${cx}" y1="${waistY}" x2="${cx + legSpan}" y2="${feetY}" ${line}/>`;
    }
  }
  return "";
}

function renderBox(b) {
  const labelBelow = b.shape === "user";
  const labelY = labelBelow
    ? b.y + b.h - (b.sublabel ? 18 : 8)
    : b.y + b.h / 2 - (b.sublabel ? 8 : 0);
  const sublabelY = labelBelow ? b.y + b.h - 4 : b.y + b.h / 2 + 12;
  return `<g class="box" data-id="${esc(b.id)}">
    ${renderShape(b, "#ffffff", "#54524c", 1.5)}
    <text class="box-label" x="${b.x + b.w / 2}"
          y="${labelY}"
          text-anchor="middle" dominant-baseline="middle">${esc(b.label)}</text>
    ${b.sublabel
      ? `<text class="box-sublabel" x="${b.x + b.w / 2}" y="${sublabelY}"
            text-anchor="middle" dominant-baseline="middle">${esc(b.sublabel)}</text>`
      : ""}
  </g>`;
}

function renderConnector(state, c) {
  const from = findEndpoint(state, c.from);
  const to = findEndpoint(state, c.to);
  if (!from || !to) return "";
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const start = rectBoundary(from, toCx, toCy);
  const end = rectBoundary(to, fromCx, fromCy);
  return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="#54524c" stroke-width="1.5" marker-end="url(#arrow)"/>`;
}

function renderBackground(state) {
  switch (state.background) {
    case "clean":
      return `<rect width="100%" height="100%" fill="#fbfaf6"/>`;
    case "sections":
      return `<rect width="100%" height="100%" fill="#fbfaf6"/>
        <rect x="0" y="0" width="${CENTER_X}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <rect x="${CENTER_X + CENTER_W}" y="0" width="${CANVAS_W - CENTER_X - CENTER_W}" height="${CANVAS_H}" fill="#f4eddc" opacity="0.55"/>
        <line x1="${CENTER_X}" y1="${PAD}" x2="${CENTER_X}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>
        <line x1="${CENTER_X + CENTER_W}" y1="${PAD}" x2="${CENTER_X + CENTER_W}" y2="${CANVAS_H - PAD}" stroke="#d4ceb8" stroke-width="1" stroke-dasharray="3 6"/>`;
    case "diagonals":
      return `<rect width="100%" height="100%" fill="#fbfaf6"/>
        <line x1="${PAD}" y1="${PAD}" x2="${CANVAS_W - PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>
        <line x1="${CANVAS_W - PAD}" y1="${PAD}" x2="${PAD}" y2="${CANVAS_H - PAD}" stroke="#dcd6c4" stroke-width="1"/>`;
    case "gradient":
      return `<defs>
          <radialGradient id="bg-grad" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#efe7d2"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-grad)"/>`;
    case "grid":
    default:
      return `<defs>
          <pattern id="bg-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#eee8dc" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#fbfaf6"/>
        <rect width="100%" height="100%" fill="url(#bg-grid)"/>`;
  }
}

function buildSVG(state) {
  const sceneStr = state.scene ? `scene:  ${esc(state.scene)}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">
  <style>
    .axis { font: 600 12px Arial, Helvetica, sans-serif; letter-spacing: 4px; fill: #8a8678; }
    .scene-line { font: 13px Arial, Helvetica, sans-serif; fill: #6b685f; letter-spacing: 0.5px; }
    .center-label { font: 600 22px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .center-sublabel { font: 14px Arial, Helvetica, sans-serif; fill: #6b685f; }
    .box-label { font: 600 14px Arial, Helvetica, sans-serif; fill: #2a2a28; }
    .box-sublabel { font: 12px Arial, Helvetica, sans-serif; fill: #6b685f; }
  </style>
  <defs>
    <marker id="arrow" viewBox="-10 -5 10 10" refX="0" refY="0" markerWidth="10" markerHeight="10" orient="auto">
      <path d="M-10,-5 L0,0 L-10,5 Z" fill="#54524c"/>
    </marker>
  </defs>

  ${renderBackground(state)}

  <rect x="${PAD}" y="${PAD}" width="${CANVAS_W - 2 * PAD}" height="${CANVAS_H - 2 * PAD}" fill="none" stroke="#c8c4b8" stroke-width="2" rx="6"/>

  <text class="axis" x="${CANVAS_W / 2}" y="${PAD - 30}" text-anchor="middle">DEPENDENCIES</text>
  <text class="axis" x="${CANVAS_W / 2}" y="${CANVAS_H - PAD + 48}" text-anchor="middle">SIDE-EFFECTS</text>
  <text class="axis" x="${PAD - 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(-90, ${PAD - 38}, ${CANVAS_H / 2})">INPUT</text>
  <text class="axis" x="${CANVAS_W - PAD + 38}" y="${CANVAS_H / 2}" text-anchor="middle"
        transform="rotate(90, ${CANVAS_W - PAD + 38}, ${CANVAS_H / 2})">OUTPUT</text>

  <text class="scene-line" x="${PAD}" y="${PAD - 56}">${sceneStr}</text>

  ${(state.connectors ?? []).map((c) => renderConnector(state, c)).filter(Boolean).join("\n  ")}

  <g class="center">
    <rect x="${CENTER_X}" y="${CENTER_Y}" width="${CENTER_W}" height="${CENTER_H}" fill="#ffffff" stroke="#2a2a28" stroke-width="2.5" rx="8"/>
    <text class="center-label" x="${CENTER_X + CENTER_W / 2}"
          y="${CENTER_Y + CENTER_H / 2 - (state.centerSublabel ? 10 : 0)}"
          text-anchor="middle" dominant-baseline="middle">${esc(state.centerLabel)}</text>
    ${state.centerSublabel
      ? `<text class="center-sublabel" x="${CENTER_X + CENTER_W / 2}" y="${CENTER_Y + CENTER_H / 2 + 18}"
            text-anchor="middle" dominant-baseline="middle">${esc(state.centerSublabel)}</text>`
      : ""}
  </g>

  ${(state.boxes ?? []).map(renderBox).join("\n  ")}
</svg>`;
}

// ---- CLI ----

const args = process.argv.slice(2);
let outPath = null;
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-o" || a === "--output") {
    outPath = args[++i];
  } else if (a.startsWith("--output=")) {
    outPath = a.slice(9);
  } else if (a === "-h" || a === "--help") {
    process.stderr.write("usage: render-diagram.mjs [-o output.svg] [file]\n");
    process.exit(0);
  } else {
    positional.push(a);
  }
}

const input = positional[0]
  ? readFileSync(positional[0], "utf8")
  : readFileSync(0, "utf8");

let state;
try {
  state = JSON.parse(input);
} catch (e) {
  process.stderr.write(`invalid JSON: ${e.message}\n`);
  process.exit(1);
}

const svg = buildSVG(state);

if (outPath) {
  writeFileSync(outPath, svg, "utf8");
  process.stdout.write(`${outPath}\n`);
} else {
  process.stdout.write(svg);
}
