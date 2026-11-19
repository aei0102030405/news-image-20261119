// news-image-20261119 — one image summing up Thursday 19 November 2026.
// A Node 22 program, standard library only. It draws a newspaper front page
// (masthead, date, six stories) with a built-in 5x7 bitmap font and writes
// it as a PNG to /output/entry.png. No network, no clock, no randomness:
// every run produces the same bytes.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;

// Palette: warm newsprint paper, near-black ink, one red and one blue accent.
const PAPER: [number, number, number] = [247, 243, 232];
const INK: [number, number, number] = [26, 26, 26];
const RED: [number, number, number] = [185, 28, 28];
const BLUE: [number, number, number] = [30, 64, 175];
const GREY: [number, number, number] = [168, 162, 158];
const WHITE: [number, number, number] = [255, 255, 255];

const fb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  fb[i * 3] = PAPER[0];
  fb[i * 3 + 1] = PAPER[1];
  fb[i * 3 + 2] = PAPER[2];
}

function px(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) px(i, j, c);
  }
}

function hrule(x: number, y: number, w: number, thick: number, c: [number, number, number]): void {
  rect(x, y, w, thick, c);
}

// ---------------------------------------------------------------- PNG
// CRC-32 (IEEE) table, built once.
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Encode an RGB framebuffer as a PNG (8-bit, colour type 2, filter 0).
function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive (we emit filter 0 per row)
  ihdr[12] = 0; // interlace: none
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- font
// A 5x7 bitmap font. Each glyph is 7 rows; each row is a 5-bit pattern,
// bit 4 = leftmost pixel. Only the characters the page uses are defined;
// drawText uppercases everything, so only capitals are needed.
const FONT: Record<string, number[]> = {
  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '"': [0x0a, 0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00],
  "#": [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "%": [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x18],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "*": [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00],
  "+": [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  "-": [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ":": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  ";": [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x04, 0x08],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  "=": [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "@": [0x0e, 0x11, 0x01, 0x0d, 0x15, 0x15, 0x0e],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
  "\\": [0x10, 0x08, 0x08, 0x04, 0x02, 0x02, 0x01],
  "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
  "^": [0x04, 0x0a, 0x11, 0x00, 0x00, 0x00, 0x00],
  _: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f],
  "`": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
};

// One glyph cell is 6*scale wide (5 px glyph + 1 px gap); the last cell of
// a string drops its trailing gap.
function textWidth(s: string, scale: number): number {
  return s.length === 0 ? 0 : s.length * 6 * scale - scale;
}

function drawText(x: number, y: number, s: string, scale: number, color: [number, number, number]): void {
  const str = s.toUpperCase();
  let cx = x;
  for (const ch of str) {
    const g = FONT[ch];
    if (g) {
      for (let r = 0; r < 7; r++) {
        const row = g[r];
        for (let col = 0; col < 5; col++) {
          if (row & (1 << (4 - col))) rect(cx + col * scale, y + r * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, color: [number, number, number]): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, color);
}

// ---------------------------------------------------------------- news
// The day's news, as reported on 19 November 2026. All facts are baked
// into the program because it runs with no network.
type Story = { tag: string; headline: string; summary: string };

const LEAD: Story = {
  tag: "POLITICS",
  headline: "TRUMP, XI AND PUTIN MEET IN SHENZHEN",
  summary: "THREE LEADERS HOLD TRILATERAL TALKS AT THE APEC SUMMIT IN CHINA",
};

const STORIES: Story[] = [
  {
    tag: "GAMES",
    headline: "GTA VI LAUNCHES AFTER 13-YEAR WAIT",
    summary: "GAMERS ENTER VICE CITY AS ROCKSTAR'S SEQUEL ROLLS OUT GLOBALLY",
  },
  {
    tag: "TECH",
    headline: "ANTHROPIC IN RECORD $81.3BN IPO",
    summary: "CLAUDE MAKER'S SHARES DEBUT TODAY AFTER THE BIGGEST IPO EVER",
  },
  {
    tag: "SPACE",
    headline: "VOYAGER 1 REACHES ONE LIGHT-DAY",
    summary: "NASA PROBE, 50 YEARS AFTER LAUNCH, HITS A RECORD DISTANCE",
  },
  {
    tag: "CONFLICT",
    headline: "ISRAELI TANKS CROSS GAZA CEASEFIRE",
    summary: "RARE GROUND INCURSION BEYOND THE YELLOW LINE, ARMY SAYS",
  },
  {
    tag: "ART",
    headline: "VAN GOGH SELLS FOR RECORD $190.4M",
    summary: "PAINTING FETCHES A RECORD PRICE DESPITE A NAZI-ERA DISPUTE",
  },
];

// ---------------------------------------------------------------- layout
const MARGIN = 48;
const RIGHT = W - MARGIN;

function drawTagChip(x: number, y: number, label: string): void {
  const w = textWidth(label, 2) + 20;
  rect(x, y, w, 26, RED);
  drawText(x + 10, y + 6, label, 2, WHITE);
}

function drawPage(): void {
  // Ink frame.
  rect(0, 0, W, 10, INK);
  rect(0, H - 10, W, 10, INK);
  rect(0, 0, 10, H, INK);
  rect(W - 10, 0, 10, H, INK);

  // Masthead.
  drawTextCentered(Math.floor(W / 2), 36, "WORLD NEWS", 9, INK);
  drawTextCentered(Math.floor(W / 2), 112, "THURSDAY 19 NOVEMBER 2026", 4, RED);
  hrule(MARGIN, 158, RIGHT - MARGIN, 4, INK);

  // Lead story.
  drawTagChip(MARGIN, 182, LEAD.tag);
  drawText(MARGIN, 222, LEAD.headline, 4, INK);
  drawText(MARGIN, 262, LEAD.summary, 2, INK);
  hrule(MARGIN, 296, RIGHT - MARGIN, 1, GREY);

  // The five remaining stories, one row each.
  const rows = [316, 428, 540, 652, 764];
  for (let i = 0; i < STORIES.length; i++) {
    const s = STORIES[i];
    const y0 = rows[i];
    // Number badge.
    rect(MARGIN, y0, 56, 56, BLUE);
    drawText(MARGIN + 16, y0 + 14, String(i + 2), 4, WHITE);
    // Tag, headline, summary.
    drawText(MARGIN + 76, y0 + 4, s.tag, 2, RED);
    drawText(MARGIN + 76, y0 + 26, s.headline, 4, INK);
    drawText(MARGIN + 76, y0 + 62, s.summary, 2, INK);
    hrule(MARGIN, y0 + 94, RIGHT - MARGIN, 1, GREY);
  }

  // Footer.
  hrule(MARGIN, 884, RIGHT - MARGIN, 3, INK);
  drawTextCentered(Math.floor(W / 2), 904, "MAKE.FUN - ONE DAY'S NEWS IN ONE IMAGE", 2, INK);
  drawTextCentered(Math.floor(W / 2), 928, "STORIES AS REPORTED ON THURSDAY 19 NOVEMBER 2026", 2, INK);
}

// ---------------------------------------------------------------- main
function main(): void {
  drawPage();
  const png = encodePng(W, H, fb);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.png");
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
}

main();
