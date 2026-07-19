export type ImageFormat = 'png' | 'jpg' | 'tiff';

export interface ConversionOptions {
  inputPath: string;
  format: ImageFormat;
  dpi: number;
}

export interface ConversionResult {
  outputDirectory: string;
  pageCount: number;
}
