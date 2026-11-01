/**
 * File Utilities
 *
 * File type detection, validation, and conversion utilities.
 */

export interface FileInfo {
  name: string;
  mimeType: string;
  sizeBytes: number;
  type: 'image' | 'file';
  isVisionCompatible: boolean;
}

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
];

const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/yaml',
];

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/**
 * Detect file type from mime type and filename.
 */
export function detectFileType(mimeType: string, filename?: string): FileInfo['type'] {
  if (IMAGE_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return 'image';
  }

  // Check file extension as fallback
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg'];
    if (ext && imageExts.includes(ext)) {
      return 'image';
    }
  }

  return 'file';
}

/**
 * Check if a file is vision-compatible (can be sent to vision-capable models).
 */
export function isVisionCompatible(mimeType: string, filename?: string): boolean {
  const type = detectFileType(mimeType, filename);
  return type === 'image' && IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Get file info from mime type, filename, and size.
 */
export function getFileInfo(mimeType: string, filename: string, sizeBytes: number): FileInfo {
  const type = detectFileType(mimeType, filename);
  return {
    name: filename,
    mimeType,
    sizeBytes,
    type,
    isVisionCompatible: isVisionCompatible(mimeType, filename),
  };
}

/**
 * Validate file for upload.
 * Returns error message if invalid, undefined if valid.
 */
export function validateFile(
  mimeType: string,
  filename: string,
  sizeBytes: number,
  maxSizeBytes: number = 50 * 1024 * 1024 // 50MB default
): string | undefined {
  if (sizeBytes > maxSizeBytes) {
    return `File size ${formatBytes(sizeBytes)} exceeds maximum allowed size ${formatBytes(maxSizeBytes)}`;
  }

  // Check for allowed types
  const allowedTypes = [
    ...IMAGE_MIME_TYPES,
    ...TEXT_MIME_TYPES,
    ...DOCUMENT_MIME_TYPES,
  ];

  if (!allowedTypes.includes(mimeType.toLowerCase())) {
    // Check extension as fallback
    const ext = filename.toLowerCase().split('.').pop();
    const allowedExts = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg',
      'txt', 'md', 'csv', 'html', 'css', 'js', 'json', 'xml', 'yaml', 'yml',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    ];
    if (!ext || !allowedExts.includes(ext)) {
      return `File type "${mimeType}" is not supported`;
    }
  }

  return undefined;
}

/**
 * Convert file to base64 data URL.
 * For images, this creates a data URL suitable for vision model input.
 */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert ArrayBuffer to base64 data URL.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Format bytes as human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get file extension from filename or mime type.
 */
export function getFileExtension(filename: string, mimeType?: string): string {
  // Extract extension from filename if present
  const parts = filename.split('.');
  if (parts.length > 1) {
    const fromFilename = parts.pop()?.toLowerCase();
    if (fromFilename) return fromFilename;
  }

  // Fall back to mime type mapping
  if (mimeType) {
    const mimeMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/svg+xml': 'svg',
      'text/plain': 'txt',
      'text/markdown': 'md',
      'text/csv': 'csv',
      'application/json': 'json',
      'application/pdf': 'pdf',
    };
    return mimeMap[mimeType.toLowerCase()] ?? 'bin';
  }

  return 'bin';
}

/**
 * Check if mime type is an image type.
 */
export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Check if mime type is a text type.
 */
export function isTextMimeType(mimeType: string): boolean {
  return TEXT_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Check if mime type is a document type.
 */
export function isDocumentMimeType(mimeType: string): boolean {
  return DOCUMENT_MIME_TYPES.includes(mimeType.toLowerCase());
}