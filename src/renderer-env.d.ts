import type { ConversionOptions, ConversionResult } from './types';

declare global {
    interface Window {
        pdfApi: {
            chooseFile(): Promise<string | null>;
            convert(options: ConversionOptions): Promise<ConversionResult>;
            outputDirectory(inputPath: string): Promise<string>;
            pathFromFile(file: File): string;
        };
    }
}

export {};
