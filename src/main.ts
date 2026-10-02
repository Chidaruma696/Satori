// Satori: record the screen, edit, export as MP4, WebM, GIF, APNG or WebP. Everything in the browser.
// A small state machine; each state renders its own view into #app.

import './style.css';
import { NoWebpEncoder } from './animated';
import { NoEncoder, exportAnimation, exportVideo, probe, remux, type Edit, type ExportResult, type MediaInfo } from './export';
import { cancelFfmpeg, exportWithFfmpeg, ffmpegReady, loadFfmpeg } from './ffmpeg';
import { t } from './i18n';
import { renderPreview, type ExportChoice } from './preview';
import { Recorder, canRecord, startCapture } from './record';
import { button, el, fileStamp, fmtSize, fmtTime } from './ui';

interface Clip {
  blob: Blob;
  url: string;
  info: MediaInfo;
}

type State =
  | { name: 'start'; error?: string }
  | { name: 'recording'; recorder: Recorder }
  | { name: 'processing'; message: string; progress: number }
  | { name: 'editing'; clip: Clip; edit: Edit | null }
  | { name: 'exporting'; clip: Clip; edit: Edit; choice: ExportChoice; message: string; progress: number; cancel: () => void }
  | { name: 'result'; clip: Clip; edit: Edit; choice: ExportChoice; result: ExportResult; url: string };

const app = document.getElementById('app')!;
let state: State = { name: 'start' };

function setState(next: State) {
  state = next;
  render();
}

function render() {
  app.replaceChildren(header(), body(), footer());
}

function header() {
  return el('header', {}, el('h1', {}, el('span', { class: 'eye' }, '◉'), ' Satori'));
}

function footer() {
  return el(
    'footer',
    {},
    el('a', { href: 'https://github.com/Chidaruma696/Satori', target: '_blank', rel: 'noopener' }, 'Chidaruma696/Satori'),
    ' · ',
    t('Made by Chidaruma'),
    ' · ',
    el('a', { href: 'https://github.com/Chidaruma696', target: '_blank', rel: 'noopener' }, t('Like it? Star it on GitHub.')),
  );
}

function body(): HTMLElement {
  switch (state.name) {
    case 'start':
      return startView(state.error);
    case 'recording':
      return recordingView(state.recorder);
    case 'processing':
      return progressView(state.message, state.progress);
    case 'editing': {
      const editing = state;
      return renderPreview(editing.clip.url, editing.clip.info, editing.edit, {
        onExport: (edit, choice) => runExport(editing, edit, choice),
        onDiscard: discard,
      });
    }
    case 'exporting':
      return progressView(state.message, state.progress, state.cancel);
    case 'result':
      return resultView(state);
  }
}

// ---------------------------------------------------------------- start

function startView(error?: string): HTMLElement {
  const audio = el('input', { type: 'checkbox', checked: true });
  const supported = canRecord();
  const start = button(t('Start recording'), () => startRecording(audio.checked), { primary: true, disabled: !supported });
  // A video from the disk goes straight to the editor: trim, crop or convert without recording.
  const picker = el('input', { type: 'file', accept: 'video/*,.mkv,.mov,.webm,.mp4', hidden: true });
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (file) openFile(file);
  });
  const open = button(t('Open a video file'), () => picker.click());
  return el(
    'section',
    { class: 'view start' },
    el('p', { class: 'lead' }, t('Record your screen. Export it as MP4, WebM, GIF, APNG or WebP.')),
    el('p', { class: 'muted' }, t('Everything happens in your browser: nothing is uploaded anywhere.')),
    supported
      ? el('label', { class: 'check' }, audio, ' ', t('Capture system audio when the browser offers it'))
      : el('p', { class: 'error' }, t('This browser cannot record the screen. Use a desktop Chrome, Edge, Firefox or Safari.')),
    el('div', { class: 'row' }, start, open, picker),
    el('p', { class: 'muted drop-hint' }, t('Or drop a video file here to trim, crop or convert it.')),
    error ? el('p', { class: 'error' }, `${t('Something went wrong:')} ${error}`) : null,
  );
}

