export interface ReleaseInfo {
    version: string;
    currentVersion: string;
    notes: string;
}

export interface UpdateProgress {
    phase: 'download' | 'extract' | 'cancelled' | 'error';
    percent: number;
    downloadedBytes?: number;
    totalBytes?: number;
    speedBytesPerSecond?: number;
    remainingSeconds?: number;
    message?: string;
}

interface SemanticVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
}

const SEMVER_PATTERN =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(version: string): SemanticVersion | undefined {
    const match = SEMVER_PATTERN.exec(version);
    if (!match) return undefined;

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4]?.split('.') ?? [],
    };
}

function comparePrerelease(left: string[], right: string[]): number {
    if (left.length === 0) return right.length === 0 ? 0 : 1;
    if (right.length === 0) return -1;

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftPart = left[index];
        const rightPart = right[index];
        if (leftPart === undefined) return -1;
        if (rightPart === undefined) return 1;
        if (leftPart === rightPart) continue;

        const leftNumber = /^\d+$/.test(leftPart);
        const rightNumber = /^\d+$/.test(rightPart);
        if (leftNumber && rightNumber)
            return Number(leftPart) - Number(rightPart);
        if (leftNumber) return -1;
        if (rightNumber) return 1;
        return leftPart.localeCompare(rightPart);
    }
    return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
    const latestVersion = parseVersion(latest);
    const currentVersion = parseVersion(current);
    if (!latestVersion || !currentVersion) return false;

    for (const part of ['major', 'minor', 'patch'] as const) {
        if (latestVersion[part] !== currentVersion[part]) {
            return latestVersion[part] > currentVersion[part];
        }
    }
    return (
        comparePrerelease(latestVersion.prerelease, currentVersion.prerelease) >
        0
    );
}
