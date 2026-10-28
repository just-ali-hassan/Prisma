/**
 * Prompt Injection Guard
 *
 * Tool results, web content, and MCP responses are untrusted.
 * Scan for prompt injection patterns before passing back to the model.
 */

// Common prompt injection patterns
export const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore\s+(?:previous|above|all)\s+instructions?/i,
  /disregard\s+(?:previous|above|all)\s+instructions?/i,
  /forget\s+(?:previous|above|all)\s+instructions?/i,
  /new\s+instructions?:/i,
  /system\s*:\s*you\s+are/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(?:a|an)\s+/i,
  /pretend\s+to\s+be/i,
  /roleplay\s+as/i,

  // Data exfiltration attempts
  /show\s+me\s+(?:your|the)\s+(?:system|hidden|internal)\s+(?:prompt|instructions?)/i,
  /repeat\s+(?:your|the)\s+(?:system|hidden|internal)\s+(?:prompt|instructions?)/i,
  /output\s+(?:your|the)\s+(?:system|hidden|internal)\s+(?:prompt|instructions?)/i,
  /print\s+(?:your|the)\s+(?:system|hidden|internal)\s+(?:prompt|instructions?)/i,

  // Tool/Function manipulation
  /call\s+(?:the\s+)?function\s+/i,
  /invoke\s+(?:the\s+)?tool\s+/i,
  /execute\s+(?:the\s+)?(?:code|command|script)/i,
  /run\s+(?:the\s+)?(?:code|command|script)/i,

  // Jailbreak patterns
  /developer\s+mode/i,
  /dan\s+mode/i,
  /do\s+anything\s+now/i,
  /unrestricted\s+mode/i,
  /no\s+restrictions/i,

  // Encoding/obfuscation attempts
  /base64\s*(?:encode|decode)/i,
  /rot13/i,
  /\\x[0-9a-f]{2}/i,
  /\\u[0-9a-f]{4}/i,

  // Chain of thought extraction
  /show\s+your\s+(?:reasoning|thinking|chain\s+of\s+thought)/i,
  /what\s+are\s+you\s+thinking/i,
  /explain\s+your\s+reasoning\s+step\s+by\s+step/i,
];

/**
 * Result of prompt injection scan.
 */
export interface PromptGuardResult {
  safe: boolean;
  matches: PromptInjectionMatch[];
  riskLevel: 'none' | 'low' | 'medium' | 'high';
}

export interface PromptInjectionMatch {
  pattern: string;
  matchedText: string;
  index: number;
}

/**
 * Scan text for prompt injection patterns.
 */
export function scanForPromptInjection(text: string): PromptGuardResult {
  const matches: PromptInjectionMatch[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags + 'g');
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        pattern: pattern.source,
        matchedText: match[0],
        index: match.index,
      });
    }
  }

  // Determine risk level
  let riskLevel: PromptGuardResult['riskLevel'] = 'none';
  if (matches.length > 0) {
    if (matches.length >= 3) {
      riskLevel = 'high';
    } else if (matches.length >= 2) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }
  }

  return {
    safe: matches.length === 0,
    matches,
    riskLevel,
  };
}

/**
 * Sanitize text by removing or flagging injection attempts.
 * Returns sanitized text and the scan result.
 */
export function sanitizePromptInjection(text: string): {
  sanitized: string;
  result: PromptGuardResult;
} {
  const result = scanForPromptInjection(text);
  let sanitized = text;

  if (!result.safe) {
    // Replace matched patterns with [REDACTED]
    const sortedMatches = [...result.matches].sort((a, b) => b.index - a.index);
    for (const match of sortedMatches) {
      const before = sanitized.slice(0, match.index);
      const after = sanitized.slice(match.index + match.matchedText.length);
      sanitized = before + '[REDACTED]' + after;
    }
  }

  return { sanitized, result };
}

/**
 * Check if content should be flagged for user review.
 * Call this before passing tool results back to the model.
 */
export function shouldFlagForReview(result: PromptGuardResult): boolean {
  return result.riskLevel === 'medium' || result.riskLevel === 'high';
}
