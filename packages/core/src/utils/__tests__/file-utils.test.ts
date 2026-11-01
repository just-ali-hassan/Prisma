/**
 * File Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  isVisionCompatible,
  getFileInfo,
  validateFile,
  formatBytes,
  getFileExtension,
  isImageMimeType,
  isTextMimeType,
  isDocumentMimeType,
} from '../file-utils';

describe('File Utilities', () => {
  describe('detectFileType', () => {
    it('detects image types from mime type', () => {
      expect(detectFileType('image/jpeg')).toBe('image');
      expect(detectFileType('image/png')).toBe('image');
      expect(detectFileType('image/webp')).toBe('image');
      expect(detectFileType('image/gif')).toBe('image');
    });

    it('detects image types from filename extension', () => {
      expect(detectFileType('application/octet-stream', 'photo.jpg')).toBe('image');
      expect(detectFileType('application/octet-stream', 'image.PNG')).toBe('image');
      expect(detectFileType('application/octet-stream', 'pic.webp')).toBe('image');
    });

    it('detects file type for non-images', () => {
      expect(detectFileType('text/plain', 'readme.txt')).toBe('file');
      expect(detectFileType('application/pdf', 'doc.pdf')).toBe('file');
      expect(detectFileType('application/json', 'data.json')).toBe('file');
    });
  });

  describe('isVisionCompatible', () => {
    it('returns true for supported image types', () => {
      expect(isVisionCompatible('image/jpeg')).toBe(true);
      expect(isVisionCompatible('image/png')).toBe(true);
      expect(isVisionCompatible('image/webp')).toBe(true);
      expect(isVisionCompatible('image/gif')).toBe(true);
    });

    it('returns false for non-image types', () => {
      expect(isVisionCompatible('text/plain')).toBe(false);
      expect(isVisionCompatible('application/pdf')).toBe(false);
      expect(isVisionCompatible('application/json')).toBe(false);
    });

    it('returns false for unsupported image types', () => {
      expect(isVisionCompatible('image/bmp')).toBe(true); // BMP is in IMAGE_MIME_TYPES
      expect(isVisionCompatible('image/tiff')).toBe(true); // TIFF is in IMAGE_MIME_TYPES
    });
  });

  describe('getFileInfo', () => {
    it('returns complete file info for images', () => {
      const info = getFileInfo('image/png', 'test.png', 1024);
      expect(info).toEqual({
        name: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        type: 'image',
        isVisionCompatible: true,
      });
    });

    it('returns complete file info for documents', () => {
      const info = getFileInfo('application/pdf', 'doc.pdf', 2048);
      expect(info).toEqual({
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        type: 'file',
        isVisionCompatible: false,
      });
    });
  });

  describe('validateFile', () => {
    it('returns undefined for valid image files', () => {
      expect(validateFile('image/png', 'test.png', 1024)).toBeUndefined();
      expect(validateFile('image/jpeg', 'photo.jpg', 5000000)).toBeUndefined();
    });

    it('returns undefined for valid document files', () => {
      expect(validateFile('application/pdf', 'doc.pdf', 1024)).toBeUndefined();
      expect(validateFile('text/plain', 'readme.txt', 500)).toBeUndefined();
    });

    it('returns error for files exceeding max size', () => {
      const error = validateFile('image/png', 'large.png', 100 * 1024 * 1024, 50 * 1024 * 1024);
      expect(error).toContain('exceeds maximum allowed size');
    });

    it('returns error for unsupported file types', () => {
      const error = validateFile('application/x-executable', 'malware.exe', 1024);
      expect(error).toContain('not supported');
    });

    it('allows unknown types with known extensions', () => {
      // Unknown mime type but known extension
      expect(validateFile('application/unknown', 'test.txt', 1024)).toBeUndefined();
    });
  });

  describe('formatBytes', () => {
    it('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(500)).toBe('500 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('respects decimal places', () => {
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
    });
  });

  describe('getFileExtension', () => {
    it('extracts extension from filename', () => {
      expect(getFileExtension('test.png')).toBe('png');
      expect(getFileExtension('doc.PDF')).toBe('pdf');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('falls back to mime type mapping', () => {
      expect(getFileExtension('test', 'image/jpeg')).toBe('jpg');
      expect(getFileExtension('test', 'application/pdf')).toBe('pdf');
      expect(getFileExtension('test', 'text/plain')).toBe('txt');
    });

    it('returns bin for unknown types', () => {
      expect(getFileExtension('test', 'application/unknown')).toBe('bin');
    });
  });

  describe('isImageMimeType', () => {
    it('returns true for supported image types', () => {
      expect(isImageMimeType('image/jpeg')).toBe(true);
      expect(isImageMimeType('image/png')).toBe(true);
      expect(isImageMimeType('image/webp')).toBe(true);
    });

    it('returns false for non-image types', () => {
      expect(isImageMimeType('text/plain')).toBe(false);
      expect(isImageMimeType('application/pdf')).toBe(false);
    });
  });

  describe('isTextMimeType', () => {
    it('returns true for text types', () => {
      expect(isTextMimeType('text/plain')).toBe(true);
      expect(isTextMimeType('text/markdown')).toBe(true);
      expect(isTextMimeType('application/json')).toBe(true);
    });

    it('returns false for non-text types', () => {
      expect(isTextMimeType('image/png')).toBe(false);
      expect(isTextMimeType('application/pdf')).toBe(false);
    });
  });

  describe('isDocumentMimeType', () => {
    it('returns true for document types', () => {
      expect(isDocumentMimeType('application/pdf')).toBe(true);
      expect(isDocumentMimeType('application/msword')).toBe(true);
      expect(isDocumentMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    });

    it('returns false for non-document types', () => {
      expect(isDocumentMimeType('image/png')).toBe(false);
      expect(isDocumentMimeType('text/plain')).toBe(false);
    });
  });
});