import { describe, expect, it } from 'vitest';
import { outputDirectoryFor, pageNumberWidth } from '../src/conversion';

describe('output naming', () => {
  it('uses the requested page-count ranges', () => {
    expect(pageNumberWidth(1)).toBe(1);
    expect(pageNumberWidth(10)).toBe(1);
    expect(pageNumberWidth(11)).toBe(2);
    expect(pageNumberWidth(100)).toBe(2);
    expect(pageNumberWidth(101)).toBe(3);
  });

  it('writes output beside the source PDF', () => {
    expect(outputDirectoryFor('E:\\docs\\report.pdf')).toBe('E:\\docs\\report');
  });
});
