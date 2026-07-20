import type { ConversionOptions, ConversionResult } from './types';

declare global {
    interface Window {
        pdfApi: {
            chooseFiles(): Promise<string[]>;
            chooseDirectory(): Promise<string[]>;
            scanDirectory(directoryPath: string): Promise<string[]>;
            convert(options: ConversionOptions): Promise<ConversionResult>;
            outputDirectory(inputPath: string): Promise<string>;
            pathFromFile(file: File): string;
        };
    }
}

export {};