// ---------------------------------------------------------------- open a file

// Unlike a fresh recording, a file from the disk already has its duration and
// seek index, so there is nothing to remux: probe it and open the editor.
async function openFile(file: File) {
  if (state.name !== 'start') return;
  setState({ name: 'processing', message: t('Opening the file…'), progress: 0 });
  try {
    const info = await probe(file);
    setState({ name: 'editing', clip: { blob: file, url: URL.createObjectURL(file), info }, edit: null });
  } catch {
    setState({ name: 'start', error: t('That file is not a video this browser can read.') });
  }
}

// Dropping anywhere on the page opens the file; the browser would otherwise navigate to it.
let dragDepth = 0;
const dragClass = (on: boolean) => document.querySelector('.view.start')?.classList.toggle('drag', on);
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (state.name === 'start' && ++dragDepth === 1) dragClass(true);
});
document.addEventListener('dragleave', () => {
  if (state.name === 'start' && --dragDepth === 0) dragClass(false);
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dragClass(false);
  const file = e.dataTransfer?.files[0];
  if (file && state.name === 'start') openFile(file);
});

async function startRecording(withAudio: boolean) {
  let stream: MediaStream;
  try {
    stream = await startCapture(withAudio);
  } catch {
    return; // the user dismissed the picker
  }
  const recorder = new Recorder(stream);
  recorder.onEnded(() => stopRecording(recorder));
  setState({ name: 'recording', recorder });
}

// ---------------------------------------------------------------- recording

function recordingView(recorder: Recorder): HTMLElement {
  const timer = el('p', { class: 'timer' }, fmtTime(0));
  const tick = setInterval(() => {
    if (state.name !== 'recording') {
      clearInterval(tick);
      return;
    }
    timer.textContent = fmtTime(recorder.elapsed / 1000);
  }, 100);
  return el(
    'section',
    { class: 'view recording' },
    el('p', { class: 'lead' }, el('span', { class: 'dot' }), ' ', t('Recording')),
    timer,
    button(t('Stop'), () => stopRecording(recorder), { primary: true }),
  );
}

async function stopRecording(recorder: Recorder) {
  if (state.name !== 'recording') return;
  setState({ name: 'processing', message: t('Preparing the recording…'), progress: 0 });
  try {
    const raw = await recorder.stop();
    const fixed = await remux(raw.blob, (p) => setState({ name: 'processing', message: t('Preparing the recording…'), progress: p }));
    const info = await probe(fixed);
    if (!raw.hasAudio) info.hasAudio = false;
    setState({ name: 'editing', clip: { blob: fixed, url: URL.createObjectURL(fixed), info }, edit: null });
  } catch (e) {
    setState({ name: 'start', error: String((e as Error).message ?? e) });
  }
}

// ---------------------------------------------------------------- processing

function progressView(message: string, progress: number, cancel?: () => void): HTMLElement {
  const bar = el('progress', { max: 1, value: progress });
  return el(
    'section',
    { class: 'view progress' },
    el('p', { class: 'lead' }, message),
    bar,
    el('p', { class: 'muted' }, `${Math.floor(progress * 100)}%`),
    cancel ? button(t('Cancel'), cancel) : null,
  );
}

// ---------------------------------------------------------------- export

// Development only: ?ffmpeg in the address pretends the browser has no encoder, to try the fallback.
const forceFallback = import.meta.env.DEV && new URLSearchParams(location.search).has('ffmpeg');

