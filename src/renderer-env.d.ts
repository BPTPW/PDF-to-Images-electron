import type { ConversionOptions, ConversionResult } from './types';
import type { ReleaseInfo } from './update';

declare global {
    interface Window {
        pdfApi: {
            chooseFiles(): Promise<string[]>;
            chooseDirectory(): Promise<string[]>;
            scanDirectory(directoryPath: string): Promise<string[]>;
            convert(options: ConversionOptions): Promise<ConversionResult>;
            outputDirectory(inputPath: string): Promise<string>;
            checkForUpdate(): Promise<ReleaseInfo | null>;
            openExternal(url: string): Promise<void>;
            pathFromFile(file: File): string;
        };
    }
}

export {};
