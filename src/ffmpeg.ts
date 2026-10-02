// The fallback encoder: ffmpeg.wasm, for the formats this browser cannot encode itself
// (MP4 in Firefox on most systems, animated WebP in Safari). Its core weighs about 32 MB,
// so it is fetched only after the user agrees, and the browser's cache keeps it after that.
// The core is ffmpeg built with GPL parts (x264): it is downloaded from jsDelivr at run
// time and never bundled, so Satori itself stays MIT.

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { Edit, MediaInfo, VideoQuality } from './export';
import type { ExportChoice } from './preview';

const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
// The CDN compresses, so its Content-Length is not what arrives; progress goes against this.
const CORE_BYTES = 32_232_419;

let loading: Promise<FFmpeg> | null = null;
let instance: FFmpeg | null = null;
// Bumped on cancel, so a load still in flight knows it has been abandoned.
let generation = 0;

export function ffmpegReady(): boolean {
  return instance !== null;
}

/** Fetches a file into a blob: URL (the worker cannot import across origins). */
async function blobURL(url: string, type: string, expected = 0, onProgress?: (p: number) => void): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (expected > 0) onProgress?.(Math.min(1, received / expected));
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type }));
}

export function loadFfmpeg(onProgress: (p: number) => void): Promise<FFmpeg> {
  if (loading) return loading;
  const mine = ++generation;
  loading = (async () => {
    let ffmpeg: FFmpeg;
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const coreURL = await blobURL(`${CORE}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await blobURL(`${CORE}/ffmpeg-core.wasm`, 'application/wasm', CORE_BYTES, onProgress);
      ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
    } catch (e) {
      if (generation === mine) loading = null;
      console.error(e);
      throw new Error('The encoder could not be downloaded. Check the connection and try again.');
    }
    // Cancelled while it was loading: nobody wants this one any more.
    if (generation !== mine) {
      ffmpeg.terminate();
      throw new Error('cancelled');
    }
    instance = ffmpeg;
    return ffmpeg;
  })();
  return loading;
}

/** Stops a running encode or load. The worker dies with it, so the next use loads it again (from the cache). */
export function cancelFfmpeg() {
  generation++;
  instance?.terminate();
  instance = null;
  loading = null;
}

const X264_CRF: Record<VideoQuality, number> = { original: 20, high: 20, medium: 26, low: 32 };
// VP8, not VP9: libvpx-vp9 crashes inside this core ("memory access out of bounds") on any setting.
// VP8's CRF needs a bitrate ceiling to work against.
const VP8_RATE: Record<VideoQuality, [crf: number, ceiling: string]> = {
  original: [8, '4M'],
  high: [8, '4M'],
  medium: [16, '2M'],
  low: [30, '1M'],
};
const WEBP_QUALITY: Record<VideoQuality, number> = { original: 90, high: 90, medium: 75, low: 50 };

function inputName(source: Blob): string {
  const named = source instanceof File ? /\.(\w+)$/.exec(source.name)?.[1] : undefined;
  return `input.${named ?? (/mp4|quicktime/i.test(source.type) ? 'mp4' : 'webm')}`;
}

/** Seconds out of ffmpeg's "time=00:01:02.34" status lines. */
function statusTime(line: string): number | null {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export async function exportWithFfmpeg(
  ffmpeg: FFmpeg,
  source: Blob,
  info: MediaInfo,
  choice: ExportChoice,
  edit: Edit,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const format = choice.format;
  if (format === 'gif' || format === 'apng') throw new Error(`${format} never needs the fallback`);
  const input = inputName(source);
  const output = `output.${format}`;
  const length = edit.trim.end - edit.trim.start;

  const filters: string[] = [];
  if (edit.crop) filters.push(`crop=${edit.crop.width}:${edit.crop.height}:${edit.crop.left}:${edit.crop.top}`);
  if (choice.kind === 'animation') {
    filters.push(`fps=${choice.fps}`);
    if (choice.maxWidth > 0) filters.push(`scale='min(${choice.maxWidth},iw)':-2`);
  } else {
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2'); // 4:2:0 needs even sides
  }
  const args = ['-ss', edit.trim.start.toFixed(3), '-i', input, '-t', length.toFixed(3), '-vf', filters.join(',')];
  const audio = (codec: string, rate: string) => (info.hasAudio ? ['-c:a', codec, '-b:a', rate] : ['-an']);
  if (format === 'mp4') {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(X264_CRF[choice.quality]), '-pix_fmt', 'yuv420p');
    args.push(...audio('aac', '128k'), '-movflags', '+faststart');
  } else if (format === 'webm') {
    const [crf, ceiling] = VP8_RATE[choice.quality];
    args.push('-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-crf', String(crf), '-b:v', ceiling);
    args.push(...audio('libopus', '96k'));
  } else {
    args.push('-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String(WEBP_QUALITY[choice.quality]), '-loop', '0', '-an');
  }
  args.push(output);

  const log: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    log.push(message);
    if (log.length > 40) log.shift();
    const time = statusTime(message);
    if (time !== null && length > 0) onProgress(Math.min(1, time / length));
  };
  ffmpeg.on('log', onLog);
  try {
    await ffmpeg.writeFile(input, new Uint8Array(await source.arrayBuffer()));
    let code: number;
    try {
      code = await ffmpeg.exec(args);
    } catch (e) {
      // A crash inside the core leaves it unusable: drop it so the next export loads a fresh one.
      if (ffmpeg === instance) cancelFfmpeg();
      throw e;
    }
    if (code !== 0) {
      console.error(`ffmpeg ${args.join(' ')}\n${log.join('\n')}`);
      throw new Error('The fallback encoder failed on this file.');
    }
    const data = (await ffmpeg.readFile(output)) as Uint8Array;
    onProgress(1);
    const type = format === 'webp' ? 'image/webp' : `video/${format}`;
    return new Blob([data as BlobPart], { type });
  } finally {
    ffmpeg.off('log', onLog);
    // The worker may be gone already if the export was cancelled.
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}
