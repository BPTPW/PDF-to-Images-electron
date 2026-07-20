import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function findPdfFiles(directoryPath: string): Promise<string[]> {
    const pdfFiles: string[] = [];
    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            pdfFiles.push(...(await findPdfFiles(entryPath)));
        } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
            pdfFiles.push(entryPath);
        }
    }

    return pdfFiles;
}
