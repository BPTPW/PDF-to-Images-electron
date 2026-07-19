import type { ImageFormat } from './types';
import successIcon from './assets/success.svg?raw';
import errorIcon from './assets/error.svg?raw';

const fileList = document.querySelector<HTMLUListElement>('#file-list')!;
const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const browseButton =
    document.querySelector<HTMLButtonElement>('#browse-button')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-button')!;
const convertButton =
    document.querySelector<HTMLButtonElement>('#convert-button')!;
const format = document.querySelector<HTMLSelectElement>('#format')!;
const dpi = document.querySelector<HTMLSelectElement>('#dpi')!;

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
        empty.textContent = '将一个或多个 PDF 文件拖到此处';
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

function removeFile(id: number): void {
    files = files.filter((file) => file.id !== id);
    renderList();
}

function clearFiles(): void {
    files = [];
    renderList();
}

browseButton.addEventListener('click', () => void browse());
clearButton.addEventListener('click', clearFiles);

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
    addPaths(paths);
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
