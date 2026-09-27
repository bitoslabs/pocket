/**
 * Generate the PWA icon set (assets/icons/icon-<size>.png).
 *
 * Pure Node (no dependencies): an open journal around a Lightning bolt.
 * The SVG master and PNG icons use the same geometry and colours.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const COLORS = {
  background: [27, 19, 48], // #1B1330
  page: [167, 139, 250], // #A78BFA
  bolt: [255, 194, 75], // #FFC24B
};

// Coordinates in a 100 × 100 square. Wide shapes remain legible at small sizes.
const SHAPES = [
  { color: 'page', points: [[17, 30], [30, 26], [44, 30], [44, 70], [30, 66], [17, 69]] },
  { color: 'page', points: [[56, 30], [70, 26], [83, 30], [83, 69], [70, 66], [56, 70]] },
  { color: 'bolt', points: [[57, 14], [41, 49], [52, 49], [45, 86], [68, 43], [55, 43], [63, 14]] },
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const nx = (x + (sx + 0.5) / 4) * 100 / size;
          const ny = (y + (sy + 0.5) / 4) * 100 / size;
          const dx = Math.max(22 - nx, nx - 78, 0);
          const dy = Math.max(22 - ny, ny - 78, 0);
          if (Math.hypot(dx, dy) > 22) continue;
          let color = COLORS.background;
          for (const shape of SHAPES) {
            if (inPolygon(nx, ny, shape.points)) color = COLORS[shape.color];
          }
          for (let channel = 0; channel < 3; channel++) sums[channel] += color[channel];
          sums[3]++;
        }
      }
      const i = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        px[i + channel] = sums[3] ? Math.round(sums[channel] / sums[3]) : 0;
      }
      px[i + 3] = Math.round(sums[3] * 255 / 16);
    }
  }
  return encodePng(size, px);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'assets', 'icons');
mkdirSync(outDir, { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-labelledby="title">
  <title id="title">ZapJournal: an open journal and lightning bolt</title>
  <rect width="100" height="100" rx="22" fill="#1B1330"/>
${SHAPES.map(({ color, points }) => `  <polygon points="${points.map((point) => point.join(',')).join(' ')}" fill="#${COLORS[color].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}"/>`).join('\n')}
</svg>\n`;
writeFileSync(join(outDir, 'logo-mark.svg'), svg);

for (const size of SIZES) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`wrote ${file}`);
}
