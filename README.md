[🇪🇸 Español](README.es.md)

<div align="center">

# ◉ Satori

**Record your screen and export it as MP4, WebM or GIF. Entirely in the browser.**

[![License: MIT](https://img.shields.io/badge/license-MIT-c86dd7)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Pages](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml/badge.svg)](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml)

</div>

<br/>

## 🗺️ What it is

Satori is a static web page that records your screen (or one window), lets you trim and crop the recording, and exports it as **MP4**, **WebM** or **GIF**. Nothing is installed and nothing is uploaded: the browser captures, encodes and writes the file on your machine. It works as a PWA, so it can sit in your app list.

It was inspired by [gifcap](https://github.com/joaomoreno/gifcap), which proved that a screen-to-GIF tool can live entirely in the browser. Satori starts from the same idea with what browsers offer today: the recording is compressed as it happens (`MediaRecorder`), so a long capture takes megabytes instead of gigabytes of RAM, and video exports go through the browser's own encoders (WebCodecs) instead of a compiled encoder.

<br/>

## 🚀 Use it

Open the page, press **Start recording**, pick a screen or window, press **Stop**. Or skip the recording: press **Open a video file** (or drop one on the page) to trim, crop or convert something you already have.

Then:

| Step | What you get |
|---|---|
| **Trim** | Two sliders for start and end. Playback loops inside the selection. |
| **Crop** | Drag a rectangle on the video. Double-click clears it. |
| **Export** | MP4 or WebM in four qualities (original keeps the recording untouched when nothing was edited), or GIF at 5 to 20 frames per second scaled to a maximum width. |

The result shows size and length, with **Download**, **Edit again** and **New recording**.

**Audio.** When the browser offers to share system audio (Chrome and Edge on Windows and ChromeOS) it is captured and kept in MP4 and WebM. GIF has no sound.

**Browsers.** Chrome, Edge and Safari on the desktop for everything. Firefox records and exports WebM and GIF; MP4 needs an H.264 encoder that Firefox exposes only on some systems. Phones cannot record their screen from a web page.

<br/>

## 🔧 How it works

```
src/
├── main.ts       state machine: start → recording → processing → editing → exporting → result
├── record.ts     getDisplayMedia + MediaRecorder (best WebM/MP4 codec the browser has)
├── export.ts     mediabunny: probe, remux (makes the fresh recording seekable), MP4/WebM
│                 conversion with trim and crop (WebCodecs), GIF via CanvasSink + gifenc
├── preview.ts    the editor: playback inside the trim, sliders, drag-to-crop overlay, options
├── ui.ts         DOM helpers, time and size formatting
└── i18n.ts       English in the code, Spanish from a table (follows the browser language)
```

- **No framework.** Plain DOM with a small `el()` helper; every state renders its own view.
- **Remux first.** A file straight out of `MediaRecorder` has no duration or seek index, so `<video>` cannot scrub it. Satori rewrites the container once (packets copied, nothing re-encoded) and works from that.
- **GIF.** Frames are pulled at the chosen rate through mediabunny's `CanvasSink` (which also crops and scales), identical consecutive frames are merged into a longer delay, and each frame gets its own 256-colour palette from gifenc.
- **Dependencies.** [mediabunny](https://mediabunny.dev) (MPL-2.0) for reading, writing and converting media; [gifenc](https://github.com/mattdesl/gifenc) (MIT) for GIF. Both are permissive, so Satori stays MIT.

Development:

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

The `main` branch deploys to GitHub Pages through `.github/workflows/pages.yml`.

<br/>

## 🗺️ Roadmap

- Animated WebP and APNG.
- ffmpeg.wasm as an optional fallback for formats the browser cannot encode.

<br/>

## ⚖️ License

MIT. See [LICENSE](LICENSE).

The name Satori comes from the Touhou Project; Touhou and its characters belong to Team Shanghai Alice (ZUN). This project is not affiliated with them.
