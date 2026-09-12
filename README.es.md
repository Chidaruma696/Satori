[🇬🇧 English](README.md)

<div align="center">

# ◉ Satori

**Graba tu pantalla y expórtala como MP4, WebM o GIF. Todo en el navegador.**

[![License: MIT](https://img.shields.io/badge/license-MIT-c86dd7)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Pages](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml/badge.svg)](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml)

</div>

<br/>

## 🗺️ Qué es

Satori es una página web estática que graba tu pantalla (o una ventana), te deja recortar el tiempo y el área, y exporta el resultado como **MP4**, **WebM** o **GIF**. No se instala nada y no se sube nada: el navegador captura, codifica y escribe el archivo en tu máquina. Funciona como PWA, así que puede vivir en tu lista de aplicaciones.

Está inspirado en [gifcap](https://github.com/joaomoreno/gifcap), que demostró que una herramienta de pantalla a GIF puede vivir entera en el navegador. Satori parte de la misma idea con lo que los navegadores ofrecen hoy: la grabación se comprime sobre la marcha (`MediaRecorder`), así que una captura larga ocupa megabytes en vez de gigabytes de RAM, y las exportaciones de vídeo pasan por los codificadores del propio navegador (WebCodecs) en lugar de un codificador compilado.

<br/>

## 🚀 Úsalo

Abre la página, pulsa **Empezar a grabar**, elige una pantalla o ventana, pulsa **Detener**.

Después:

| Paso | Qué obtienes |
|---|---|
| **Recortar tiempo** | Dos deslizadores para inicio y fin. La reproducción se repite dentro de la selección. |
| **Recortar área** | Arrastra un rectángulo sobre el vídeo. Doble clic lo quita. |
| **Exportar** | MP4 o WebM en cuatro calidades (original deja la grabación intacta si no editaste nada), o GIF de 5 a 20 cuadros por segundo escalado a un ancho máximo. |

El resultado muestra tamaño y duración, con **Descargar**, **Volver a editar** y **Nueva grabación**.

**Audio.** Cuando el navegador ofrece compartir el audio del sistema (Chrome y Edge en Windows y ChromeOS) se captura y se conserva en MP4 y WebM. El GIF no tiene sonido.

**Navegadores.** Chrome, Edge y Safari de escritorio para todo. Firefox graba y exporta WebM y GIF; el MP4 necesita un codificador H.264 que Firefox solo expone en algunos sistemas. Los teléfonos no pueden grabar su pantalla desde una página web.

<br/>

## 🔧 Cómo funciona

```
src/
├── main.ts       máquina de estados: inicio → grabando → procesando → editando → exportando → resultado
├── record.ts     getDisplayMedia + MediaRecorder (el mejor códec WebM/MP4 que tenga el navegador)
├── export.ts     mediabunny: sondeo, remux (hace navegable la grabación recién hecha), conversión
│                 MP4/WebM con recortes (WebCodecs), GIF con CanvasSink + gifenc
├── preview.ts    el editor: reproducción dentro del recorte, deslizadores, recorte por arrastre, opciones
├── ui.ts         ayudantes de DOM, formato de tiempo y tamaño
└── i18n.ts       inglés en el código, español desde una tabla (sigue el idioma del navegador)
```

- **Sin framework.** DOM puro con un pequeño `el()`; cada estado pinta su propia vista.
- **Primero remux.** Un archivo recién salido de `MediaRecorder` no tiene duración ni índice, así que `<video>` no puede desplazarse por él. Satori reescribe el contenedor una vez (copia los paquetes, no recodifica) y trabaja a partir de ahí.
- **GIF.** Los cuadros se extraen a la tasa elegida con el `CanvasSink` de mediabunny (que además recorta y escala), los cuadros consecutivos idénticos se funden en un retardo más largo, y cada cuadro recibe su propia paleta de 256 colores con gifenc.
- **Dependencias.** [mediabunny](https://mediabunny.dev) (MPL-2.0) para leer, escribir y convertir medios; [gifenc](https://github.com/mattdesl/gifenc) (MIT) para el GIF. Ambas son permisivas, así que Satori se queda en MIT.

Desarrollo:

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # sitio estático en dist/
```

La rama `main` se despliega en GitHub Pages con `.github/workflows/pages.yml`.

<br/>

## 🗺️ Hoja de ruta

- Recomprimir un archivo de vídeo que arrastres a la página (bitrate, resolución, cuadros por segundo) sin grabar.
- WebP animado y APNG.
- ffmpeg.wasm como respaldo opcional para los formatos que el navegador no sepa codificar.

<br/>

## ⚖️ Licencia

MIT. Ver [LICENSE](LICENSE).

El nombre Satori viene de Touhou Project; Touhou y sus personajes pertenecen a Team Shanghai Alice (ZUN). Este proyecto no tiene relación con ellos.
