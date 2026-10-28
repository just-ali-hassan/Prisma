// Speech-to-Text (stubs for M5)

export interface STTOptions {
  model: string;
  language?: string;
}

export async function speechToText(_audioData: ArrayBuffer, _options: STTOptions): Promise<string> {
  throw new Error('STT not implemented yet (M5)');
}
