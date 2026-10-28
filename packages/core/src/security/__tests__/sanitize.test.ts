/**
 * Sanitization Tests
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeUrl, sanitizeMarkdownHtml, escapeHtml } from '../sanitize';

describe('Sanitization Utilities', () => {
  describe('sanitizeHtml', () => {
    it('allows safe tags', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      expect(sanitizeHtml(html)).toBe('<p>Hello <strong>world</strong></p>');
    });

    it('allows links with href', () => {
      const html = '<a href="https://example.com">Link</a>';
      // DOMPurify allows href but doesn't auto-add rel="noopener"
      expect(sanitizeHtml(html)).toBe('<a href="https://example.com">Link</a>');
    });

    it('allows images with src and alt', () => {
      const html = '<img src="https://example.com/image.png" alt="Test">';
      expect(sanitizeHtml(html)).toContain('<img src="https://example.com/image.png" alt="Test">');
    });

    it('removes script tags', () => {
      const html = '<p>Safe</p><script>alert("xss")</script>';
      expect(sanitizeHtml(html)).toBe('<p>Safe</p>');
    });

    it('removes style tags', () => {
      const html = '<p>Safe</p><style>body { display: none; }</style>';
      expect(sanitizeHtml(html)).toBe('<p>Safe</p>');
    });

    it('removes iframe tags', () => {
      const html = '<p>Safe</p><iframe src="https://evil.com"></iframe>';
      expect(sanitizeHtml(html)).toBe('<p>Safe</p>');
    });

    it('removes onerror and other event handlers', () => {
      const html = '<img src="x" onerror="alert(1)" onload="alert(2)">';
      const result = sanitizeHtml(html);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('onload');
    });

    it('removes onclick handlers', () => {
      const html = '<button onclick="evil()">Click</button>';
      expect(sanitizeHtml(html)).not.toContain('onclick');
    });

    it('removes data attributes', () => {
      const html = '<div data-evil="xss">Content</div>';
      expect(sanitizeHtml(html)).not.toContain('data-evil');
    });

    it('allows code and pre tags', () => {
      const html = '<pre><code>console.log("hello")</code></pre>';
      expect(sanitizeHtml(html)).toBe('<pre><code>console.log("hello")</code></pre>');
    });

    it('allows table tags', () => {
      const html = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
      expect(sanitizeHtml(html)).toBe(html);
    });

    it('removes form and input tags', () => {
      const html = '<form><input type="text"></form>';
      expect(sanitizeHtml(html)).toBe('');
    });

    it('handles nested allowed tags', () => {
      const html = '<div><p><strong>Nested</strong></p></div>';
      expect(sanitizeHtml(html)).toBe('<div><p><strong>Nested</strong></p></div>');
    });

    it('removes unknown tags', () => {
      const html = '<custom-tag>Content</custom-tag>';
      expect(sanitizeHtml(html)).toBe('Content');
    });

    it('preserves allowed attributes', () => {
      const html = '<a href="https://example.com" title="Tooltip" class="link" id="link1">Link</a>';
      const result = sanitizeHtml(html);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('title="Tooltip"');
      expect(result).toContain('class="link"');
      expect(result).toContain('id="link1"');
      // DOMPurify allows rel attribute but doesn't auto-add noopener
    });
  });

  describe('sanitizeUrl', () => {
    it('allows https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('allows http URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('allows mailto URLs', () => {
      expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
    });

    it('blocks ftp URLs', () => {
      expect(sanitizeUrl('ftp://example.com')).toBe('#');
    });

    it('blocks javascript URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
    });

    it('blocks data URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    });

    it('blocks invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBe('#');
    });

    it('blocks empty string', () => {
      expect(sanitizeUrl('')).toBe('#');
    });

    it('handles URLs with paths and query params', () => {
      expect(sanitizeUrl('https://example.com/path?query=value')).toBe('https://example.com/path?query=value');
    });
  });

  describe('sanitizeMarkdownHtml', () => {
    it('uses sanitizeHtml internally', () => {
      const html = '<p>Safe</p><script>alert(1)</script>';
      expect(sanitizeMarkdownHtml(html)).toBe('<p>Safe</p>');
    });
  });

  describe('escapeHtml', () => {
    it('escapes &', () => {
      expect(escapeHtml('A & B')).toBe('A & B');
    });

    it('escapes <', () => {
      expect(escapeHtml('<script>')).toBe('<script>');
    });

    it('escapes >', () => {
      expect(escapeHtml('>')).toBe('>');
    });

    it('escapes " ', () => {
      expect(escapeHtml('"quote"')).toBe('"quote"');
    });

    it('escapes \'', () => {
      expect(escapeHtml("it's")).toBe('it&#039;s');
    });

    it('escapes all characters together', () => {
      const input = '&<>"\'';
      expect(escapeHtml(input)).toBe('&<>"&#039;');
    });

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('handles text without special chars', () => {
      expect(escapeHtml('Hello world')).toBe('Hello world');
    });
  });
});