// Generates src-tauri/icons/source.png (1024x1024) without external deps.
// Simple, crisp app mark: dark rounded square + green "F" glyph.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const R = 200; // corner radius

const px = new Uint8Array(SIZE * SIZE * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function insideRounded(x, y) {
  const cx = Math.min(Math.max(x, R), SIZE - R);
  const cy = Math.min(Math.max(y, R), SIZE - R);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}

// Background
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (insideRounded(x, y)) {
      setPx(x, y, 0x0d, 0x0e, 0x10);
    }
  }
}

// "F" glyph built from rectangles: stem + two arms, with rounded-ish ends.
// Colors: accent #7CB342, darker accent #5A8A2E for depth.
const ACCENT = [0x7c, 0xb3, 0x42];
const DARK = [0x4e, 0x7a, 0x2a];

function rect(x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPx(x, y, color[0], color[1], color[2]);
    }
  }
}

// Stem
rect(300, 232, 420, 792, ACCENT);
// Top arm
rect(300, 232, 724, 352, ACCENT);
// Middle arm
rect(300, 452, 664, 552, DARK);
// Underline tick (subtle, developer-mark feel)
rect(300, 812, 520, 836, ACCENT);

// Anti-aliased rounded corners for glyph ends: soften by clearing
// the extreme corner pixels of the stem/arms slightly is skipped for
// simplicity - solid rectangles read cleanly at icon sizes.

// Encode PNG
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// raw scanlines with filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (SIZE * 4 + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "source.png");
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
