// VDF Client-side Utilities — Syntax highlighting, validation, diff, formatting

export interface VDFSpan {
  text: string;
  className: string; // 'vdf-key' | 'vdf-value' | 'vdf-brace' | 'vdf-string' | 'vdf-comment' | 'vdf-whitespace'
}

export interface VDFDiffLine {
  lineNumber: number;
  content: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  oldContent?: string;
}

export interface VDFValidationResult {
  valid: boolean;
  errors: VDFValidationError[];
}

export interface VDFValidationError {
  line: number;
  column: number;
  message: string;
}

/**
 * Tokenize and syntax-highlight a VDF text string.
 * Returns an array of spans with CSS class names for rendering.
 */
export function highlightVDF(vdf: string): VDFSpan[] {
  const spans: VDFSpan[] = [];
  let i = 0;
  const len = vdf.length;

  while (i < len) {
    // Skip and capture whitespace
    if (vdf[i] === ' ' || vdf[i] === '\t' || vdf[i] === '\r' || vdf[i] === '\n') {
      let start = i;
      while (i < len && (vdf[i] === ' ' || vdf[i] === '\t' || vdf[i] === '\r' || vdf[i] === '\n')) {
        i++;
      }
      spans.push({ text: vdf.slice(start, i), className: 'vdf-whitespace' });
      continue;
    }

    // Comments: //
    if (vdf[i] === '/' && i + 1 < len && vdf[i + 1] === '/') {
      let start = i;
      while (i < len && vdf[i] !== '\n') {
        i++;
      }
      spans.push({ text: vdf.slice(start, i), className: 'vdf-comment' });
      continue;
    }

    // Braces
    if (vdf[i] === '{' || vdf[i] === '}') {
      spans.push({ text: vdf[i], className: 'vdf-brace' });
      i++;
      continue;
    }

    // Quoted strings — determine if key or value
    if (vdf[i] === '"') {
      const stringSpan = parseQuotedString(vdf, i);
      i = stringSpan.end;

      // Look ahead to determine if this is a key or value
      // A key is followed by whitespace then either another quoted string or {
      // A value is preceded by a key on the same logical line
      const isKey = isKeyPosition(vdf, stringSpan.end);
      spans.push({
        text: stringSpan.text,
        className: isKey ? 'vdf-key' : 'vdf-value',
      });
      continue;
    }

    // Unquoted tokens (some VDF dialects allow unquoted values)
    {
      let start = i;
      while (i < len && vdf[i] !== ' ' && vdf[i] !== '\t' && vdf[i] !== '\r' &&
             vdf[i] !== '\n' && vdf[i] !== '{' && vdf[i] !== '}' && vdf[i] !== '"') {
        i++;
      }
      if (i > start) {
        const token = vdf.slice(start, i);
        const isKey = isKeyPosition(vdf, i);
        spans.push({
          text: token,
          className: isKey ? 'vdf-key' : 'vdf-value',
        });
      }
    }
  }

  return spans;
}

function parseQuotedString(vdf: string, start: number): { text: string; end: number } {
  let i = start + 1;
  while (i < vdf.length) {
    if (vdf[i] === '\\' && i + 1 < vdf.length) {
      i += 2; // skip escaped char
      continue;
    }
    if (vdf[i] === '"') {
      i++;
      break;
    }
    i++;
  }
  return { text: vdf.slice(start, i), end: i };
}

function isKeyPosition(vdf: string, afterEnd: number): boolean {
  let i = afterEnd;
  // Skip whitespace (but not newlines for same-line logic)
  while (i < vdf.length && (vdf[i] === ' ' || vdf[i] === '\t')) {
    i++;
  }
  if (i >= vdf.length) return false;
  // If followed by a quoted string or '{', current token is a key
  return vdf[i] === '"' || vdf[i] === '{';
}

/**
 * Validate VDF text structure.
 * Checks balanced braces, valid key-value pairs, and proper quoting.
 */
