import type { ImageFormat } from './types';
import type { UpdateProgress } from './update';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import successIcon from './assets/success.svg?raw';
import errorIcon from './assets/error.svg?raw';

const fileList = document.querySelector<HTMLUListElement>('#file-list')!;
const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const browseButton =
    document.querySelector<HTMLButtonElement>('#browse-button')!;
const browseDirectoryButton = document.querySelector<HTMLButtonElement>(
    '#browse-directory-button',
)!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-button')!;
const convertButton =
    document.querySelector<HTMLButtonElement>('#convert-button')!;
const format = document.querySelector<HTMLSelectElement>('#format')!;
const dpi = document.querySelector<HTMLSelectElement>('#dpi')!;
const updateDialog =
    document.querySelector<HTMLDialogElement>('#update-dialog')!;
const updateTitle =
    document.querySelector<HTMLHeadingElement>('#update-title')!;
const currentVersion =
    document.querySelector<HTMLParagraphElement>('#current-version')!;
const updateNotes = document.querySelector<HTMLDivElement>('#update-notes')!;
const updateButton =
    document.querySelector<HTMLButtonElement>('#update-button')!;
const downloadDialog =
    document.querySelector<HTMLDialogElement>('#download-dialog')!;
const downloadTitle =
    document.querySelector<HTMLHeadingElement>('#download-title')!;
const updateProgress =
    document.querySelector<HTMLProgressElement>('#update-progress')!;
const updateProgressPercent = document.querySelector<HTMLParagraphElement>(
    '#update-progress-percent',
)!;
const updateProgressSize = document.querySelector<HTMLParagraphElement>(
    '#update-progress-size',
)!;
const updateProgressSpeed = document.querySelector<HTMLParagraphElement>(
    '#update-progress-speed',
)!;
const updateProgressRemaining = document.querySelector<HTMLParagraphElement>(
    '#update-progress-remaining',
)!;
const cancelUpdateButton = document.querySelector<HTMLButtonElement>(
    '#cancel-update-button',
)!;

type JobState = 'pending' | 'converting' | 'complete' | 'failed';

interface FileJob {
    id: number;
    path: string;
    state: JobState;
    pageCount?: number;
    error?: string;
}

let files: FileJob[] = [];
let nextId = 0;
let isConverting = false;

function baseName(path: string): string {
    return path.split(/[\\/]/).pop() || path;
}

function createStatusIcon(
    source: string,
    color: 'success' | 'error',
): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className =
        color === 'success'
            ? 'block size-5 text-success'
            : 'block size-5 text-error';
    icon.innerHTML = source
        .replace(/fill="(?:white|#ffffff)"/gi, 'fill="currentColor"')
        .replace(/fill-opacity="[^"]*"/gi, '')
        .replace(
            '<path stroke-linecap=',
            '<path fill="none" stroke="currentColor" stroke-linecap=',
        );
    const svg = icon.querySelector('svg');
    svg?.setAttribute('class', 'block size-5');
    return icon;
}

