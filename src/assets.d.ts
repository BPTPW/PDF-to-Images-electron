declare module '*.css';

declare module '*.svg' {
    const source: string;
    export default source;
}

declare module '*.svg?raw' {
    const source: string;
    export default source;
}

declare module 'original-fs' {
    const originalFs: typeof import('node:fs');
    export = originalFs;
}
