// 설치형 웹앱 아이콘(192·512 PNG)을 빌드할 때 만듭니다. 저장소에는 바이너리 파일을 넣지 않습니다.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, crc]);
};

// 남색 바탕, 청록 테두리, 흰 자물쇠 모양(원 + 막대)
export function iconPng(size) {
  const bg = [16, 26, 40]; const line = [88, 195, 204]; const fg = [236, 244, 255];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const m = size / 6; const w = Math.max(4, size / 24); const cx = size / 2; const cy = size / 2 - size / 20; const r = size / 7;
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const onFrame = x >= m && x <= size - m && y >= m && y <= size - m
        && (x < m + w || x > size - m - w || y < m + w || y > size - m - w);
      const d = Math.hypot(x - cx, y - cy);
      const onRing = Math.abs(d - r) < w / 1.6;
      const onBar = Math.abs(x - cx) < size / 40 && y > cy + r && y < cy + r + size / 5;
      const color = onRing || onBar ? fg : onFrame ? line : bg;
      raw.set(color, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
