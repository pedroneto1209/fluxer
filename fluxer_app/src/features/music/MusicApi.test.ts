// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicApiError, startSpotifyAuthorize} from '@app/features/music/MusicApi';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: 'token'}}));

function respondWith(body: unknown): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(body), {status: 200})),
	);
}

describe('startSpotifyAuthorize', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns the Spotify authorize URL and state', async () => {
		respondWith({url: 'https://accounts.spotify.com/authorize?client_id=x', state: 's1'});
		await expect(startSpotifyAuthorize()).resolves.toEqual({
			url: 'https://accounts.spotify.com/authorize?client_id=x',
			state: 's1',
		});
	});

	it.each([
		{url: 'https://evil.example/authorize', state: 's1'},
		{url: 'http://accounts.spotify.com/authorize', state: 's1'},
		{url: 'https://accounts.spotify.com.evil.example/', state: 's1'},
		{url: 42, state: 's1'},
		{url: 'https://accounts.spotify.com/authorize'},
		{url: 'https://accounts.spotify.com/authorize', state: 1},
		null,
	])('rejects a malformed answer %j', async (body) => {
		respondWith(body);
		const error = await startSpotifyAuthorize().catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(MusicApiError);
		expect((error as MusicApiError).code).toBe('BAD_RESPONSE');
	});
});
