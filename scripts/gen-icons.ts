// One-off generator for the PWA icons (dependency-free PNG encoder). Run: npx tsx scripts/gen-icons.ts
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Blue tile with a white globe (circle + meridians + equator). `safe` shrinks the globe into the maskable safe zone. */
function icon(size: number, rounded: boolean, safe: number): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const R = size * 0.5 * safe * 0.62;
  const line = Math.max(1.5, size / 64);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      let inside = true;
      if (rounded) {
        const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
        const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
        inside = dx * dx + dy * dy <= radius * radius;
      }
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      const onRing = Math.abs(d - R) < line;
      const onEquator = Math.abs(dy) < line / 1.2 && d < R;
      const meridian = Math.abs((dx * dx) / (R * 0.5) ** 2 + (dy * dy) / R ** 2 - 1) < 0.09 && d < R;
      const stem = Math.abs(dx) < line / 1.2 && d < R;
      const white = onRing || onEquator || meridian || stem;
      const [r, g, b] = white ? [255, 255, 255] : [31, 58, 95];
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, true, 1));
writeFileSync('public/icons/icon-512.png', icon(512, true, 1));
writeFileSync('public/icons/maskable-512.png', icon(512, false, 0.8));
