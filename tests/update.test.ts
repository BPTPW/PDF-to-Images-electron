import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '../src/update';

describe('release version comparison', () => {
    it('recognizes newer semantic versions and v-prefixed tags', () => {
        expect(isNewerVersion('v1.2.0', '1.1.9')).toBe(true);
        expect(isNewerVersion('1.2.1', '1.2.0')).toBe(true);
        expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true);
    });

    it('does not offer equal, older, or malformed releases', () => {
        expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false);
        expect(isNewerVersion('1.1.9', '1.2.0')).toBe(false);
        expect(isNewerVersion('latest', '1.2.0')).toBe(false);
    });

    it('handles prerelease precedence', () => {
        expect(isNewerVersion('1.2.0', '1.2.0-beta.2')).toBe(true);
        expect(isNewerVersion('1.2.0-beta.11', '1.2.0-beta.2')).toBe(true);
        expect(isNewerVersion('1.2.0-beta.2', '1.2.0-beta.11')).toBe(false);
    });
});
