import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { join } from 'node:path';
import { convertPdf, outputDirectoryFor } from './conversion';
import type { ConversionOptions } from './types';

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 840,
        height: 550,
        minWidth: 680,
        minHeight: 580,
        show: false,
        webPreferences: {
            preload: join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    else
        mainWindow.loadFile(
            join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        );
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    ipcMain.handle('pdf:choose', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: '选择 PDF 文件',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle(
        'pdf:convert',
        async (_event, options: ConversionOptions) => {
            if (
                !options ||
                !['png', 'jpg', 'tiff'].includes(options.format) ||
                !Number.isFinite(options.dpi)
            ) {
                throw new Error('转换参数无效。');
            }
            return convertPdf(options);
        },
    );

    ipcMain.handle('pdf:output-directory', (_event, inputPath: string) =>
        outputDirectoryFor(inputPath),
    );
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
