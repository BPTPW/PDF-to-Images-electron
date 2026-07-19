import type { ImageFormat } from './types';

const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!;
const browseButton = document.querySelector<HTMLButtonElement>('#browse-button')!;
const clearButton = document.querySelector<HTMLButtonElement>('#clear-button')!;
const convertButton = document.querySelector<HTMLButtonElement>('#convert-button')!;
const filePanel = document.querySelector<HTMLDivElement>('#file-panel')!;
const fileLabel = document.querySelector<HTMLSpanElement>('.file-label')!;
const filePath = document.querySelector<HTMLSpanElement>('#file-path')!;
const outputPath = document.querySelector<HTMLSpanElement>('#output-path')!;
const format = document.querySelector<HTMLSelectElement>('#format')!;
const dpi = document.querySelector<HTMLSelectElement>('#dpi')!;
const status = document.querySelector<HTMLDivElement>('#status')!;

let selectedPath: string | null = null;

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function showStatus(message = '', kind: 'error' | 'success' | '' = ''): void {
  status.textContent = message;
  status.className = `status ${kind}`;
}

async function selectPath(path: string): Promise<void> {
  if (!/\.pdf$/i.test(path)) {
    showStatus('请选择 PDF 格式的文件。', 'error');
    return;
  }
  selectedPath = path;
  filePanel.classList.remove('is-empty');
  fileLabel.textContent = baseName(path);
  filePath.textContent = path;
  outputPath.textContent = await window.pdfApi.outputDirectory(path);
  clearButton.disabled = false;
  convertButton.disabled = false;
  showStatus();
}

async function browse(): Promise<void> {
  const path = await window.pdfApi.chooseFile();
  if (path) await selectPath(path);
}

function clearFile(): void {
  selectedPath = null;
  filePanel.classList.add('is-empty');
  fileLabel.textContent = '尚未选择文件';
  filePath.textContent = '';
  outputPath.textContent = '选择文件后将显示输出目录';
  clearButton.disabled = true;
  convertButton.disabled = true;
  showStatus();
}

browseButton.addEventListener('click', (event) => { event.stopPropagation(); void browse(); });
dropZone.addEventListener('click', () => void browse());
dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void browse(); }
});
clearButton.addEventListener('click', clearFile);

dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('is-dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-dragging');
  const file = event.dataTransfer?.files[0];
  if (file) void selectPath(window.pdfApi.pathFromFile(file));
});

convertButton.addEventListener('click', async () => {
  if (!selectedPath) return;
  convertButton.disabled = true;
  convertButton.innerHTML = '<i class="layui-icon layui-icon-loading layui-anim layui-anim-rotate layui-anim-loop"></i>正在转换';
  showStatus('正在渲染 PDF 页面，请稍候。');
  try {
    const result = await window.pdfApi.convert({ inputPath: selectedPath, format: format.value as ImageFormat, dpi: Number(dpi.value) });
    showStatus(`转换完成：已导出 ${result.pageCount} 页到 ${result.outputDirectory}`, 'success');
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '转换失败，请稍后重试。', 'error');
  } finally {
    convertButton.disabled = false;
    convertButton.innerHTML = '<i class="layui-icon layui-icon-release"></i>开始转换';
  }
});
