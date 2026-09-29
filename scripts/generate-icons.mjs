/**
 * Generate the PWA icon set (assets/icons/icon-<size>.png) from the
 * background-less icon (assets/icons/logo-icon.svg).
 *
 * Pure Node (no dependencies): a small SVG parser + supersampled scanline
 * rasterizer covering the subset used by the logo — <path> (M/L/H/V/C/S/Q/T/Z),
 * <polygon>, <rect> (with rx), <circle>/<ellipse>, solid fills, and class rules
 * declared in a <style> block. Shapes are painted in document order.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SUPERSAMPLE = 4;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const iconsDir = join(root, 'assets', 'icons');
const logoFile = join(iconsDir, 'logo-icon.svg');

// ---- path flattening ------------------------------------------------------

function tokenizePath(d) {
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match;
  while ((match = re.exec(d))) tokens.push(match[1] ?? parseFloat(match[2]));
  return tokens;
}

function segmentsOf(tokens) {
  const segments = [];
  for (const token of tokens) {
    if (typeof token === 'string') segments.push({ cmd: token, args: [] });
    else if (segments.length) segments[segments.length - 1].args.push(token);
  }
  return segments;
}

function flattenPath(d) {
  const subpaths = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let pcx = null;
  let pcy = null;
  let lastCmd = '';

  const start = (px, py) => {
    x = px;
    y = py;
    cur = [[px, py]];
    subpaths.push(cur);
  };
  const line = (px, py) => {
    if (!cur) start(x, y);
    x = px;
    y = py;
    cur.push([px, py]);
  };
  const curve = (c1x, c1y, c2x, c2y, px, py) => {
    if (!cur) start(x, y);
    const fromX = x;
    const fromY = y;
    const length =
      Math.hypot(c1x - fromX, c1y - fromY) +
      Math.hypot(c2x - c1x, c2y - c1y) +
      Math.hypot(px - c2x, py - c2y);
    const steps = Math.min(96, Math.max(8, Math.ceil(length / 2)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      const bx = mt * mt * mt * fromX + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * px;
      const by = mt * mt * mt * fromY + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * py;
      cur.push([bx, by]);
    }
    x = px;
    y = py;
  };

  for (const { cmd, args } of segmentsOf(tokenizePath(d))) {
    const rel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    let i = 0;

    if (upper === 'Z') {
      if (cur) cur = null;
      pcx = pcy = null;
      lastCmd = upper;
      continue;
    }

    if (upper === 'M' || upper === 'L' || upper === 'T') {
      let first = true;
      while (i + 1 < args.length) {
        const px = args[i++] + (rel ? x : 0);
        const py = args[i++] + (rel ? y : 0);
        if (upper === 'M' && first) start(px, py);
        else line(px, py);
        first = false;
        pcx = pcy = null;
        lastCmd = 'L';
      }
      continue;
    }

    if (upper === 'H' || upper === 'V') {
      while (i < args.length) {
        if (upper === 'H') line(args[i++] + (rel ? x : 0), y);
        else line(x, args[i++] + (rel ? y : 0));
        pcx = pcy = null;
        lastCmd = 'L';
      }
      continue;
    }

    if (upper === 'C' || upper === 'S') {
      while (i + (upper === 'S' ? 3 : 5) < args.length) {
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        let c1x;
        let c1y;
        let c2x;
        let c2y;
        if (upper === 'C') {
          c1x = args[i++] + ox;
          c1y = args[i++] + oy;
        } else {
          const hasPrev = lastCmd === 'C' || lastCmd === 'S' || lastCmd === 'Q' || lastCmd === 'T';
          c1x = hasPrev ? 2 * x - pcx : x;
          c1y = hasPrev ? 2 * y - pcy : y;
        }
        c2x = args[i++] + ox;
        c2y = args[i++] + oy;
        const px = args[i++] + ox;
        const py = args[i++] + oy;
        curve(c1x, c1y, c2x, c2y, px, py);
        pcx = c2x;
        pcy = c2y;
        lastCmd = upper;
      }
      continue;
    }

    if (upper === 'Q') {
      while (i + 3 < args.length) {
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        const c1x = args[i++] + ox;
        const c1y = args[i++] + oy;
        const px = args[i++] + ox;
        const py = args[i++] + oy;
        curve(c1x, c1y, c1x, c1y, px, py);
        pcx = c1x;
        pcy = c1y;
        lastCmd = 'Q';
      }
      continue;
    }

    if (upper === 'A') {
      while (i + 6 < args.length) {
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        i += 5;
        line(args[i++] + ox, args[i++] + oy);
        pcx = pcy = null;
        lastCmd = 'L';
      }
      continue;
    }
  }

  return subpaths.filter((poly) => poly.length > 2);
}

// ---- element → polygons ---------------------------------------------------

function parseAttributes(source) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = re.exec(source))) attrs[match[1]] = match[2];
  return attrs;
}

function rectPolygon(attrs) {
  const x = parseFloat(attrs.x ?? 0);
  const y = parseFloat(attrs.y ?? 0);
  const w = parseFloat(attrs.width ?? 0);
  const h = parseFloat(attrs.height ?? 0);
  const rx = Math.min(parseFloat(attrs.rx ?? attrs.ry ?? 0), w / 2, h / 2);
  if (!(rx > 0)) return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
  const pts = [];
  const arc = (cx, cy, start) => {
    const step = Math.PI / 2 / 8;
    for (let a = start; a <= start + Math.PI / 2 + 1e-9; a += step) pts.push([cx + rx * Math.cos(a), cy + rx * Math.sin(a)]);
  };
  arc(x + w - rx, y + rx, -Math.PI / 2);
  arc(x + w - rx, y + h - rx, 0);
  arc(x + rx, y + h - rx, Math.PI / 2);
  arc(x + rx, y + rx, Math.PI);
  return [pts];
}

function ellipsePolygon(attrs) {
  const cx = parseFloat(attrs.cx ?? 0);
  const cy = parseFloat(attrs.cy ?? 0);
  const rx = parseFloat(attrs.rx ?? attrs.r ?? 0);
  const ry = parseFloat(attrs.ry ?? attrs.r ?? 0);
  const pts = [];
  const steps = 64;
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return [pts];
}

function polygonPoints(attrs) {
  const nums = (attrs.points ?? '').match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([parseFloat(nums[i]), parseFloat(nums[i + 1])]);
  return pts.length > 2 ? [pts] : [];
}

function colorOf(attrs, classFills) {
  const fill = attrs.fill ?? (attrs.class ? classFills[attrs.class] : undefined);
  if (!fill || fill === 'none' || fill === 'transparent') return null;
  const hex = fill.replace('#', '');
  const expand = (value) => (value.length === 1 ? value + value : value);
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return [0, 2, 4].map((i) => parseInt(expand(hex[i]), 16));
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return null;
}

function parseSvg(svg) {
  const viewBox = (svg.match(/viewBox\s*=\s*"([^"]*)"/)?.[1] ?? '0 0 100 100').trim().split(/[\s,]+/).map(Number);
  const [minX, minY, viewW, viewH] = viewBox.length === 4 ? viewBox : [0, 0, viewBox[2], viewBox[3]];

  const classFills = {};
  const style = svg.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '';
  for (const rule of style.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const fill = rule[2].match(/fill\s*:\s*(#[0-9a-fA-F]{3,8})/);
    if (fill) classFills[rule[1]] = fill[1];
  }

  const shapes = [];
  const elementRe = /<(path|rect|polygon|circle|ellipse)\b([^>]*?)\/?>/g;
  let element;
  while ((element = elementRe.exec(svg))) {
    const tag = element[1];
    const attrs = parseAttributes(element[2]);
    const color = colorOf(attrs, classFills);
    if (!color) continue;
    let subpaths = [];
    if (tag === 'path' && attrs.d) subpaths = flattenPath(attrs.d);
    else if (tag === 'rect') subpaths = rectPolygon(attrs);
    else if (tag === 'polygon') subpaths = polygonPoints(attrs);
    else if (tag === 'circle' || tag === 'ellipse') subpaths = ellipsePolygon(attrs);
    if (subpaths.length) shapes.push({ color, subpaths });
  }

  return { minX, minY, viewW, viewH, shapes };
}

// ---- rasterizer -----------------------------------------------------------

function rasterize(size, { minX, minY, viewW, viewH, shapes }) {
  const ss = SUPERSAMPLE;
  const w = size * ss;
  const h = size * ss;
  const scaleX = w / viewW;
  const scaleY = h / viewH;
  const buf = new Uint8ClampedArray(w * h * 4);

  for (const shape of shapes) {
    const edges = [];
    let minShapeY = Infinity;
    let maxShapeY = -Infinity;
    for (const poly of shape.subpaths) {
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        if (y1 === y2) continue;
        edges.push([x1, y1, x2, y2]);
        minShapeY = Math.min(minShapeY, y1, y2);
        maxShapeY = Math.max(maxShapeY, y1, y2);
      }
    }
    if (!edges.length) continue;

    const firstRow = Math.max(0, Math.floor((minShapeY - minY) * scaleY));
    const lastRow = Math.min(h - 1, Math.ceil((maxShapeY - minY) * scaleY));
    const crossings = [];

    for (let py = firstRow; py <= lastRow; py++) {
      const vy = (py + 0.5) / scaleY + minY;
      crossings.length = 0;
      for (const [x1, y1, x2, y2] of edges) {
        if ((y1 <= vy && y2 > vy) || (y2 <= vy && y1 > vy)) {
          const t = (vy - y1) / (y2 - y1);
          crossings.push([x1 + t * (x2 - x1), y2 > y1 ? 1 : -1]);
        }
      }
      if (!crossings.length) continue;
      crossings.sort((a, b) => a[0] - b[0]);

      let winding = 0;
      let spanStart = 0;
      for (const [vx, dir] of crossings) {
        const prev = winding;
        winding += dir;
        if (prev === 0 && winding !== 0) {
          spanStart = vx;
        } else if (prev !== 0 && winding === 0) {
          const from = Math.max(0, Math.round((spanStart - minX) * scaleX));
          const to = Math.min(w, Math.round((vx - minX) * scaleX));
          const row = py * w * 4;
          for (let px = from; px < to; px++) {
            const idx = row + px * 4;
            buf[idx] = shape.color[0];
            buf[idx + 1] = shape.color[1];
            buf[idx + 2] = shape.color[2];
            buf[idx + 3] = 255;
          }
        }
      }
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const area = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = ((y * ss + sy) * w + (x * ss + sx)) * 4;
          if (buf[idx + 3]) {
            r += buf[idx];
            g += buf[idx + 1];
            b += buf[idx + 2];
            covered++;
          }
        }
      }
      const outIdx = (y * size + x) * 4;
      if (covered) {
        out[outIdx] = Math.round(r / covered);
        out[outIdx + 1] = Math.round(g / covered);
        out[outIdx + 2] = Math.round(b / covered);
      }
      out[outIdx + 3] = Math.round((covered * 255) / area);
    }
  }
  return encodePng(size, out);
}

// ---- PNG encoder ----------------------------------------------------------

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

// ---- main -----------------------------------------------------------------

mkdirSync(iconsDir, { recursive: true });

// The compact UI mark keeps its own simplified geometry/colours and is written
// alongside the raster icons so `npm run icons` reproduces the whole set.
const MARK_COLORS = { background: '#1B1330', page: '#A78BFA', bolt: '#FFC24B' };
const MARK_SHAPES = [
  { color: 'page', points: [[17, 30], [30, 26], [44, 30], [44, 70], [30, 66], [17, 69]] },
  { color: 'page', points: [[56, 30], [70, 26], [83, 30], [83, 69], [70, 66], [56, 70]] },
  { color: 'bolt', points: [[57, 14], [41, 49], [52, 49], [45, 86], [68, 43], [55, 43], [63, 14]] },
];
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-labelledby="title">
  <title id="title">PocketZap: an open journal and lightning bolt</title>
  <rect width="100" height="100" rx="22" fill="${MARK_COLORS.background}"/>
${MARK_SHAPES.map(({ color, points }) => `  <polygon points="${points.map((point) => point.join(',')).join(' ')}" fill="${MARK_COLORS[color]}"/>`).join('\n')}
</svg>\n`;
writeFileSync(join(iconsDir, 'logo-mark.svg'), markSvg);
console.log(`wrote ${join(iconsDir, 'logo-mark.svg')}`);

const logo = parseSvg(readFileSync(logoFile, 'utf8'));
if (!logo.shapes.length) {
  console.error(`No drawable shapes found in ${logoFile}`);
  process.exit(1);
}

for (const size of SIZES) {
  const file = join(iconsDir, `icon-${size}.png`);
  writeFileSync(file, rasterize(size, logo));
  console.log(`wrote ${file}`);
}
