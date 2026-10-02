[🇪🇸 Español](README.es.md)

<div align="center">

# ◉ Satori

**Record your screen and export it as MP4, WebM, GIF, APNG or animated WebP. Entirely in the browser.**

[![License: MIT](https://img.shields.io/badge/license-MIT-c86dd7)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Pages](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml/badge.svg)](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml)

</div>

<br/>

## 🗺️ What it is

Satori is a static web page that records your screen (or one window), lets you trim and crop the recording, and exports it as **MP4**, **WebM**, **GIF**, **APNG** or **animated WebP**. Nothing is installed and nothing is uploaded: the browser captures, encodes and writes the file on your machine. It works as a PWA, so it can sit in your app list. The interface follows your browser's language: English, Spanish, German, French, Italian, Portuguese, Japanese or Russian.

It was inspired by [gifcap](https://github.com/joaomoreno/gifcap), which proved that a screen-to-GIF tool can live entirely in the browser. Satori starts from the same idea with what browsers offer today: the recording is compressed as it happens (`MediaRecorder`), so a long capture takes megabytes instead of gigabytes of RAM, and video exports go through the browser's own encoders (WebCodecs) instead of a compiled encoder.

<br/>

## 🚀 Use it

Open the page, press **Start recording**, pick a screen or window, press **Stop**. Or skip the recording: press **Open a video file** (or drop one on the page) to trim, crop or convert something you already have.

Then:

| Step | What you get |
|---|---|
| **Trim** | Two sliders for start and end. Playback loops inside the selection. |
| **Crop** | Drag a rectangle on the video. Double-click clears it. |
| **Export** | MP4 or WebM in four qualities (original keeps the recording untouched when nothing was edited), or an animation (GIF, APNG or WebP) at 5 to 20 frames per second scaled to a maximum width. GIF has 256 colours per frame; APNG keeps every colour, losslessly; WebP is lossy, in three qualities, and usually the smallest. |

The result shows size and length, with **Download**, **Edit again** and **New recording**.

**Audio.** When the browser offers to share system audio (Chrome and Edge on Windows and ChromeOS) it is captured and kept in MP4 and WebM. The animations have no sound.

**Browsers.** Chrome and Edge on the desktop do everything with their own encoders. Firefox has no MP4 encoder on most systems and Safari cannot write WebP; for those, Satori offers to download [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (about 32 MB, once: the browser keeps it) and encodes with it instead. It is slower than the browser's own encoders, and its WebM is VP8. Phones cannot record their screen from a web page.

<br/>

## 🔧 How it works

```
src/
├── main.ts       state machine: start → recording → processing → editing → exporting → result
├── record.ts     getDisplayMedia + MediaRecorder (best WebM/MP4 codec the browser has)
├── export.ts     mediabunny: probe, remux (makes the fresh recording seekable), MP4/WebM
│                 conversion with trim and crop (WebCodecs), animation frames via CanvasSink
├── animated.ts   APNG and animated WebP writers (only the changed rectangle per frame)
├── ffmpeg.ts     the fallback: ffmpeg.wasm, downloaded only when the browser lacks an encoder
├── preview.ts    the editor: playback inside the trim, sliders, drag-to-crop overlay, options
├── ui.ts         DOM helpers, time and size formatting
└── i18n.ts       English in the code, seven more languages from typed tables (follows the browser language)
```

- **No framework.** Plain DOM with a small `el()` helper; every state renders its own view.
- **Remux first.** A file straight out of `MediaRecorder` has no duration or seek index, so `<video>` cannot scrub it. Satori rewrites the container once (packets copied, nothing re-encoded) and works from that.
- **Animations.** Frames are pulled at the chosen rate through mediabunny's `CanvasSink` (which also crops and scales) and identical consecutive frames are merged into a longer delay. GIF: each frame gets its own 256-colour palette from gifenc. APNG and WebP: no browser has an encoder for either, so `animated.ts` writes the container itself and, after the first frame, stores only the rectangle that changed; APNG compresses with the browser's `CompressionStream`, WebP takes each rectangle from the canvas WebP encoder.
- **Fallback.** When the browser has no encoder for the chosen format, Satori asks before downloading ffmpeg.wasm's core from jsDelivr, runs it in a worker and reports progress from ffmpeg's own status lines. Cancelling kills the worker.
- **Dependencies.** [mediabunny](https://mediabunny.dev) (MPL-2.0) for reading, writing and converting media; [gifenc](https://github.com/mattdesl/gifenc) (MIT) for GIF; [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) (MIT) to drive the fallback. All three are permissive, so Satori stays MIT. The ffmpeg core itself includes GPL code (x264); it is never bundled, only downloaded by the browser when the user agrees.

Development:

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

The `main` branch deploys to GitHub Pages through `.github/workflows/pages.yml`.

<br/>

## ⚖️ License

MIT. See [LICENSE](LICENSE).

The name Satori comes from the Touhou Project; Touhou and its characters belong to Team Shanghai Alice (ZUN). This project is not affiliated with them.
