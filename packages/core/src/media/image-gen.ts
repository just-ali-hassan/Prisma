// Media barrel export (stubs for M6)

export interface ImageGenOptions {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
}

export async function generateImage(
  _options: ImageGenOptions
): Promise<{ urls: string[]; revisedPrompt?: string }> {
  throw new Error('Image generation not implemented yet (M6)');
}
