// Voice barrel export (stubs for M5)

export interface TTSOptions {
  model: string;
  voice?: string;
  format?: string;
}

export async function textToSpeech(_text: string, _options: TTSOptions): Promise<ArrayBuffer> {
  throw new Error('TTS not implemented yet (M5)');
}
