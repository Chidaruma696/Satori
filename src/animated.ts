// Writers for the two animated image formats browsers have no encoder for: APNG and
// animated WebP. Both take RGBA frames of a fixed size and, after the first one, store
// only the rectangle that changed, which is most of the win on a screen recording.
// APNG is assembled by hand (deflate from CompressionStream); WebP frames come from the
// canvas encoder and are wrapped into the animated container here.

import type { Rect } from './export';

/** Thrown when the browser's canvas cannot write WebP (Safari returns a PNG instead). */
export class NoWebpEncoder extends Error {
  constructor() {
    super('This browser cannot encode WebP. Try APNG or GIF.');
  }
}

/** Bounding box of the pixels that differ between two frames, or null when none do. */
function changedRect(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number, height: number): Rect | null {
  const ua = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
  const ub = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let x = 0;
    while (x < width && ua[row + x] === ub[row + x]) x++;
    if (x === width) continue;
    let x2 = width - 1;
    while (ua[row + x2] === ub[row + x2]) x2--;
    if (x < minX) minX = x;
    if (x2 > maxX) maxX = x2;
    if (minY === height) minY = y;
    maxY = y;
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** The region a frame has to store: everything for the first, the changes after that. */
function regionOf(data: Uint8ClampedArray, previous: Uint8ClampedArray | null, width: number, height: number): Rect {
  if (!previous) return { left: 0, top: 0, width, height };
  // Identical frames reach here only when a long still is split; one pixel is enough.
  return changedRect(data, previous, width, height) ?? { left: 0, top: 0, width: 1, height: 1 };
}

function subImage(data: Uint8ClampedArray, width: number, r: Rect): Uint8ClampedArray {
  if (r.left === 0 && r.width === width) return data.subarray(r.top * width * 4, (r.top + r.height) * width * 4);
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.top + y) * width + r.left) * 4;
    out.set(data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return out;
}

// ---------------------------------------------------------------- APNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * RGB scanlines, each with the PNG filter that leaves the smallest sum of absolute
 * values (the usual heuristic: it is what makes deflate do well on screen content).
 */
