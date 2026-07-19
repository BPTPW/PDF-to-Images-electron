import type { ForgeConfig } from '@electron-forge/shared-types';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
    packagerConfig: {
        asar: true,
        extraResource: ['resources/poppler'],
    },
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new VitePlugin({
            build: [
                { entry: 'src/main.ts', config: 'vite.main.config.ts' },
                { entry: 'src/preload.ts', config: 'vite.preload.config.ts' },
            ],
            renderer: [
                { name: 'main_window', config: 'vite.renderer.config.ts' },
            ],
        }),
    ],
};

export default config;
