// SPDX-License-Identifier: AGPL-3.0-or-later

// Connecting a Spotify account: the music service hands out the authorize URL,
// the desktop app catches the redirect on 127.0.0.1:36850/login, and the full
// redirect URL goes back to the service. Without the desktop capture (web, busy
// port, timeout) the person pastes the address instead; the service validates it.

import type {SpotifyStatus} from '@app/features/music/MusicApi';

export interface SpotifyConnectDeps {
	startAuthorize: () => Promise<{url: string}>;
	/** Desktop loopback capture; null outside the desktop app. */
	capture: (() => Promise<string | null>) | null;
	openUrl: (url: string) => void | Promise<void>;
	connect: (redirectUrl: string) => Promise<SpotifyStatus>;
	onAuthorizeUrl?: (url: string) => void;
}

export type SpotifyConnectOutcome = {kind: 'connected'; status: SpotifyStatus} | {kind: 'paste'; authorizeUrl: string};

export async function runSpotifyConnect(deps: SpotifyConnectDeps): Promise<SpotifyConnectOutcome> {
	const {url} = await deps.startAuthorize();
	// Listen before the browser opens so a fast redirect is not missed.
	const captured = deps.capture ? deps.capture().catch(() => null) : Promise.resolve(null);
	deps.onAuthorizeUrl?.(url);
	try {
		await deps.openUrl(url);
	} catch {}
	const redirectUrl = await captured;
	if (!redirectUrl) return {kind: 'paste', authorizeUrl: url};
	return {kind: 'connected', status: await deps.connect(redirectUrl)};
}

export function cleanPastedRedirect(text: string): string | null {
	const trimmed = text.trim();
	return trimmed === '' ? null : trimmed;
}
