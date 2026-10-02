[🇬🇧 English](README.md)

<div align="center">

# ◉ Satori

**Graba tu pantalla y expórtala como MP4, WebM, GIF, APNG o WebP animado. Todo en el navegador.**

[![License: MIT](https://img.shields.io/badge/license-MIT-c86dd7)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Pages](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml/badge.svg)](https://github.com/Chidaruma696/Satori/actions/workflows/pages.yml)

</div>

<br/>

## 🗺️ Qué es

Satori es una página web estática que graba tu pantalla (o una ventana), te deja recortar el tiempo y el área, y exporta el resultado como **MP4**, **WebM**, **GIF**, **APNG** o **WebP animado**. No se instala nada y no se sube nada: el navegador captura, codifica y escribe el archivo en tu máquina. Funciona como PWA, así que puede vivir en tu lista de aplicaciones. La interfaz sigue el idioma de tu navegador: inglés, español, alemán, francés, italiano, portugués, japonés o ruso.

Está inspirado en [gifcap](https://github.com/joaomoreno/gifcap), que demostró que una herramienta de pantalla a GIF puede vivir entera en el navegador. Satori parte de la misma idea con lo que los navegadores ofrecen hoy: la grabación se comprime sobre la marcha (`MediaRecorder`), así que una captura larga ocupa megabytes en vez de gigabytes de RAM, y las exportaciones de vídeo pasan por los codificadores del propio navegador (WebCodecs) en lugar de un codificador compilado.

<br/>

## 🚀 Úsalo

Abre la página, pulsa **Empezar a grabar**, elige una pantalla o ventana, pulsa **Detener**. O sáltate la grabación: pulsa **Abrir un vídeo** (o suelta uno en la página) para recortar, encuadrar o convertir algo que ya tengas.

Después:

| Paso | Qué obtienes |
|---|---|
| **Recortar tiempo** | Dos deslizadores para inicio y fin. La reproducción se repite dentro de la selección. |
| **Recortar área** | Arrastra un rectángulo sobre el vídeo. Doble clic lo quita. |
| **Exportar** | MP4 o WebM en cuatro calidades (original deja la grabación intacta si no editaste nada), o una animación (GIF, APNG o WebP) de 5 a 20 cuadros por segundo escalada a un ancho máximo. El GIF tiene 256 colores por cuadro; el APNG conserva todos, sin pérdida; el WebP es con pérdida, en tres calidades, y suele ser el más ligero. |

El resultado muestra tamaño y duración, con **Descargar**, **Volver a editar** y **Nueva grabación**.

**Audio.** Cuando el navegador ofrece compartir el audio del sistema (Chrome y Edge en Windows y ChromeOS) se captura y se conserva en MP4 y WebM. Las animaciones no tienen sonido.

**Navegadores.** Chrome y Edge de escritorio lo hacen todo con sus propios codificadores. Firefox no tiene codificador MP4 en la mayoría de sistemas y Safari no sabe escribir WebP; para esos casos Satori ofrece descargar [ffmpeg.wasm](https://ffmpegwasm.netlify.app/) (unos 32 MB, una vez: el navegador lo guarda) y codifica con él. Es más lento que los codificadores del navegador y su WebM es VP8. Los teléfonos no pueden grabar su pantalla desde una página web.

<br/>

## 🔧 Cómo funciona

```
src/
├── main.ts       máquina de estados: inicio → grabando → procesando → editando → exportando → resultado
├── record.ts     getDisplayMedia + MediaRecorder (el mejor códec WebM/MP4 que tenga el navegador)
├── export.ts     mediabunny: sondeo, remux (hace navegable la grabación recién hecha), conversión
│                 MP4/WebM con recortes (WebCodecs), cuadros de las animaciones con CanvasSink
├── animated.ts   escritores de APNG y WebP animado (solo el rectángulo que cambia en cada cuadro)
├── ffmpeg.ts     el respaldo: ffmpeg.wasm, que solo se descarga si al navegador le falta un codificador
├── preview.ts    el editor: reproducción dentro del recorte, deslizadores, recorte por arrastre, opciones
├── ui.ts         ayudantes de DOM, formato de tiempo y tamaño
└── i18n.ts       inglés en el código, siete idiomas más desde tablas tipadas (sigue el idioma del navegador)
```

- **Sin framework.** DOM puro con un pequeño `el()`; cada estado pinta su propia vista.
- **Primero remux.** Un archivo recién salido de `MediaRecorder` no tiene duración ni índice, así que `<video>` no puede desplazarse por él. Satori reescribe el contenedor una vez (copia los paquetes, no recodifica) y trabaja a partir de ahí.
- **Animaciones.** Los cuadros se extraen a la tasa elegida con el `CanvasSink` de mediabunny (que además recorta y escala) y los cuadros consecutivos idénticos se funden en un retardo más largo. GIF: cada cuadro recibe su propia paleta de 256 colores con gifenc. APNG y WebP: ningún navegador trae codificador para ninguno de los dos, así que `animated.ts` escribe el contenedor él mismo y, después del primer cuadro, guarda solo el rectángulo que cambió; el APNG comprime con el `CompressionStream` del navegador y el WebP saca cada rectángulo del codificador WebP del canvas.
- **Respaldo.** Si el navegador no tiene codificador para el formato elegido, Satori pregunta antes de descargar el núcleo de ffmpeg.wasm desde jsDelivr, lo ejecuta en un worker y saca el progreso de las propias líneas de estado de ffmpeg. Cancelar mata el worker.
- **Dependencias.** [mediabunny](https://mediabunny.dev) (MPL-2.0) para leer, escribir y convertir medios; [gifenc](https://github.com/mattdesl/gifenc) (MIT) para el GIF; [@ffmpeg/ffmpeg](https://github.com/ffmpegwasm/ffmpeg.wasm) (MIT) para manejar el respaldo. Las tres son permisivas, así que Satori se queda en MIT. El núcleo de ffmpeg sí lleva código GPL (x264): nunca va empaquetado, solo lo descarga el navegador cuando el usuario acepta.

Desarrollo:

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # sitio estático en dist/
```

La rama `main` se despliega en GitHub Pages con `.github/workflows/pages.yml`.

<br/>

## ⚖️ Licencia

MIT. Ver [LICENSE](LICENSE).

El nombre Satori viene de Touhou Project; Touhou y sus personajes pertenecen a Team Shanghai Alice (ZUN). Este proyecto no tiene relación con ellos.
