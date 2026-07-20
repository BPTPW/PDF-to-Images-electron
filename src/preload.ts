import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ConversionOptions } from './types';

contextBridge.exposeInMainWorld('pdfApi', {
    chooseFiles: (): Promise<string[]> => ipcRenderer.invoke('pdf:choose'),
    chooseDirectory: (): Promise<string[]> =>
        ipcRenderer.invoke('pdf:choose-directory'),
    scanDirectory: (directoryPath: string): Promise<string[]> =>
        ipcRenderer.invoke('pdf:scan-directory', directoryPath),
    convert: (options: ConversionOptions) =>
        ipcRenderer.invoke('pdf:convert', options),
    outputDirectory: (inputPath: string): Promise<string> =>
        ipcRenderer.invoke('pdf:output-directory', inputPath),
    pathFromFile: (file: File): string => webUtils.getPathForFile(file),
});
