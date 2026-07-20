import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Menu,
    session,
    shell,
} from 'electron';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import originalFs = require('original-fs');
import { openPromise, validateFileName } from 'yauzl';
import { convertPdf, outputDirectoryFor } from './conversion';
import { findPdfFiles } from './files';
import type { ConversionOptions } from './types';
import {
    isNewerVersion,
    type ReleaseInfo,
    type UpdateProgress,
} from './update';

let mainWindow: BrowserWindow | undefined;
let updateDownloadUrl: string | undefined;
let updateAbortController: AbortController | undefined;
let updateInProgress = false;

const UPDATE_ASSET_NAME = 'pdf-to-images-win32-x64.zip';

interface GitHubRelease {
    tag_name?: unknown;
    body?: unknown;
    assets?: unknown;
}

interface GitHubReleaseAsset {
    name?: unknown;
    browser_download_url?: unknown;
}

async function checkForUpdate(): Promise<ReleaseInfo | null> {
    updateDownloadUrl = undefined;
    try {
        const response = await session.defaultSession.fetch(
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
        const asset = Array.isArray(release.assets)
            ? (release.assets as GitHubReleaseAsset[]).find(
                  (candidate) => candidate.name === UPDATE_ASSET_NAME,
              )
            : undefined;
        if (
            typeof release.tag_name !== 'string' ||
            typeof asset?.browser_download_url !== 'string' ||
            !isNewerVersion(release.tag_name, app.getVersion())
        ) {
            return null;
        }
        const downloadUrl = new URL(asset.browser_download_url);
        if (downloadUrl.protocol !== 'https:') return null;
        updateDownloadUrl = downloadUrl.toString();
        return {
            version: release.tag_name.replace(/^v/i, ''),
            currentVersion: app.getVersion(),
            notes: typeof release.body === 'string' ? release.body : '',
        };
    } catch {
        return null;
    }
}

function sendUpdateProgress(progress: UpdateProgress): void {
    mainWindow?.webContents.send('update:progress', progress);
}

interface ZipMetadata {
    uncompressedBytes: number;
}

async function inspectZipArchive(archivePath: string): Promise<ZipMetadata> {
    const archive = await openPromise(archivePath, { lazyEntries: true });
    let uncompressedBytes = 0;

    try {
        for await (const entry of archive.eachEntry()) {
            if (!entry.fileName.endsWith('/')) {
                uncompressedBytes += entry.uncompressedSize;
            }
        }
        return { uncompressedBytes };
    } finally {
        archive.close();
    }
}

async function extractArchive(
    archivePath: string,
    extractDirectory: string,
    totalBytes: number,
): Promise<void> {
    const archive = await openPromise(archivePath, { lazyEntries: true });
    let extractedBytes = 0;
    let lastProgressAt = 0;

    try {
        for await (const entry of archive.eachEntry()) {
            const invalidPath = validateFileName(entry.fileName);
            if (invalidPath)
                throw new Error(`更新包包含无效文件路径：${invalidPath}`);

            const destinationPath = join(extractDirectory, entry.fileName);
            if (entry.fileName.endsWith('/')) {
                await mkdir(destinationPath, { recursive: true });
                continue;
            }

            await mkdir(dirname(destinationPath), { recursive: true });
            const input = await archive.openReadStreamPromise(entry);
            // Electron treats paths ending in .asar as archives unless original-fs is used.
            const output = originalFs.createWriteStream(destinationPath);
            try {
                for await (const chunk of input) {
                    const byteLength = Buffer.isBuffer(chunk)
                        ? chunk.length
                        : Buffer.byteLength(chunk);
                    if (!output.write(chunk)) await once(output, 'drain');
                    extractedBytes += byteLength;

                    const now = Date.now();
                    if (now - lastProgressAt >= 100) {
                        sendUpdateProgress({
                            phase: 'extract',
                            percent: totalBytes
                                ? Math.min(
                                      (extractedBytes / totalBytes) * 100,
                                      100,
                                  )
                                : 100,
                        });
                        lastProgressAt = now;
                    }
                }
            } finally {
                output.end();
                await finished(output);
            }
        }
        sendUpdateProgress({ phase: 'extract', percent: 100 });
    } finally {
        archive.close();
    }
}

async function directoryExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function installationDirectory(
    extractDirectory: string,
): Promise<string> {
    if (await directoryExists(join(extractDirectory, 'resources'))) {
        return extractDirectory;
    }

    const entries = await readdir(extractDirectory, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    if (directories.length !== 1) {
        throw new Error('更新包目录结构无效。');
    }
    const installationPath = join(extractDirectory, directories[0].name);
    if (!(await directoryExists(join(installationPath, 'resources')))) {
        throw new Error('更新包不包含应用程序文件。');
    }
    return installationPath;
}

function vbsLiteral(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

async function waitForFile(path: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await directoryExists(path)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}

async function handoffInstallation(
    sourceDirectory: string,
    stagingDirectory: string,
): Promise<void> {
    const targetDirectory = dirname(process.execPath);
    const readyPath = join(stagingDirectory, '.updater-ready');
    const updateDirectory = dirname(stagingDirectory);
    const logPath = join(updateDirectory, 'updater.log');
    const scriptPath = join(updateDirectory, `updater-${Date.now()}.vbs`);
    const script = [
        'Option Explicit',
        'Dim fso, shell, processEnvironment, readyFile, sourceDirectory, targetDirectory, executablePath, stagingDirectory, readyPath, logPath, copyExitCode, launchError',
        'Set fso = CreateObject("Scripting.FileSystemObject")',
        'Set shell = CreateObject("WScript.Shell")',
        `sourceDirectory = ${vbsLiteral(sourceDirectory)}`,
        `targetDirectory = ${vbsLiteral(targetDirectory)}`,
        `executablePath = ${vbsLiteral(process.execPath)}`,
        `stagingDirectory = ${vbsLiteral(stagingDirectory)}`,
        `readyPath = ${vbsLiteral(readyPath)}`,
        `logPath = ${vbsLiteral(logPath)}`,
        'Function Quote(value)',
        '    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)',
        'End Function',
        'Sub Fail(message)',
        '    Dim logFile',
        '    Set logFile = fso.OpenTextFile(logPath, 2, True, -1)',
        '    logFile.Write message',
        '    logFile.Close',
        '    WScript.Quit 1',
        'End Sub',
        'On Error Resume Next',
        'Set readyFile = fso.CreateTextFile(readyPath, True)',
        'readyFile.Close',
        'If Err.Number <> 0 Then',
        '    Fail "Unable to create updater readiness file: " & Err.Description',
        'End If',
        'On Error GoTo 0',
        'WScript.Sleep 3000',
        'copyExitCode = shell.Run("robocopy.exe " & Quote(sourceDirectory) & " " & Quote(targetDirectory) & " /E /COPY:DAT /R:30 /W:1 /NFL /NDL /NJH /NJS /NP", 0, True)',
        'If copyExitCode > 7 Then',
        '    Fail "robocopy failed with exit code " & copyExitCode',
        'End If',
        'If Not fso.FileExists(executablePath) Then',
        '    Fail "Updated application executable was not found"',
        'End If',
        'shell.CurrentDirectory = targetDirectory',
        'On Error Resume Next',
        'Set processEnvironment = shell.Environment("PROCESS")',
        'processEnvironment.Remove("ELECTRON_RUN_AS_NODE")',
        'Err.Clear',
        // SW_HIDE would be inherited by Electron's GUI process and can leave
        // the new application running without ever showing a BrowserWindow.
        // Use the normal window style only for the restarted application.
        'shell.Run Quote(executablePath), 1, False',
        'launchError = Err.Number',
        'If launchError <> 0 Then',
        '    Fail "Unable to restart the updated application: " & Err.Description',
        'End If',
        'On Error GoTo 0',
        'On Error Resume Next',
        'fso.DeleteFolder stagingDirectory, True',
        'On Error GoTo 0',
    ].join('\r\n');
    const utf16Script = Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(script, 'utf16le'),
    ]);
    await originalFs.promises.writeFile(scriptPath, utf16Script);
    const cscriptPath = join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'cscript.exe',
    );

    const updater = spawn(cscriptPath, ['//nologo', scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    let launchError: Error | undefined;
    updater.once('error', (error) => {
        launchError = error;
    });

    if (!(await waitForFile(readyPath, 5_000))) {
        const reason = launchError ? `：${launchError.message}` : '';
        throw new Error(`更新助手未能启动${reason}。请查看 ${logPath}`);
    }
    updater.unref();
}

async function downloadUpdateArchive(
    downloadUrl: string,
    archivePath: string,
    signal: AbortSignal,
): Promise<void> {
    const response = await session.defaultSession.fetch(downloadUrl, {
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error('无法下载更新文件。');
    }

    const contentLength = Number(response.headers.get('content-length'));
    const totalBytes =
        Number.isFinite(contentLength) && contentLength > 0
            ? contentLength
            : undefined;
    const reader = response.body.getReader();
    const output = createWriteStream(archivePath);
    let downloadedBytes = 0;
    let lastProgressAt = 0;
    const startedAt = Date.now();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            downloadedBytes += value.byteLength;
            if (!output.write(value)) await once(output, 'drain');

            const now = Date.now();
            if (now - lastProgressAt >= 150 || downloadedBytes === totalBytes) {
                const elapsedSeconds = Math.max(
                    (now - startedAt) / 1_000,
                    0.001,
                );
                const speedBytesPerSecond = downloadedBytes / elapsedSeconds;
                sendUpdateProgress({
                    phase: 'download',
                    percent: totalBytes
                        ? Math.min((downloadedBytes / totalBytes) * 100, 100)
                        : 0,
                    downloadedBytes,
                    totalBytes,
                    speedBytesPerSecond,
                    remainingSeconds:
                        totalBytes && speedBytesPerSecond > 0
                            ? (totalBytes - downloadedBytes) /
                              speedBytesPerSecond
                            : undefined,
                });
                lastProgressAt = now;
            }
        }
    } finally {
        output.end();
        await finished(output);
    }
}

async function downloadAndInstallUpdate(downloadUrl: string): Promise<void> {
    if (!app.isPackaged || process.platform !== 'win32') {
        throw new Error('更新安装仅支持已打包的 Windows 应用。');
    }

    const updateDirectory = join(dirname(process.execPath), '.update-temp');
    const stagingDirectory = join(
        updateDirectory,
        `pdf-to-images-update-${Date.now()}`,
    );
    const archivePath = join(stagingDirectory, UPDATE_ASSET_NAME);
    const extractDirectory = join(stagingDirectory, 'extracted');
    let handedOff = false;

    try {
        await mkdir(updateDirectory, { recursive: true });
        await mkdir(extractDirectory, { recursive: true });
        updateAbortController = new AbortController();
        await downloadUpdateArchive(
            downloadUrl,
            archivePath,
            updateAbortController.signal,
        );
        updateAbortController = undefined;

        const archiveMetadata = await inspectZipArchive(archivePath);
        sendUpdateProgress({ phase: 'extract', percent: 0 });
        await extractArchive(
            archivePath,
            extractDirectory,
            archiveMetadata.uncompressedBytes,
        );

        await handoffInstallation(
            await installationDirectory(extractDirectory),
            stagingDirectory,
        );
        handedOff = true;
        app.quit();
    } finally {
        updateAbortController = undefined;
        if (!handedOff) {
            try {
                await originalFs.promises.rm(stagingDirectory, {
                    recursive: true,
                    force: true,
                });
            } catch {
                // Preserve the update error instead of replacing it with cleanup failure.
            }
        }
    }
}

function startUpdateDownload(): void {
    if (updateInProgress) throw new Error('更新正在进行中。');
    if (!updateDownloadUrl) throw new Error('更新文件不可用。');

    updateInProgress = true;
    void downloadAndInstallUpdate(updateDownloadUrl)
        .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
                sendUpdateProgress({ phase: 'cancelled', percent: 0 });
                return;
            }
            sendUpdateProgress({
                phase: 'error',
                percent: 0,
                message: error instanceof Error ? error.message : '更新失败。',
            });
        })
        .finally(() => {
            updateInProgress = false;
        });
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
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    else
        mainWindow.loadFile(
            join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        );
}

app.whenReady().then(async () => {
    await session.defaultSession.setProxy({ mode: 'system' });
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
    ipcMain.handle('update:download', startUpdateDownload);
    ipcMain.handle('update:cancel', () => updateAbortController?.abort());
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
