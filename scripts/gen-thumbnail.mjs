#!/usr/bin/env node
/** 從遊戲邏輯狀態渲染 640×480 封面幀（4:3） */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { applyAction, createGame, setPlayerBid, sealBid } from "../game.js";

const W = 640;
const H = 480;
const buf = new Uint8Array(W * H * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) setPx(x, y, r, g, b);
  }
}

function fillGrad() {
  for (let y = 0; y < H; y += 1) {
    const t = y / H;
    const r = Math.round(24 + t * 6);
    const g = Math.round(16 + t * 4);
    const b = Math.round(32 + t * 8);
    for (let x = 0; x < W; x += 1) setPx(x, y, r, g, b);
  }
}

function hex(c) {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

fillGrad();

let state = createGame({ seed: 42 });
state = applyAction(state, "continue");
state = setPlayerBid(state, 6);
state = sealBid(state);

const agenda = state.agenda.title;
const seats = [
  { x: 120, y: 340, c: "#e2bdff", label: "你", v: state.factions[0].prestige },
  { x: 520, y: 340, c: "#7eb8ff", label: "北", v: state.factions[1].prestige },
  { x: 120, y: 120, c: "#6fd6c6", label: "海", v: state.factions[2].prestige },
  { x: 520, y: 120, c: "#f0c06a", label: "沙", v: state.factions[3].prestige },
];

fillRect(200, 150, 440, 310, 0, 0, 0, 40);
fillRect(210, 160, 430, 300, 30, 24, 40);

for (const s of seats) {
  const [r, g, b] = hex(s.c);
  fillRect(s.x - 54, s.y - 40, s.x + 54, s.y + 40, r * 0.35, g * 0.35, b * 0.35);
  fillRect(s.x - 50, s.y - 36, s.x + 50, s.y + 36, r, g, b);
  fillRect(s.x - 20, s.y - 8, s.x + 20, s.y + 8, 20, 16, 24);
}

fillRect(250, 185, 390, 275, 18, 14, 28);
fillRect(255, 190, 385, 270, 36, 28, 52);
fillRect(265, 200, 375, 230, 226, 189, 255);

function drawBlockText(text, x, y, scale, color) {
  for (let i = 0; i < text.length; i += 1) {
    const ox = x + i * (scale * 6 + 4);
    fillRect(ox, y, ox + scale * 5, y + scale * 2, ...color);
    fillRect(ox, y + scale * 3, ox + scale * 5, y + scale * 5, ...color);
  }
}

drawBlockText("R3", 24, 24, 3, [226, 189, 255]);
drawBlockText("BID", 24, 56, 2, [111, 184, 255]);

if (state.reveal) {
  let y = 250;
  for (const b of state.reveal.bids.slice(0, 4)) {
    fillRect(270, y, 370, y + 14, 60, 50, 80);
    fillRect(380, y, 370 + b.bid * 8, y + 14, 226, 189, 255);
    y += 18;
  }
}

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c ^= data[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 4 + 1)] = 0;
  buf.slice(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
    raw[y * (W * 4 + 1) + 1 + i] = v;
  });
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const idat = deflateSync(raw, { level: 9 });
const out = Buffer.concat([
  sig,
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", idat),
  pngChunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../thumbnail.png", import.meta.url), out);
console.log("thumbnail.png", out.length, "bytes", agenda);