async function runExport(from: Extract<State, { name: 'editing' }>, edit: Edit, choice: ExportChoice) {
  let cancelled = false;
  let fallback = false;
  const cancel = () => {
    cancelled = true;
    if (fallback) cancelFfmpeg();
    setState({ name: 'editing', clip: from.clip, edit });
  };
  const progress = (message: string) => (p: number) => {
    if (state.name === 'exporting' && !cancelled) setState({ ...state, message, progress: p });
  };
  setState({ name: 'exporting', clip: from.clip, edit, choice, message: t('Exporting…'), progress: 0, cancel });

  // The browser's own encoders first; when it has none for the format, ffmpeg.wasm if the user agrees.
  const run = async (): Promise<ExportResult> => {
    try {
      if (forceFallback && (choice.kind === 'video' || choice.format === 'webp')) throw new NoEncoder();
      return choice.kind === 'animation'
        ? await exportAnimation(from.clip.blob, from.clip.info, choice.format, choice, edit, progress(t('Exporting…')), () => cancelled)
        : await exportVideo(from.clip.blob, from.clip.info, choice.format, choice.quality, edit, progress(t('Exporting…')));
    } catch (e) {
      if (cancelled || !(e instanceof NoEncoder || e instanceof NoWebpEncoder)) throw e;
      const ask = t('This browser has no encoder for that format. Download ffmpeg.wasm (about 32 MB, kept by the browser for next time) and encode with it?');
      if (!ffmpegReady() && !confirm(ask)) throw e;
      fallback = true;
      const ffmpeg = await loadFfmpeg(progress(t('Downloading the encoder…')));
      if (cancelled) throw new Error('cancelled');
      progress(t('Exporting…'))(0);
      const blob = await exportWithFfmpeg(ffmpeg, from.clip.blob, from.clip.info, choice, edit, progress(t('Exporting…')));
      return { blob, warnings: [] };
    }
  };
  try {
    const result = await run();
    if (cancelled) return;
    setState({ name: 'result', clip: from.clip, edit, choice, result, url: URL.createObjectURL(result.blob) });
  } catch (e) {
    if (cancelled) return;
    console.error(e);
    const msg = (e as Error).message ?? String(e);
    setState({ name: 'editing', clip: from.clip, edit });
    alert(`${t('Something went wrong:')} ${t(msg)}`);
  }
}

// ---------------------------------------------------------------- result

function resultView(s: Extract<State, { name: 'result' }>): HTMLElement {
  const format = s.choice.format;
  const label = format === 'webp' ? 'WebP' : format.toUpperCase();
  // An APNG is a PNG to everything that does not animate it; .png opens everywhere.
  const ext = format === 'apng' ? 'png' : format;
  const media =
    s.choice.kind === 'animation' ? el('img', { src: s.url, alt: label }) : el('video', { src: s.url, controls: true, playsinline: true });
  const seconds = s.edit.trim.end - s.edit.trim.start;
  const download = el('a', { class: 'btn primary', href: s.url, download: `Satori ${fileStamp()}.${ext}` }, t('Download'));
  return el(
    'section',
    { class: 'view result' },
    el('div', { class: 'stage' }, media),
    el('p', { class: 'muted' }, `${label} · ${fmtSize(s.result.blob.size)} · ${seconds.toFixed(1)} ${t('seconds')}`),
    ...s.result.warnings.map((w) => el('p', { class: 'warn' }, t(w))),
    el(
      'div',
      { class: 'row' },
      download,
      button(t('Edit again'), () => setState({ name: 'editing', clip: s.clip, edit: s.edit })),
      button(t('New recording'), discard, { danger: true }),
    ),
  );
}

function discard() {
  if (state.name === 'editing' || state.name === 'result') URL.revokeObjectURL(state.clip.url);
  if (state.name === 'result') URL.revokeObjectURL(state.url);
  setState({ name: 'start' });
}

window.addEventListener('beforeunload', (e) => {
  if (state.name !== 'start') e.preventDefault();
});

// Development only: record from any MediaStream (a canvas, say) without the screen picker.
if (import.meta.env.DEV) {
  (window as unknown as { satori: unknown }).satori = {
    recordFrom(stream: MediaStream) {
      const recorder = new Recorder(stream);
      recorder.onEnded(() => stopRecording(recorder));
      setState({ name: 'recording', recorder });
    },
    state: () => state,
  };
}

render();
