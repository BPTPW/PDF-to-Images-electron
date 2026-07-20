import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ConversionOptions } from './types';
import type { ReleaseInfo, UpdateProgress } from './update';

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
    checkForUpdate: (): Promise<ReleaseInfo | null> =>
        ipcRenderer.invoke('update:check'),
    startUpdateDownload: (): Promise<void> =>
        ipcRenderer.invoke('update:download'),
    cancelUpdateDownload: (): Promise<void> =>
        ipcRenderer.invoke('update:cancel'),
    onUpdateProgress: (listener: (progress: UpdateProgress) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            progress: UpdateProgress,
        ) => listener(progress);
        ipcRenderer.on('update:progress', handler);
        return () => ipcRenderer.removeListener('update:progress', handler);
    },
    openExternal: (url: string): Promise<void> =>
        ipcRenderer.invoke('shell:open-external', url),
    pathFromFile: (file: File): string => webUtils.getPathForFile(file),
});
