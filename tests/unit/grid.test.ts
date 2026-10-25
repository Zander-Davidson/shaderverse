import { describe, expect, it } from 'vitest';
import { columnOf, lineWidth, offsetAt } from '../../src/editor/grid';

describe('editor text grid', () => {
  it('counts plain characters one column each', () => {
    expect(columnOf('float x;', 5)).toBe(5);
    expect(offsetAt('float x;', 5)).toBe(5);
  });

  it('expands tabs to tab stops', () => {
    expect(columnOf('\tx', 1)).toBe(4);
    expect(columnOf('ab\tx', 3)).toBe(4);
    expect(columnOf('abcd\tx', 5)).toBe(8);
    expect(lineWidth('\t\tx')).toBe(9);
  });

  it('maps columns back to the nearest character', () => {
    expect(offsetAt('\tx', 0)).toBe(0);
    expect(offsetAt('\tx', 1.9)).toBe(0);
    expect(offsetAt('\tx', 2.1)).toBe(1);
    expect(offsetAt('\tx', 4.4)).toBe(1);
    expect(offsetAt('\tx', 4.6)).toBe(2);
  });

  it('clamps past the end of the line', () => {
    expect(offsetAt('abc', 99)).toBe(3);
    expect(offsetAt('', 3)).toBe(0);
    expect(offsetAt('abc', -2)).toBe(0);
  });

  it('round-trips every offset', () => {
    const line = 'a\tbc\t\td e';
    for (let i = 0; i <= line.length; i++) expect(offsetAt(line, columnOf(line, i))).toBe(i);
  });
});
