// Monospace text grid for the curved editor: maps between character offsets
// in a line and display columns, with tabs expanded to tab stops. Pure, so the
// drawing and the pointer mapping agree exactly.

export const TAB_SIZE = 4;

/** Display column at which character `ch` of `line` starts. */
export function columnOf(line: string, ch: number, tabSize = TAB_SIZE): number {
  let col = 0;
  for (let i = 0; i < ch && i < line.length; i++) {
    col = line[i] === '\t' ? (Math.floor(col / tabSize) + 1) * tabSize : col + 1;
  }
  return col;
}

/** Character offset nearest to display column `col` (ties go right). */
export function offsetAt(line: string, col: number, tabSize = TAB_SIZE): number {
  let c = 0;
  for (let i = 0; i < line.length; i++) {
    const next = line[i] === '\t' ? (Math.floor(c / tabSize) + 1) * tabSize : c + 1;
    if (col < (c + next) / 2) return i;
    c = next;
  }
  return line.length;
}

/** Display width of a whole line. */
export const lineWidth = (line: string, tabSize = TAB_SIZE) => columnOf(line, line.length, tabSize);
