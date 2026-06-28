// Types for bgmPrefs.js (plain JS so Node can import it via bgm.js in tests).
export const BGM_DISABLED_KEY: string;
export const BGM_DISABLED_CHANGE_EVENT: string;
export const BGM_SUSPEND_EVENT: string;
export function readDisabledUrls(): string[];
export function writeDisabledUrls(urls: string[]): string[];
export function setBgmSuspended(suspended: boolean): void;
