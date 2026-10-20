// SPDX-License-Identifier: AGPL-3.0-or-later

import {BUILD_CHANNEL, type BuildChannel} from '@electron/common/BuildChannel';

export type DesktopDownloadArch = 'x64' | 'arm64';

export function getDesktopDownloadArch(arch: NodeJS.Architecture): DesktopDownloadArch {
	return arch === 'arm64' ? 'arm64' : 'x64';
}

export const DESKTOP_DOWNLOAD_ARCH = getDesktopDownloadArch(process.arch);
const PACKAGE_ORIGIN_ENV = 'FLUXER_DESKTOP_PACKAGE_ORIGIN';
const CHANNEL_PACKAGE_ORIGINS: Record<BuildChannel, string> = {
	stable: 'https://pkgs.fluxer.com',
	canary: 'https://pkgs.fluxer.com',
	development: 'http://localhost:48780',
};

// Fork builds update from this repository's GitHub Releases. Release assets are flat,
// so the feed is the "latest release" download root rather than a channel/platform path.
const FORK_REPOSITORY_URL = 'https://github.com/pedroneto1209/fluxer';
const FORK_UPDATE_BASE_URL = `${FORK_REPOSITORY_URL}/releases/latest/download`;

export function resolveDesktopPackageOrigin(): string {
	const override = process.env?.[PACKAGE_ORIGIN_ENV];
	if (override == null || override.trim().length === 0) {
		return CHANNEL_PACKAGE_ORIGINS[BUILD_CHANNEL];
	}
	return override.trim().replace(/\/+$/u, '');
}

export function getUpdateBaseUrl(platform: NodeJS.Platform = process.platform): string {
	const override = process.env?.[PACKAGE_ORIGIN_ENV];
	if (BUILD_CHANNEL === 'stable' && (override == null || override.trim().length === 0)) {
		return FORK_UPDATE_BASE_URL;
	}
	return `${resolveDesktopPackageOrigin()}/desktop/${BUILD_CHANNEL}/${platform}/${DESKTOP_DOWNLOAD_ARCH}`;
}

// Velopack picks its source type from the URL: anything on github.com is read as a
// repository and listed through the GitHub releases API. Hand it the repository itself;
// a release download root would be misread as a repository path.
export function getVelopackSourceUrl(): string {
	const base = getUpdateBaseUrl();
	return base === FORK_UPDATE_BASE_URL ? FORK_REPOSITORY_URL : base;
}

export const MANUAL_DESKTOP_FORMATS = ['setup', 'dmg', 'zip', 'appimage', 'deb', 'rpm', 'tar_gz'] as const;

export type ManualDesktopFormat = (typeof MANUAL_DESKTOP_FORMATS)[number];
