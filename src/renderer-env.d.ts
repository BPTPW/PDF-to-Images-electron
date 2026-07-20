import type { ConversionOptions, ConversionResult } from './types';
import type { ReleaseInfo, UpdateProgress } from './update';

declare global {
    interface Window {
        pdfApi: {
            chooseFiles(): Promise<string[]>;
            chooseDirectory(): Promise<string[]>;
            scanDirectory(directoryPath: string): Promise<string[]>;
            convert(options: ConversionOptions): Promise<ConversionResult>;
            outputDirectory(inputPath: string): Promise<string>;
            checkForUpdate(): Promise<ReleaseInfo | null>;
            startUpdateDownload(): Promise<void>;
            cancelUpdateDownload(): Promise<void>;
            onUpdateProgress(
                listener: (progress: UpdateProgress) => void,
            ): () => void;
            openExternal(url: string): Promise<void>;
            pathFromFile(file: File): string;
        };
    }
}

export {};