function renderList(): void {
    fileList.replaceChildren();
    if (files.length === 0) {
        const empty = document.createElement('li');
        empty.className =
            'flex min-h-40 items-center justify-center px-5 py-8 text-center text-sm text-base-content/60';
        empty.textContent = '将 PDF 文件或文件夹拖到此处';
        fileList.append(empty);
    } else {
        for (const file of files) {
            const item = document.createElement('li');
            item.className =
                'list-row grid w-full grid-cols-[minmax(0,1fr)_1.5rem_auto] items-center gap-3';
            const details = document.createElement('div');
            details.className = 'min-w-0 flex-1';
            const name = document.createElement('div');
            name.className = 'truncate text-sm font-medium';
            name.textContent = baseName(file.path);
            const path = document.createElement('div');
            path.className = 'truncate text-xs text-base-content/55';
            path.textContent = file.path;
            details.append(name, path);
            item.append(details);

            const stateSlot = document.createElement('div');
            stateSlot.className = 'flex size-6 items-center justify-center';

            if (file.state === 'converting') {
                const spinner = document.createElement('span');
                spinner.className =
                    'loading loading-spinner loading-sm text-primary';
                spinner.setAttribute(
                    'aria-label',
                    `${baseName(file.path)} 正在转换`,
                );
                spinner.setAttribute('role', 'status');
                stateSlot.append(spinner);
            } else if (file.state === 'complete') {
                const success = createStatusIcon(successIcon, 'success');
                success.setAttribute(
                    'aria-label',
                    `${baseName(file.path)} 转换成功，共 ${file.pageCount ?? 0} 页`,
                );
                stateSlot.append(success);
            } else if (file.state === 'failed') {
                const tooltip = document.createElement('div');
                tooltip.className = 'tooltip tooltip-left tooltip-error';
                tooltip.dataset.tip = file.error ?? '转换失败';
                const failure = createStatusIcon(errorIcon, 'error');
                failure.setAttribute(
                    'aria-label',
                    `${baseName(file.path)} 转换失败`,
                );
                tooltip.append(failure);
                stateSlot.append(tooltip);
            }
            item.append(stateSlot);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-ghost btn-square btn-sm';
            remove.title = `删除 ${baseName(file.path)}`;
            remove.setAttribute('aria-label', remove.title);
            remove.textContent = '×';
            remove.disabled = isConverting;
            remove.addEventListener('click', () => removeFile(file.id));
            item.append(remove);
            fileList.append(item);
        }
    }

    clearButton.disabled = files.length === 0 || isConverting;
    convertButton.disabled = files.length === 0 || isConverting;
    browseButton.disabled = isConverting;
    browseDirectoryButton.disabled = isConverting;
    convertButton.textContent = isConverting ? '正在转换' : '开始转换';
}

function addPaths(paths: string[]): void {
    const validPaths = paths.filter((path) => /\.pdf$/i.test(path));
    const existing = new Set(files.map((file) => file.path.toLowerCase()));
    for (const path of validPaths) {
        if (!existing.has(path.toLowerCase())) {
            files.push({ id: nextId++, path, state: 'pending' });
            existing.add(path.toLowerCase());
        }
    }
    renderList();
}

async function browse(): Promise<void> {
    addPaths(await window.pdfApi.chooseFiles());
}

async function browseDirectory(): Promise<void> {
    addPaths(await window.pdfApi.chooseDirectory());
}

function removeFile(id: number): void {
    files = files.filter((file) => file.id !== id);
    renderList();
}

function clearFiles(): void {
    files = [];
    renderList();
}

async function showAvailableUpdate(): Promise<void> {
    const release = await window.pdfApi.checkForUpdate();
    if (!release) return;

    updateTitle.textContent = `发现新版本 ${release.version}！`;
    currentVersion.textContent = `当前版本：${release.currentVersion}`;
    const markdown = marked.parse(release.notes) as string;
    updateNotes.innerHTML = DOMPurify.sanitize(markdown, {
        USE_PROFILES: { html: true },
    });
    updateDialog.showModal();
}

function openReleaseLink(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        'a[href]',
    );
    if (!link) return;

    event.preventDefault();
    void window.pdfApi.openExternal(link.href);
}

function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    if (bytes < 1_024) return `${bytes}B`;
    const units = ['KB', 'MB', 'GB'];
    const unit = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1_024)),
        units.length,
    );
    return `${(bytes / 1_024 ** unit).toFixed(unit === 1 ? 0 : 1)}${units[unit - 1]}`;
}

function formatRemainingTime(seconds: number): string {
    const roundedSeconds = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(roundedSeconds / 3_600);
    const minutes = Math.floor((roundedSeconds % 3_600) / 60);
    const remainingSeconds = roundedSeconds % 60;
    const minutesAndSeconds = `${String(minutes).padStart(2, '0')}:${String(
        remainingSeconds,
    ).padStart(2, '0')}`;
    return hours > 0
        ? `${String(hours).padStart(2, '0')}:${minutesAndSeconds}`
        : minutesAndSeconds;
}

function resetDownloadDialog(): void {
    downloadTitle.textContent = '正在下载更新';
    updateProgress.value = 0;
    updateProgressPercent.textContent = '0%';
    updateProgressSize.textContent = '0B/--';
    updateProgressSpeed.textContent = '0B/s';
    updateProgressRemaining.textContent = '--:--';
    cancelUpdateButton.disabled = false;
    cancelUpdateButton.textContent = '取消';
}