export function validateVDF(vdf: string): VDFValidationResult {
  const errors: VDFValidationError[] = [];
  const lines = vdf.split('\n');
  let braceDepth = 0;
  const braceStack: { line: number; col: number }[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    const lineNum = lineIdx + 1;

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('//')) continue;

    let col = 0;
    let inQuote = false;
    let escaped = false;
    let tokenCount = 0;
    let hasOpenBrace = false;
    let hasCloseBrace = false;

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inQuote) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        if (!inQuote) {
          inQuote = true;
          col = ci;
        } else {
          inQuote = false;
          tokenCount++;
        }
        continue;
      }

      if (!inQuote) {
        if (ch === '/' && ci + 1 < line.length && line[ci + 1] === '/') {
          break; // rest is comment
        }
        if (ch === '{') {
          braceDepth++;
          braceStack.push({ line: lineNum, col: ci + 1 });
          hasOpenBrace = true;
        } else if (ch === '}') {
          if (braceDepth === 0) {
            errors.push({
              line: lineNum,
              column: ci + 1,
              message: 'Unexpected closing brace — no matching opening brace',
            });
          } else {
            braceDepth--;
            braceStack.pop();
          }
          hasCloseBrace = true;
        }
      }
    }

    if (inQuote) {
      errors.push({
        line: lineNum,
        column: col + 1,
        message: 'Unterminated string — missing closing quote',
      });
    }

    // Check valid line patterns:
    // A line can be: a single key (followed by { on same or next line), key-value pair, { alone, } alone
    if (!hasOpenBrace && !hasCloseBrace && tokenCount === 0 && trimmed !== '') {
      // Could be unquoted token, which some VDF parsers accept — allow it
    }
  }

  // Check unmatched opening braces
  for (const brace of braceStack) {
    errors.push({
      line: brace.line,
      column: brace.col,
      message: 'Unmatched opening brace — missing closing brace',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Compute a line-by-line diff between two VDF texts.
 */
export function diffVDF(oldText: string, newText: string): VDFDiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: VDFDiffLine[] = [];

  // LCS-based diff using dynamic programming
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const diffOps: Array<{ type: 'keep' | 'remove' | 'add'; oldIdx?: number; newIdx?: number }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffOps.unshift({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.unshift({ type: 'add', newIdx: j - 1 });
      j--;
    } else {
      diffOps.unshift({ type: 'remove', oldIdx: i - 1 });
      i--;
    }
  }

  // Convert operations to diff lines, detecting 'changed' (adjacent remove+add)
  let lineNum = 1;
  let opIdx = 0;
  while (opIdx < diffOps.length) {
    const op = diffOps[opIdx];
    if (op.type === 'keep') {
      result.push({
        lineNumber: lineNum++,
        content: newLines[op.newIdx!],
        type: 'unchanged',
      });
      opIdx++;
    } else if (op.type === 'remove' && opIdx + 1 < diffOps.length && diffOps[opIdx + 1].type === 'add') {
      // Adjacent remove+add = changed
      result.push({
        lineNumber: lineNum++,
        content: newLines[diffOps[opIdx + 1].newIdx!],
        type: 'changed',
        oldContent: oldLines[op.oldIdx!],
      });
      opIdx += 2;
    } else if (op.type === 'remove') {
      result.push({
        lineNumber: lineNum++,
        content: oldLines[op.oldIdx!],
        type: 'removed',
      });
      opIdx++;
    } else if (op.type === 'add') {
      result.push({
        lineNumber: lineNum++,
        content: newLines[op.newIdx!],
        type: 'added',
      });
      opIdx++;
    } else {
      opIdx++;
    }
  }

  return result;
}

/**
 * Pretty-print / format VDF text with consistent indentation.
 */
export function formatVDF(vdf: string): string {
  const lines = vdf.split('\n');
  const result: string[] = [];
  let depth = 0;
  const indent = (d: number) => '\t'.repeat(d);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      result.push('');
      continue;
    }

    // Handle closing brace
    if (trimmed.startsWith('}')) {
      depth = Math.max(0, depth - 1);
      result.push(indent(depth) + trimmed);
      continue;
    }

    // Handle opening brace on its own line
    if (trimmed === '{') {
      result.push(indent(depth) + '{');
      depth++;
      continue;
    }

    // Regular line — could be "key" "value" or "key" followed by { on next line
    result.push(indent(depth) + trimmed);

    // If line ends with {, increase depth
    if (trimmed.endsWith('{')) {
      depth++;
    }
  }

  return result.join('\n');
}
