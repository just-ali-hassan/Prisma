import { describe, it, expect } from 'vitest';
import { speechToText } from '../stt';
import { textToSpeech } from '../tts';

describe('Voice module', () => {
  it('speechToText throws not implemented error', async () => {
    const buffer = new ArrayBuffer(8);
    await expect(speechToText(buffer, { model: 'whisper-1' })).rejects.toThrow(
      'STT not implemented yet (M5)',
    );
  });

  it('textToSpeech throws not implemented error', async () => {
    await expect(textToSpeech('hello', { model: 'tts-1' })).rejects.toThrow(
      'TTS not implemented yet (M5)',
    );
  });
});
