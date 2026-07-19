# PDF to Image Application

## Chosen Technical Direction

This application prioritizes rendering fidelity and compatibility while using
an open-source rendering stack. Use Poppler's `pdftocairo` executable as the
production PDF rendering engine. The Electron main process invokes the bundled
platform-specific executable through Node's process API.

Why this is the default:

- `pdftocairo` is a mature native renderer with strong support for embedded
  fonts, transparency, vector graphics, annotations, color spaces, and PDFs
  produced by common authoring tools.
- It creates PNG, JPEG, TIFF, PS, EPS, PDF, and SVG directly, without browser
  canvas rendering or a JavaScript PDF implementation in the export path.
- Calling a bundled CLI keeps the Electron integration simple and makes the
  renderer version explicit and reproducible across supported platforms.

License note: this application is licensed as `GPL-3.0-or-later`. Distribute
the Poppler license and notices with every installer, provide the complete
corresponding source required by the distributed Poppler build, and retain its
copyright notices. Do not link Poppler libraries into Electron without a fresh
license review. This project intentionally uses the standalone executable.

## Application Stack

- Runtime and desktop shell: Electron 33+.
- Build tooling: Electron Forge with the Vite TypeScript template.
- Renderer UI library: Layui 2 (`layui`, currently `2.13.8`). Use Layui as the
  single shared component and visual language for the application UI.
- PDF engine: a pinned Poppler `pdftocairo` binary for each supported platform.
- Image post-processing: `sharp`, only for optional resize, compression, and
  format conversion after the PDF engine has rendered the page.
- Validation: Vitest for unit tests and Playwright for end-to-end desktop or UI
  smoke tests.

## Architecture Rules

- Keep the renderer process unprivileged: `nodeIntegration: false` and
  `contextIsolation: true`.
- Open PDFs and write output files only in the main process. Expose narrow,
  typed IPC methods through the preload script.
- Spawn `pdftocairo` from a worker thread or child process and capture stderr,
  exit code, and cancellation state. Never run conversion work on Electron's
  main-process event loop.
- Pass each job as structured command arguments, never through a shell command
  string. Paths and user-provided values must not be interpreted by a shell.
- Report encrypted, invalid, or failed documents as explicit UI states; never
  silently produce partial results.
- Preserve the source page dimensions and aspect ratio. Conversion settings must
  use either DPI or a scale factor, never arbitrary width and height distortion.
- Default export settings: PNG, 300 DPI, sRGB output, one image per page, and
  zero-padded names such as `document-0001.png`.
- For JPEG/WebP output, render at the requested DPI first, then pass the bitmap
  through `sharp`; do not render the PDF at reduced browser-canvas resolution.
- Use a temporary output directory and move completed files into the user
  selected folder only after the full job succeeds. Clean temporary files after
  cancellation or failure.
- Limit parallel rendering by CPU and memory pressure. Begin with one page per
  worker and expose concurrency only after stress testing.

## Renderer UI Rules

- Import Layui 2 from the installed npm package through the Vite bundle. Do not
  load its CSS or JavaScript from a CDN: packaged Electron builds must work
  offline.
- Use Layui modules and their documented initialization APIs for form controls,
  upload/drop zones, progress indicators, tables, tabs, dialogs, notifications,
  menus, and tooltips. Do not recreate equivalent controls with ad-hoc HTML.
- Treat Layui as the only general-purpose UI component library. Small local CSS
  is permitted for application layout and PDF-specific previews, but do not add
  Bootstrap, Element, Ant Design, or another competing design system.
- Keep UI state in TypeScript modules. Layui is responsible for component
  rendering and interaction, while conversion jobs, filesystem access, and
  validation remain behind the typed preload IPC boundary.
- Re-render or call the documented Layui refresh/render API after changing DOM
  content dynamically, especially for forms, selects, tables, and progress
  state. Avoid manipulating Layui-generated internal markup directly.
- Use Layui dialogs for expected user decisions and errors. Native Electron
  dialogs remain the only mechanism for selecting input PDFs and output
  directories.
- Keep the conversion workspace dense and task-oriented: input file list,
  export settings, page preview, job progress, and result/error state must be
  visible without marketing-style sections or nested cards.
- Validate keyboard navigation, focus order, disabled states, and text overflow
  at the supported desktop window sizes. Chinese labels must not be truncated
  by fixed-width controls.

## Rendering Baseline

Use `pdftocairo` at the requested DPI and output prefix:

```text
pdftocairo -png -r 300 input.pdf output/document
```

Treat Poppler output as the reference implementation. PDF.js may be used later
for fast on-screen previews, but it must not be the export renderer unless
visual comparison tests prove it matches the reference for the relevant sample
set.

## Compatibility and Quality Gates

- Maintain an owned, non-sensitive regression corpus containing PDFs made by
  Microsoft Office, WPS Office, LibreOffice, Adobe Acrobat, browser print
  engines, scanning software, CAD/vector exporters, and form-heavy PDFs.
- Include documents with Chinese, Japanese, Korean, Arabic, right-to-left text,
  embedded fonts, CJK subset fonts, transparency, gradients, rotated pages,
  annotations, and password protection.
- For every supported output format, compare generated images against approved
  reference images using pixel-diff tolerances. Investigate geometry shifts,
  missing glyphs, clipping, and color changes; do not accept them as normal
  conversion variance.
- Record the rendering engine version, operating system, input SHA-256, export
  settings, and failure message for each failed job.
- A PDF may be malformed, encrypted without its password, or depend on fonts
  not embedded in the file. These cases cannot be guaranteed correct by any
  renderer; surface them clearly and preserve the original file unchanged.

## Packaging Rules

- Store Poppler binaries below a versioned `resources/poppler/<platform>-<arch>`
  directory and configure Electron Forge to copy them into `process.resourcesPath`.
- Include `THIRD_PARTY_NOTICES` and the full Poppler license text in each
  distributable. Before release, document the exact Poppler source revision and
  how users can obtain its corresponding source.
- Test packaged Windows and macOS builds, not only `npm run dev`; executable
  paths, permissions, fonts, and bundled binary loading can differ after
  packaging.
- Do not add Ghostscript, MuPDF, PDFium, or a second PDF renderer as a silent
  fallback. Multiple engines create inconsistent output. Add one only as an
  explicitly documented compatibility mode with its own tests and license review.

## Change Discipline

- Use TypeScript with strict mode enabled.
- Add tests whenever conversion behavior, IPC contracts, or export settings
  change.
- Do not log full document contents, passwords, or absolute user paths in
  telemetry or production logs.
