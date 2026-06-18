// node assets/make_icon.js  →  assets/icon.png  (128x128)
const fs = require('fs'), path = require('path');

const SIZE = 128;
function writePNG(w, h, pixels, outPath) {
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let v = i; for (let j = 0; j < 8; j++) v = (v & 1) ? 0xEDB88320 ^ (v >>> 1) : v >>> 1; t[i] = v; }
    for (const b of buf) c = t[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const tb = Buffer.from(type), len = Buffer.alloc(4), crcBuf = Buffer.concat([tb, data]);
    len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, tb, data, c]);
  }
  function deflate(raw) {
    const zlib = require('zlib'); return zlib.deflateSync(raw, { level: 9 });
  }
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const p = pixels[(y * w + x) * 4];
      raw[i] = pixels[(y * w + x) * 4];
      raw[i+1] = pixels[(y * w + x) * 4 + 1];
      raw[i+2] = pixels[(y * w + x) * 4 + 2];
      raw[i+3] = pixels[(y * w + x) * 4 + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; // 8-bit RGB — override below
  const ihdr2 = Buffer.alloc(13);
  ihdr2.writeUInt32BE(w,0); ihdr2.writeUInt32BE(h,4);
  ihdr2[8]=8; ihdr2[9]=6; // RGBA
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const out = Buffer.concat([sig, chunk('IHDR', ihdr2), chunk('IDAT', deflate(raw)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(outPath, out);
}

const px = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const i = (y * SIZE + x) * 4;
  const cx = x - SIZE/2, cy = y - SIZE/2, r = Math.sqrt(cx*cx+cy*cy);
  // fondo oscuro con gradiente
  if (r < SIZE/2 - 2) {
    const t = r / (SIZE/2);
    px[i]   = Math.round(15 + t*20);   // R
    px[i+1] = Math.round(17 + t*10);   // G
    px[i+2] = Math.round(40 + t*20);   // B
    px[i+3] = 255;
    // letra C en blanco
    const lx = x - SIZE*0.28, ly = y - SIZE*0.5;
    const arcR = SIZE*0.28, thick = SIZE*0.09;
    const ar = Math.sqrt(lx*lx+ly*ly);
    const ang = Math.atan2(ly, lx);
    if (ar > arcR-thick && ar < arcR+thick && !(ang > -0.5 && ang < 0.5)) {
      px[i]=240; px[i+1]=240; px[i+2]=255; px[i+3]=255;
    }
  } else { px[i+3]=0; }
}
writePNG(SIZE, SIZE, px, path.join(__dirname, 'icon.png'));
console.log('icon.png generado');
