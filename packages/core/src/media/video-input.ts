// Media barrel export (stubs for M6)

export interface VideoInputOptions {
  model: string;
  videoPath: string;
  maxFrames?: number;
}

export interface VideoFrame {
  timestamp: number;
  base64: string;
  mimeType: string;
}

export async function processVideoInput(_options: VideoInputOptions): Promise<VideoFrame[]> {
  throw new Error('Video input not implemented yet (M6)');
}