function filteredRgb(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 3;
  const out = new Uint8Array(height * (stride + 1));
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const tries = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0, i = y * width * 4, j = 0; x < width; x++, i += 4, j += 3) {
      cur[j] = rgba[i];
      cur[j + 1] = rgba[i + 1];
      cur[j + 2] = rgba[i + 2];
    }
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = tries[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? cur[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
        const v = (cur[i] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 0xff;
        t[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const o = y * (stride + 1);
    out[o] = best;
    out.set(tries[best], o + 1);
    [prev, cur] = [cur, prev];
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class ApngWriter {
  private parts: Uint8Array[] = [];
  private previous: Uint8ClampedArray | null = null;
  private seq = 0;
  private frames = 0;
  private readonly width: number;
  private readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  /** `delay` in milliseconds; APNG keeps it in 16 bits, so at most 65535. */
  async add(data: Uint8ClampedArray, delay: number): Promise<void> {
    const r = regionOf(data, this.previous, this.width, this.height);
    const fctl = new Uint8Array(26);
    const v = new DataView(fctl.buffer);
    v.setUint32(0, this.seq++);
    v.setUint32(4, r.width);
    v.setUint32(8, r.height);
    v.setUint32(12, r.left);
    v.setUint32(16, r.top);
    v.setUint16(20, Math.min(delay, 0xffff));
    v.setUint16(22, 1000);
    // dispose_op 0 (leave it) and blend_op 0 (replace): each frame paints over the last.
    this.parts.push(pngChunk('fcTL', fctl));
    const zipped = await deflate(filteredRgb(subImage(data, this.width, r), r.width, r.height));
    if (this.frames === 0) {
      this.parts.push(pngChunk('IDAT', zipped));
    } else {
      const fdat = new Uint8Array(4 + zipped.length);
      new DataView(fdat.buffer).setUint32(0, this.seq++);
      fdat.set(zipped, 4);
      this.parts.push(pngChunk('fdAT', fdat));
    }
    this.previous = data;
    this.frames++;
  }

  finish(): Blob {
    const ihdr = new Uint8Array(13);
    const h = new DataView(ihdr.buffer);
    h.setUint32(0, this.width);
    h.setUint32(4, this.height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // truecolour: a screen has no transparency
    const actl = new Uint8Array(8);
    new DataView(actl.buffer).setUint32(0, this.frames); // num_plays stays 0: loop forever
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return new Blob(
      [signature, pngChunk('IHDR', ihdr), pngChunk('acTL', actl), ...this.parts, pngChunk('IEND', new Uint8Array(0))] as BlobPart[],
      { type: 'image/apng' },
    );
  }
}

// ---------------------------------------------------------------- animated WebP

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function setUint24(bytes: Uint8Array, at: number, value: number) {
  bytes[at] = value & 0xff;
  bytes[at + 1] = (value >> 8) & 0xff;
  bytes[at + 2] = (value >> 16) & 0xff;
}

/** The image chunks (VP8 / VP8L, plus ALPH if any) of a still WebP file, ready to nest. */
function imageChunks(file: Uint8Array): { chunks: Uint8Array; alpha: boolean } {
  if (fourcc(file, 0) !== 'RIFF' || fourcc(file, 8) !== 'WEBP') throw new NoWebpEncoder();
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const keep: Uint8Array[] = [];
  let alpha = false;
  for (let at = 12; at + 8 <= file.length; ) {
    const type = fourcc(file, at);
    const size = view.getUint32(at + 4, true);
    const padded = 8 + size + (size & 1);
    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') {
      keep.push(file.subarray(at, at + padded));
      if (type === 'ALPH') alpha = true;
    }
    at += padded;
  }
  const chunks = new Uint8Array(keep.reduce((n, c) => n + c.length, 0));
  keep.reduce((at, c) => (chunks.set(c, at), at + c.length), 0);
  return { chunks, alpha };
}

export class WebpWriter {
  private frames: Uint8Array[] = [];
  private previous: Uint8ClampedArray | null = null;
  private alpha = false;
  private readonly width: number;
  private readonly height: number;
  private readonly quality: number;

  /** `quality` from 0 to 1, as the canvas encoder takes it. */
  constructor(width: number, height: number, quality: number) {
    this.width = width;
    this.height = height;
    this.quality = quality;
  }

  /** `delay` in milliseconds. */
  async add(data: Uint8ClampedArray, delay: number): Promise<void> {
    const r = regionOf(data, this.previous, this.width, this.height);
    // Frame offsets are stored halved, so they must be even.
    const left = r.left & ~1, top = r.top & ~1;
    const region = { left, top, width: r.left + r.width - left, height: r.top + r.height - top };
    const canvas = new OffscreenCanvas(region.width, region.height);
    canvas.getContext('2d')!.putImageData(new ImageData(subImage(data, this.width, region).slice(), region.width, region.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: this.quality });
    if (blob.type !== 'image/webp') throw new NoWebpEncoder();
    const { chunks, alpha } = imageChunks(new Uint8Array(await blob.arrayBuffer()));
    this.alpha ||= alpha;

    const anmf = new Uint8Array(16 + chunks.length);
    setUint24(anmf, 0, left / 2);
    setUint24(anmf, 3, top / 2);
    setUint24(anmf, 6, region.width - 1);
    setUint24(anmf, 9, region.height - 1);
    setUint24(anmf, 12, delay);
    anmf[15] = 0b10; // do not blend, do not dispose: the frame replaces its rectangle
    anmf.set(chunks, 16);
    this.frames.push(riffChunk('ANMF', anmf));
    this.previous = data;
  }

  finish(): Blob {
    const vp8x = new Uint8Array(10);
    vp8x[0] = 0x02 | (this.alpha ? 0x10 : 0); // animation (+ alpha)
    setUint24(vp8x, 4, this.width - 1);
    setUint24(vp8x, 7, this.height - 1);
    const anim = new Uint8Array(6); // background colour 0, loop count 0 = forever
    const body = [riffChunk('VP8X', vp8x), riffChunk('ANIM', anim), ...this.frames];
    const size = 4 + body.reduce((n, c) => n + c.length, 0);
    const header = new Uint8Array(12);
    header.set([82, 73, 70, 70]); // RIFF
    new DataView(header.buffer).setUint32(4, size, true);
    header.set([87, 69, 66, 80], 8); // WEBP
    return new Blob([header, ...body] as BlobPart[], { type: 'image/webp' });
  }
}
