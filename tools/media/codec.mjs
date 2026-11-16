// Small image codecs for the media build, with no dependencies: read the 8-bit PNGs a browser screenshot
// produces, and write an animated GIF (per-frame 256-colour palette, LZW, looping).
import { inflateSync } from 'node:zlib'

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG into { width, height, rgba }. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8, width = 0, height = 0, type = 0, depth = 0, interlace = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len)
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12] }
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    pos += 12 + len
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`)
  const bpp = type === 6 ? 4 : 3, stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[dst + x] = v & 255
    }
  }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < width * height; i++, j += bpp) { rgba[i * 4] = px[j]; rgba[i * 4 + 1] = px[j + 1]; rgba[i * 4 + 2] = px[j + 2]; rgba[i * 4 + 3] = bpp === 4 ? px[j + 3] : 255 }
  return { width, height, rgba }
}

/** Picks up to 256 colours by popularity on a 15-bit grid and maps every pixel to its nearest one. */
function quantize(rgba) {
  const n = rgba.length / 4, counts = new Map(), sums = new Map()
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    const s = sums.get(key); if (s) { s[0] += r; s[1] += g; s[2] += b } else sums.set(key, [r, g, b])
  }
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 256)
  const palette = top.map(([key, c]) => sums.get(key).map((v) => Math.round(v / c)))
  while (palette.length < 256) palette.push([0, 0, 0])
  const nearest = new Map(), indices = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    let idx = nearest.get(key)
    if (idx === undefined) {
      let best = Infinity
      for (let p = 0; p < top.length; p++) {
        const [pr, pg, pb] = palette[p], d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
        if (d < best) { best = d; idx = p }
      }
      nearest.set(key, idx)
    }
    indices[i] = idx
  }
  return { palette, indices }
}

/** GIF LZW with an 8-bit minimum code size, as GIF89a decoders expect. */
function lzw(indices) {
  const MIN = 8, CLEAR = 1 << MIN, EOI = CLEAR + 1
  const out = []
  let acc = 0, nbits = 0, size = MIN + 1, next = EOI + 1
  const write = (code, bits) => { acc |= code << nbits; nbits += bits; while (nbits >= 8) { out.push(acc & 255); acc >>>= 8; nbits -= 8 } }
  const emit = (code) => { write(code, size); if (next > (1 << size) - 1 && size < 12) size++ }
  let dict = new Map()
  write(CLEAR, size)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = prefix * 256 + k, hit = dict.get(key)
    if (hit !== undefined) { prefix = hit; continue }
    emit(prefix)
    if (next < 4096) dict.set(key, next++)
    else { write(CLEAR, size); dict = new Map(); size = MIN + 1; next = EOI + 1 }
    prefix = k
  }
  emit(prefix)
  write(EOI, size)
  if (nbits > 0) out.push(acc & 255)
  return Buffer.from(out)
}

const u16 = (v) => Buffer.from([v & 255, (v >> 8) & 255])

/** Writes a looping animated GIF from frames of equal size: [{ width, height, rgba, delayMs }]. */
export function encodeGif(frames) {
  const { width, height } = frames[0]
  const parts = [Buffer.from('GIF89a', 'latin1'), u16(width), u16(height), Buffer.from([0x00, 0, 0])]
  parts.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([0x03, 0x01, 0, 0, 0]))
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('frames differ in size')
    const { palette, indices } = quantize(f.rgba)
    parts.push(Buffer.from([0x21, 0xf9, 0x04, 0x00]), u16(Math.round((f.delayMs ?? 1000) / 10)), Buffer.from([0, 0]))
    parts.push(Buffer.from([0x2c]), u16(0), u16(0), u16(width), u16(height), Buffer.from([0x87]))
    parts.push(Buffer.from(palette.flat()))
    const data = lzw(indices)
    parts.push(Buffer.from([8]))
    for (let i = 0; i < data.length; i += 255) { const chunk = data.subarray(i, i + 255); parts.push(Buffer.from([chunk.length]), chunk) }
    parts.push(Buffer.from([0]))
  }
  parts.push(Buffer.from([0x3b]))
  return Buffer.concat(parts)
}
