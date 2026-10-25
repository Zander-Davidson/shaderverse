// Turns driver info logs into structured errors. Lines that match no known
// format are kept as general errors (line null) rather than dropped.

import { WRAPPER_MAIN_LINE } from './wrapper';

export interface ShaderError {
  /** 1-based line in the user's source, or null for general errors. */
  line: number | null;
  message: string;
  severity: 'error' | 'warning';
}

const PATTERNS: RegExp[] = [
  // ANGLE (Chrome, Edge, Safari, Firefox on Windows): "ERROR: 0:12: 'x' : undeclared identifier"
  /^(ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/i,
  // Mesa: "0:12(5): error: ..."
  /^\d+:(\d+)\(\d+\):\s*(error|warning):\s*(.*)$/i,
  // NVIDIA: "0(12) : error C0000: ..."
  /^\d+\((\d+)\)\s*:\s*(error|warning)\s*(?:\w+)?:\s*(.*)$/i,
];

const NOISE = [/^ERROR:\s*\d+ compilation errors?\.?\s*No code generated\.?$/i, /^\s*$/, /^\0$/];

function cleanMessage(msg: string): string {
  return msg.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
}

export function parseInfoLog(log: string, userLineCount = Infinity): ShaderError[] {
  const out: ShaderError[] = [];
  for (const raw of log.split(/\r?\n/)) {
    const lineText = raw.trim();
    if (NOISE.some((re) => re.test(lineText))) continue;

    let parsed: ShaderError | null = null;
    const ang = PATTERNS[0]!.exec(lineText);
    if (ang) {
      parsed = {
        line: Number(ang[2]),
        message: cleanMessage(ang[3]!),
        severity: ang[1]!.toLowerCase() === 'warning' ? 'warning' : 'error',
      };
    }
    for (const re of PATTERNS.slice(1)) {
      if (parsed) break;
      const m = re.exec(lineText);
      if (m) {
        parsed = {
          line: Number(m[1]),
          message: cleanMessage(m[3]!),
          severity: m[2]!.toLowerCase() === 'warning' ? 'warning' : 'error',
        };
      }
    }
    if (!parsed) {
      parsed = { line: null, message: cleanMessage(lineText), severity: 'error' };
    }
    // Errors in the generated wrapper, or on lines before the user's code,
    // belong to no user line.
    if (parsed.line !== null && (parsed.line >= WRAPPER_MAIN_LINE || parsed.line < 1 || parsed.line > userLineCount)) {
      parsed.line = null;
    }
    if (parsed.message) out.push(parsed);
  }
  return out;
}