function showUpdateError(message: string): void {
    downloadTitle.textContent = '更新失败';
    updateProgressSize.textContent = message;
    updateProgressSpeed.textContent = '';
    updateProgressRemaining.textContent = '';
    cancelUpdateButton.disabled = false;
    cancelUpdateButton.textContent = '关闭';
}

function handleUpdateProgress(progress: UpdateProgress): void {
    if (progress.phase === 'download') {
        const percent = Math.round(progress.percent);
        updateProgress.value = percent;
        updateProgressPercent.textContent = `${percent}%`;
        updateProgressSize.textContent = progress.totalBytes
            ? `${formatBytes(progress.downloadedBytes ?? 0)}/${formatBytes(progress.totalBytes)}`
            : formatBytes(progress.downloadedBytes ?? 0);
        updateProgressSpeed.textContent = progress.speedBytesPerSecond
            ? `${formatBytes(progress.speedBytesPerSecond)}/s`
            : '0B/s';
        updateProgressRemaining.textContent =
            progress.remainingSeconds !== undefined
                ? formatRemainingTime(progress.remainingSeconds)
                : '--:--';
        return;
    }
    if (progress.phase === 'extract') {
        const percent = Math.round(progress.percent);
        downloadTitle.textContent = '正在解压更新';
        updateProgress.value = percent;
        updateProgressPercent.textContent = `${percent}%`;
        updateProgressSize.textContent = '解压中...';
        updateProgressSpeed.textContent = '';
        updateProgressRemaining.textContent = '';
        cancelUpdateButton.disabled = true;
        return;
    }
    if (progress.phase === 'cancelled') {
        downloadDialog.close();
        return;
    }
    showUpdateError(progress.message ?? '更新失败。');
}

browseButton.addEventListener('click', () => void browse());
browseDirectoryButton.addEventListener('click', () => void browseDirectory());
clearButton.addEventListener('click', clearFiles);
updateNotes.addEventListener('click', openReleaseLink);
updateButton.addEventListener('click', () => {
    updateDialog.close();
    resetDownloadDialog();
    downloadDialog.showModal();
    void window.pdfApi
        .startUpdateDownload()
        .catch((error: unknown) =>
            showUpdateError(
                error instanceof Error ? error.message : '更新失败。',
            ),
        );
});
cancelUpdateButton.addEventListener('click', () => {
    if (cancelUpdateButton.textContent === '关闭') {
        downloadDialog.close();
        return;
    }
    cancelUpdateButton.disabled = true;
    void window.pdfApi.cancelUpdateDownload();
});
downloadDialog.addEventListener('cancel', (event) => event.preventDefault());
window.pdfApi.onUpdateProgress(handleUpdateProgress);

dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('border-primary', 'bg-primary/5');
});
dropZone.addEventListener('dragleave', () =>
    dropZone.classList.remove('border-primary', 'bg-primary/5'),
);
dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('border-primary', 'bg-primary/5');
    const paths = Array.from(event.dataTransfer?.files ?? []).map((file) =>
        window.pdfApi.pathFromFile(file),
    );
    void Promise.all(
        paths.map(async (path) => {
            try {
                return await window.pdfApi.scanDirectory(path);
            } catch {
                return [path];
            }
        }),
    ).then((pathGroups) => addPaths(pathGroups.flat()));
});

convertButton.addEventListener('click', async () => {
    if (isConverting || files.length === 0) return;
    isConverting = true;
    for (const file of files) {
        file.state = 'pending';
        delete file.pageCount;
        delete file.error;
    }
    renderList();

    for (const file of files) {
        file.state = 'converting';
        renderList();
        try {
            const result = await window.pdfApi.convert({
                inputPath: file.path,
                format: format.value as ImageFormat,
                dpi: Number(dpi.value),
            });
            file.state = 'complete';
            file.pageCount = result.pageCount;
        } catch (error) {
            file.state = 'failed';
            file.error =
                error instanceof Error
                    ? error.message
                    : '转换失败，请稍后重试。';
        }
        renderList();
    }
    isConverting = false;
    renderList();
});

renderList();
void showAvailableUpdate();
