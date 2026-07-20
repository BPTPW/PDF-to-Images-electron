import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';
import { convertPdf, outputDirectoryFor } from './conversion';
import { findPdfFiles } from './files';
import type { ConversionOptions } from './types';
import { isNewerVersion, type ReleaseInfo } from './update';

let mainWindow: BrowserWindow | undefined;

interface GitHubRelease {
    tag_name?: unknown;
    body?: unknown;
}

async function checkForUpdate(): Promise<ReleaseInfo | null> {
    try {
        const response = await fetch(
            'https://api.github.com/repos/BPTPW/PDF-to-Images-electron/releases/latest',
            {
                headers: {
                    Accept: 'application/vnd.github+json',
                    'User-Agent': 'PDF-to-Images-electron',
                },
                signal: AbortSignal.timeout(5_000),
            },
        );
        if (!response.ok) return null;

        const release = (await response.json()) as GitHubRelease;
        if (
            typeof release.tag_name !== 'string' ||
            !isNewerVersion(release.tag_name, app.getVersion())
        ) {
            return null;
        }
        return {
            version: release.tag_name.replace(/^v/i, ''),
            currentVersion: app.getVersion(),
            notes: typeof release.body === 'string' ? release.body : '',
        };
    } catch {
        return null;
    }
}

async function openExternalUrl(url: string): Promise<void> {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('不支持的链接协议。');
    }
    await shell.openExternal(parsedUrl.toString());
}

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

    ipcMain.handle('pdf:choose-directory', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: '选择包含 PDF 文件的目录',
            properties: ['openDirectory'],
        });
        return result.canceled ? [] : findPdfFiles(result.filePaths[0]);
    });

    ipcMain.handle('pdf:scan-directory', (_event, directoryPath: string) => {
        if (typeof directoryPath !== 'string' || directoryPath.length === 0) {
            throw new Error('目录路径无效。');
        }
        return findPdfFiles(directoryPath);
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
    ipcMain.handle('update:check', checkForUpdate);
    ipcMain.handle('shell:open-external', (_event, url: string) => {
        if (typeof url !== 'string') throw new Error('链接无效。');
        return openExternalUrl(url);
    });
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
