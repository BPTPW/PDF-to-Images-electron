import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ConversionOptions } from './types';

export function pageNumberWidth(totalPages: number): number {
    if (totalPages <= 10) return 1;
    if (totalPages <= 100) return 2;
    if (totalPages <= 1000) return 3;
    return String(totalPages).length;
}

export function outputDirectoryFor(inputPath: string): string {
    return join(dirname(inputPath), basename(inputPath, extname(inputPath)));
}

export function resolvePdftocairoPath(options?: {
    isPackaged?: boolean;
    resourcesPath?: string;
    cwd?: string;
}): string {
    const executable =
        process.platform === 'win32' ? 'pdftocairo.exe' : 'pdftocairo';
    const platformDirectory = `${process.platform}-${process.arch}`;
    const isPackaged = options?.isPackaged ?? !process.defaultApp;
    const root = isPackaged
        ? (options?.resourcesPath ?? process.resourcesPath)
        : join(options?.cwd ?? process.cwd(), 'resources');
    return (
        process.env.PDFTOCAIRO_PATH ||
        join(root, 'poppler', platformDirectory, executable)
    );
}

function popplerFormat(format: ConversionOptions['format']): string {
    return format === 'jpg' ? 'jpeg' : format;
}

async function runPdftocairo(
    inputPath: string,
    prefix: string,
    dpi: number,
    format: ConversionOptions['format'],
): Promise<void> {
    const executable = resolvePdftocairoPath();
    await new Promise<void>((resolve, reject) => {
        const child = spawn(
            executable,
            [`-${popplerFormat(format)}`, '-r', String(dpi), inputPath, prefix],
            { windowsHide: true },
        );
        let stderr = '';
        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });
        child.on('error', (error) => {
            reject(
                new Error(
                    `无法启动 PDF 渲染器（${executable}）：${error.message}`,
                ),
            );
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else
                reject(
                    new Error(
                        stderr.trim() || `PDF 渲染失败，退出代码 ${code}`,
                    ),
                );
        });
    });
}

function pageIndex(fileName: string): number {
    const match = fileName.match(/-(\d+)\.(?:png|jpe?g|tiff?)$/i);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export async function convertPdf(
    options: ConversionOptions,
): Promise<{ outputDirectory: string; pageCount: number }> {
    await access(options.inputPath);
    const outputDirectory = outputDirectoryFor(options.inputPath);
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pdf-to-images-'));
    const prefix = join(temporaryDirectory, 'page');

    try {
        await runPdftocairo(
            options.inputPath,
            prefix,
            options.dpi,
            options.format,
        );
        const pages = (await readdir(temporaryDirectory))
            .filter((file) => /-\d+\.(?:png|jpe?g|tiff?)$/i.test(file))
            .sort((left, right) => pageIndex(left) - pageIndex(right));
        if (pages.length === 0)
            throw new Error('未生成任何页面，请确认 PDF 文件有效且未加密。');

        await mkdir(outputDirectory, { recursive: true });
        const width = pageNumberWidth(pages.length);
        for (let index = 0; index < pages.length; index += 1) {
            const number = String(index + 1).padStart(width, '0');
            await rename(
                join(temporaryDirectory, pages[index]),
                join(outputDirectory, `${number}.${options.format}`),
            );
        }
        return { outputDirectory, pageCount: pages.length };
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}
