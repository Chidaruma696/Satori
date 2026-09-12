// The interface is written in English; Spanish comes from this table.
const es: Record<string, string> = {
  'Record your screen. Export it as MP4, WebM or GIF.': 'Graba tu pantalla. Expórtala como MP4, WebM o GIF.',
  'Everything happens in your browser: nothing is uploaded anywhere.': 'Todo ocurre en tu navegador: no se sube nada a ningún sitio.',
  'Start recording': 'Empezar a grabar',
  'Capture system audio when the browser offers it': 'Capturar el audio del sistema cuando el navegador lo ofrezca',
  'This browser cannot record the screen. Use a desktop Chrome, Edge, Firefox or Safari.': 'Este navegador no puede grabar la pantalla. Usa Chrome, Edge, Firefox o Safari de escritorio.',
  'Recording': 'Grabando',
  'Stop': 'Detener',
  'Preparing the recording…': 'Preparando la grabación…',
  'Edit': 'Editar',
  'Play': 'Reproducir',
  'Pause': 'Pausa',
  'Trim': 'Recortar tiempo',
  'Start': 'Inicio',
  'End': 'Fin',
  'Crop': 'Recortar área',
  'Drag on the video to crop. Double-click to clear.': 'Arrastra sobre el vídeo para recortar. Doble clic para quitar el recorte.',
  'Whole frame': 'Cuadro completo',
  'Export': 'Exportar',
  'Format': 'Formato',
  'Quality': 'Calidad',
  'Original (no re-encoding)': 'Original (sin recodificar)',
  'High': 'Alta',
  'Medium': 'Media',
  'Low': 'Baja',
  'Frames per second': 'Cuadros por segundo',
  'Max width': 'Ancho máximo',
  'Original': 'Original',
  'Discard': 'Descartar',
  'Discard this recording?': '¿Descartar esta grabación?',
  'Exporting…': 'Exportando…',
  'Cancel': 'Cancelar',
  'Download': 'Descargar',
  'Edit again': 'Volver a editar',
  'New recording': 'Nueva grabación',
  'Audio could not be kept in this format on this browser; the file has no sound.': 'El audio no se pudo conservar en este formato en este navegador; el archivo va sin sonido.',
  'This browser cannot encode video for that format. Try WebM or GIF.': 'Este navegador no puede codificar vídeo para ese formato. Prueba WebM o GIF.',
  'Something went wrong:': 'Algo salió mal:',
  'Made by Chidaruma': 'Hecho por Chidaruma',
  'Like it? Star it on GitHub.': '¿Te gusta? Deja una estrella en GitHub.',
  'Screen': 'Pantalla',
  'seconds': 'segundos',
};

const lang = /^es\b/i.test(navigator.language) ? 'es' : 'en';

/** Translate a UI string; unknown strings come back unchanged. */
export function t(s: string): string {
  return lang === 'es' ? (es[s] ?? s) : s;
}
