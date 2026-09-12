// The editor: playback within the trim, trim handles, drag-to-crop overlay, export options.

import type { Edit, MediaInfo, Rect, VideoQuality } from './export';
import { t } from './i18n';
import { button, el, fmtTime } from './ui';

export type ExportChoice =
  | { kind: 'video'; format: 'mp4' | 'webm'; quality: VideoQuality }
  | { kind: 'gif'; fps: number; maxWidth: number };

export interface PreviewHandlers {
  onExport(edit: Edit, choice: ExportChoice): void;
  onDiscard(): void;
}

export function renderPreview(url: string, info: MediaInfo, initial: Edit | null, handlers: PreviewHandlers): HTMLElement {
  const edit: Edit = initial ?? { trim: { start: 0, end: info.duration }, crop: null };

  const video = el('video', { src: url, playsinline: true, preload: 'auto' });
  video.muted = false;
  const overlay = el('canvas', { class: 'crop-overlay', title: t('Drag on the video to crop. Double-click to clear.') });
  const stage = el('div', { class: 'stage' }, video, overlay);

  // ---- playback within the trim
  const playBtn = button(t('Play'), () => (video.paused ? video.play() : video.pause()));
  const timeLabel = el('span', { class: 'time' }, `${fmtTime(0)} / ${fmtTime(info.duration)}`);
  video.addEventListener('play', () => (playBtn.textContent = t('Pause')));
  video.addEventListener('pause', () => (playBtn.textContent = t('Play')));
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= edit.trim.end - 0.02) {
      video.currentTime = edit.trim.start;
      if (!video.paused) video.play();
    }
    timeLabel.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(info.duration)}`;
  });

  // ---- trim
  const range = (value: number) =>
    el('input', { type: 'range', min: 0, max: info.duration.toFixed(3), step: '0.05', value: value.toFixed(3) });
  const startIn = range(edit.trim.start);
  const endIn = range(edit.trim.end);
  const startLabel = el('span', { class: 'time' }, fmtTime(edit.trim.start));
  const endLabel = el('span', { class: 'time' }, fmtTime(edit.trim.end));
  startIn.addEventListener('input', () => {
    edit.trim.start = Math.min(Number(startIn.value), edit.trim.end - 0.1);
    startIn.value = edit.trim.start.toFixed(3);
    startLabel.textContent = fmtTime(edit.trim.start);
    video.pause();
    video.currentTime = edit.trim.start;
  });
  endIn.addEventListener('input', () => {
    edit.trim.end = Math.max(Number(endIn.value), edit.trim.start + 0.1);
    endIn.value = edit.trim.end.toFixed(3);
    endLabel.textContent = fmtTime(edit.trim.end);
    video.pause();
    video.currentTime = Math.max(edit.trim.start, edit.trim.end - 0.05);
  });

  // ---- crop: drag a rectangle over the video; stored in source pixels
  const cropLabel = el('span', { class: 'muted' }, t('Whole frame'));
  const describeCrop = () => {
    cropLabel.textContent = edit.crop
      ? `${Math.round(edit.crop.width)} × ${Math.round(edit.crop.height)}`
      : t('Whole frame');
  };
  const ctx = overlay.getContext('2d')!;
  const syncOverlay = () => {
    const r = video.getBoundingClientRect();
    overlay.width = Math.max(1, Math.round(r.width));
    overlay.height = Math.max(1, Math.round(r.height));
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    drawCrop();
  };
  const drawCrop = (live?: Rect) => {
    const c = live ?? edit.crop;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!c) return;
    const sx = overlay.width / info.width;
    const sy = overlay.height / info.height;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.clearRect(c.left * sx, c.top * sy, c.width * sx, c.height * sy);
    ctx.strokeStyle = '#e9a0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.left * sx + 1, c.top * sy + 1, c.width * sx - 2, c.height * sy - 2);
  };
  const toSource = (e: MouseEvent) => {
    const r = overlay.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width) * (info.width / r.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), r.height) * (info.height / r.height);
    return { x, y };
  };
  let dragStart: { x: number; y: number } | null = null;
  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragStart = toSource(e);
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragStart) return;
    drawCrop(rectFrom(dragStart, toSource(e)));
  });
  window.addEventListener('mouseup', (e) => {
    if (!dragStart) return;
    const r = rectFrom(dragStart, toSource(e));
    dragStart = null;
    edit.crop = r.width >= 8 && r.height >= 8 ? r : null;
    describeCrop();
    drawCrop();
  });
  overlay.addEventListener('dblclick', () => {
    edit.crop = null;
    describeCrop();
    drawCrop();
  });
  video.addEventListener('loadedmetadata', syncOverlay);
  window.addEventListener('resize', syncOverlay);
  new ResizeObserver(syncOverlay).observe(video);

  // ---- export options
  const formatSel = el('select', {}, ...['mp4', 'webm', 'gif'].map((f) => el('option', { value: f }, f.toUpperCase())));
  const qualitySel = el(
    'select',
    {},
    el('option', { value: 'original' }, t('Original (no re-encoding)')),
    el('option', { value: 'high' }, t('High')),
    el('option', { value: 'medium', selected: true }, t('Medium')),
    el('option', { value: 'low' }, t('Low')),
  );
  const fpsSel = el('select', {}, ...[5, 10, 15, 20].map((n) => el('option', { value: n, selected: n === 10 }, String(n))));
  const widthSel = el(
    'select',
    {},
    ...[480, 640, 800, 1024].map((n) => el('option', { value: n, selected: n === 640 }, `${n} px`)),
    el('option', { value: 0 }, t('Original')),
  );
  const videoOpts = el('label', {}, t('Quality'), qualitySel);
  const gifOpts = el('span', { class: 'gif-opts' }, el('label', {}, t('Frames per second'), fpsSel), el('label', {}, t('Max width'), widthSel));
  const syncFormat = () => {
    const gif = formatSel.value === 'gif';
    videoOpts.hidden = gif;
    gifOpts.hidden = !gif;
  };
  formatSel.addEventListener('change', syncFormat);
  syncFormat();

  const exportBtn = button(t('Export'), () => {
    video.pause();
    const choice: ExportChoice =
      formatSel.value === 'gif'
        ? { kind: 'gif', fps: Number(fpsSel.value), maxWidth: Number(widthSel.value) }
        : { kind: 'video', format: formatSel.value as 'mp4' | 'webm', quality: qualitySel.value as VideoQuality };
    handlers.onExport({ trim: { ...edit.trim }, crop: edit.crop ? { ...edit.crop } : null }, choice);
  }, { primary: true });
  const discardBtn = button(t('Discard'), () => {
    if (confirm(t('Discard this recording?'))) {
      video.pause();
      handlers.onDiscard();
    }
  }, { danger: true });

  describeCrop();
  video.currentTime = edit.trim.start;

  return el(
    'section',
    { class: 'view editor' },
    stage,
    el('div', { class: 'row' }, playBtn, timeLabel),
    el(
      'div',
      { class: 'panel' },
      el('h2', {}, t('Trim')),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, t('Start'), startIn), startLabel),
      el('div', { class: 'row' }, el('label', { class: 'grow' }, t('End'), endIn), endLabel),
    ),
    el(
      'div',
      { class: 'panel' },
      el('h2', {}, t('Crop')),
      el('div', { class: 'row' }, el('span', { class: 'muted' }, t('Drag on the video to crop. Double-click to clear.')), cropLabel),
    ),
    el(
      'div',
      { class: 'panel' },
      el('h2', {}, t('Export')),
      el('div', { class: 'row wrap' }, el('label', {}, t('Format'), formatSel), videoOpts, gifOpts),
      el('div', { class: 'row' }, exportBtn, discardBtn),
    ),
  );
}

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  const left = Math.round(Math.min(a.x, b.x)) & ~1;
  const top = Math.round(Math.min(a.y, b.y)) & ~1;
  const width = Math.round(Math.abs(a.x - b.x)) & ~1;
  const height = Math.round(Math.abs(a.y - b.y)) & ~1;
  return { left, top, width, height };
}
