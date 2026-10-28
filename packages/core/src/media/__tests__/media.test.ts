import { describe, it, expect } from 'vitest';
import { generateImage } from '../image-gen';
import { processVideoInput } from '../video-input';

describe('Media module', () => {
  it('generateImage throws not implemented error', async () => {
    await expect(generateImage({ model: 'dall-e-3', prompt: 'a cat' })).rejects.toThrow(
      'Image generation not implemented yet (M6)',
    );
  });

  it('processVideoInput throws not implemented error', async () => {
    await expect(processVideoInput({ model: 'gpt-4o', videoPath: '/tmp/test.mp4' })).rejects.toThrow(
      'Video input not implemented yet (M6)',
    );
  });
});
