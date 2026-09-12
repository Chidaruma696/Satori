// Everything that reads or writes media files: probing, the remux that makes a
// fresh MediaRecorder file seekable, and the three exports (MP4, WebM, GIF).
// Video work goes through mediabunny (WebCodecs underneath); GIF through gifenc.

import {
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  getFirstEncodableVideoCodec,
  type ConversionVideoOptions,
  type VideoCodec,
} from 'mediabunny';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Edit {
  /** Seconds. */
  trim: { start: number; end: number };
  /** In source pixels; null means the whole frame. */
  crop: Rect | null;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  frameRate: number;
}

export type VideoFormat = 'mp4' | 'webm';
export type VideoQuality = 'original' | 'high' | 'medium' | 'low';

export interface ExportResult {
  blob: Blob;
  warnings: string[];
}

// Only the containers a screen recording can come in; ALL_FORMATS would double the bundle.
const FORMATS = [WEBM, MATROSKA, MP4, QTFF];

function openInput(blob: Blob): Input {
  return new Input({ formats: FORMATS, source: new BlobSource(blob) });
}

export async function probe(blob: Blob): Promise<MediaInfo> {
  const input = openInput(blob);
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('No video track');
    const audio = await input.getPrimaryAudioTrack();
    const [duration, width, height, fps] = await Promise.all([
      input.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.computeFrameRateMetrics().then((m) => m.bestGuessFrameRate).catch(() => 30),
    ]);
    return { duration, width, height, hasAudio: audio !== null, frameRate: fps || 30 };
  } finally {
    input.dispose();
  }
}

/**
 * A file straight out of MediaRecorder has no duration or seek index, so the
 * <video> element cannot scrub it. Rewriting the container (packets copied,
 * nothing re-encoded) fixes that in a second or two.
 */
export async function remux(blob: Blob, onProgress: (p: number) => void): Promise<Blob> {
  const input = openInput(blob);
  const isMp4 = /mp4/i.test(blob.type);
  const output = new Output({
    format: isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  try {
    const conversion = await Conversion.init({ input, output });
    conversion.onProgress = onProgress;
    await conversion.execute();
    return new Blob([output.target.buffer!], { type: isMp4 ? 'video/mp4' : 'video/webm' });
  } finally {
    input.dispose();
  }
}

function qualityOf(q: VideoQuality) {
  return q === 'high' ? QUALITY_HIGH : q === 'low' ? QUALITY_LOW : QUALITY_MEDIUM;
}

function hasEdit(edit: Edit, info: MediaInfo): boolean {
  const trimmed = edit.trim.start > 0.001 || edit.trim.end < info.duration - 0.001;
  return trimmed || edit.crop !== null;
}

export async function exportVideo(
  source: Blob,
  info: MediaInfo,
  format: VideoFormat,
  quality: VideoQuality,
  edit: Edit,
  onProgress: (p: number) => void,
): Promise<ExportResult> {
  const warnings: string[] = [];
  const sameContainer = format === 'mp4' ? /mp4/i.test(source.type) : /webm/i.test(source.type);
  if (quality === 'original' && sameContainer && !hasEdit(edit, info)) {
    onProgress(1);
    return { blob: source, warnings };
  }

  const input = openInput(source);
  const output = new Output({
    format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  try {
    const width = edit.crop?.width ?? info.width;
    const height = edit.crop?.height ?? info.height;
    const video: ConversionVideoOptions = {};
    const needsEncode = quality !== 'original' || edit.crop !== null;
    if (needsEncode) {
      const candidates: VideoCodec[] = format === 'mp4' ? ['avc', 'hevc', 'av1', 'vp9'] : ['vp9', 'av1', 'vp8'];
      const q = qualityOf(quality === 'original' ? 'high' : quality);
      const codec = await getFirstEncodableVideoCodec(candidates, { width, height, quality: q });
      if (!codec) throw new Error('This browser cannot encode video for that format. Try WebM or GIF.');
      video.codec = codec;
      video.quality = q;
      if (edit.crop) video.crop = edit.crop;
    }
    const conversion = await Conversion.init({
      input,
      output,
      video,
      trim: { start: edit.trim.start, end: edit.trim.end },
    });
    if (info.hasAudio && conversion.discardedTracks.some((d) => d.track.type === 'audio')) {
      warnings.push('Audio could not be kept in this format on this browser; the file has no sound.');
    }
    if (!conversion.isValid) throw new Error('This browser cannot encode video for that format. Try WebM or GIF.');
    conversion.onProgress = onProgress;
    await conversion.execute();
    const type = format === 'mp4' ? 'video/mp4' : 'video/webm';
    return { blob: new Blob([output.target.buffer!], { type }), warnings };
  } finally {
    input.dispose();
  }
}

/** Two frames are identical when every pixel matches: the GIF then just holds the previous one longer. */
function sameFrame(a: Uint8ClampedArray, b: Uint8ClampedArray | null): boolean {
  if (!b || a.length !== b.length) return false;
  const ua = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
  const ub = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

export async function exportGif(
  source: Blob,
  info: MediaInfo,
  edit: Edit,
  fps: number,
  maxWidth: number,
  onProgress: (p: number) => void,
  cancelled: () => boolean,
): Promise<ExportResult> {
  const input = openInput(source);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('No video track');
    const srcW = edit.crop?.width ?? info.width;
    const srcH = edit.crop?.height ?? info.height;
    const scale = maxWidth > 0 && srcW > maxWidth ? maxWidth / srcW : 1;
    const width = Math.max(2, Math.round(srcW * scale) & ~1);
    const height = Math.max(2, Math.round(srcH * scale) & ~1);

    const sink = new CanvasSink(track, {
      width,
      height,
      fit: 'fill',
      ...(edit.crop ? { crop: edit.crop } : {}),
      poolSize: 2,
    });
    const step = 1 / fps;
    const timestamps: number[] = [];
    for (let ts = edit.trim.start; ts < edit.trim.end; ts += step) timestamps.push(ts);
    if (timestamps.length === 0) timestamps.push(edit.trim.start);
    const delay = Math.round(step * 1000);

    const gif = GIFEncoder();
    let previous: Uint8ClampedArray | null = null;
    let pending = 0; // delay carried by dropped duplicate frames
    let written = 0;
    let done = 0;
    let lastIndex: Uint8Array | null = null;
    let lastPalette: number[][] | null = null;

    const flush = (extra: number) => {
      if (lastIndex && lastPalette) {
        gif.writeFrame(lastIndex, width, height, { palette: lastPalette, delay: delay + extra, repeat: written === 0 ? 0 : undefined });
        written++;
      }
    };

    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (cancelled()) throw new Error('cancelled');
      done++;
      if (!wrapped) continue;
      const ctx = wrapped.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      const data = ctx.getImageData(0, 0, width, height).data;
      if (sameFrame(data, previous)) {
        pending += delay;
      } else {
        flush(pending);
        pending = 0;
        const palette = quantize(data, 256, { format: 'rgb565' });
        lastIndex = applyPalette(data, palette, 'rgb565');
        lastPalette = palette;
        previous = data;
      }
      onProgress(done / timestamps.length);
      if (done % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    flush(pending);
    gif.finish();
    return { blob: new Blob([gif.bytesView() as BlobPart], { type: 'image/gif' }), warnings: [] };
  } finally {
    input.dispose();
  }
}
