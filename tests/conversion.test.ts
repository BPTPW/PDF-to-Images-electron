import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outputDirectoryFor, pageNumberWidth } from '../src/conversion';
import { findPdfFiles } from '../src/files';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

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

describe('directory PDF discovery', () => {
  it('recursively returns PDF files and ignores other entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pdf-to-images-'));
    temporaryDirectories.push(directory);
    const nestedDirectory = join(directory, 'nested');
    await mkdir(nestedDirectory);
    await Promise.all([
      writeFile(join(directory, 'first.PDF'), ''),
      writeFile(join(directory, 'notes.txt'), ''),
      writeFile(join(nestedDirectory, 'second.pdf'), ''),
    ]);

    await expect(findPdfFiles(directory)).resolves.toEqual([
      join(directory, 'first.PDF'),
      join(nestedDirectory, 'second.pdf'),
    ]);
  });
});
