// Screen capture and recording: getDisplayMedia + MediaRecorder. The browser
// compresses in real time, so a long recording is a few megabytes, not gigabytes.

export function canRecord(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function' && typeof MediaRecorder !== 'undefined';
}

/** The best container/codec pair this browser can record to. */
export function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export async function startCapture(withAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30 } },
    audio: withAudio,
  });
}

export interface RawRecording {
  blob: Blob;
  mimeType: string;
  hasAudio: boolean;
}

export class Recorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly startedAt = Date.now();
  readonly mimeType: string;
  readonly stream: MediaStream;

  constructor(stream: MediaStream) {
    this.stream = stream;
    this.mimeType = pickMimeType();
    this.recorder = new MediaRecorder(stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  /** Milliseconds since the recording started. */
  get elapsed(): number {
    return Date.now() - this.startedAt;
  }

  /** Called when the user stops sharing from the browser's own bar. */
  onEnded(cb: () => void): void {
    this.stream.getVideoTracks()[0]?.addEventListener('ended', cb, { once: true });
  }

  stop(): Promise<RawRecording> {
    return new Promise((resolve) => {
      const finish = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        const type = this.recorder.mimeType || this.mimeType || 'video/webm';
        resolve({
          blob: new Blob(this.chunks, { type }),
          mimeType: type,
          hasAudio: this.stream.getAudioTracks().length > 0,
        });
      };
      if (this.recorder.state === 'inactive') {
        finish();
        return;
      }
      this.recorder.onstop = finish;
      this.recorder.stop();
    });
  }
}
