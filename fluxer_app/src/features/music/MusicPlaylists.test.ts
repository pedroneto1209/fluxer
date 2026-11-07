// SPDX-License-Identifier: AGPL-3.0-or-later

import {parseSavedPlaylist} from '@app/features/music/MusicApi';
import MusicPlaylists from '@app/features/music/MusicPlaylists';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: 'token'}}));

const fetchMock = vi.fn();

const RAW = {
	id: 'spotify-playlist-abc',
	source: 'spotify',
	kind: 'playlist',
	source_id: 'abc',
	name: 'Road trip',
	owner: 'Ana',
	artwork_url: 'https://i.scdn.co/image/cover',
	url: 'https://open.spotify.com/playlist/abc',
	track_count: 42,
	added_by: 'u1',
	created_at: 1000,
	last_played_at: 2000,
	play_count: 3,
};

describe('parseSavedPlaylist', () => {
	it('maps the server fields', () => {
		expect(parseSavedPlaylist(RAW)).toEqual({
			id: 'spotify-playlist-abc',
			source: 'spotify',
			kind: 'playlist',
			name: 'Road trip',
			owner: 'Ana',
			artworkUrl: 'https://i.scdn.co/image/cover',
			url: 'https://open.spotify.com/playlist/abc',
			trackCount: 42,
			addedBy: 'u1',
			lastPlayedAt: 2000,
			playCount: 3,
		});
	});

	it('rejects entries without an id, name, url or known source', () => {
		expect(parseSavedPlaylist({...RAW, id: 1})).toBeNull();
		expect(parseSavedPlaylist({...RAW, source: 'deezer'})).toBeNull();
		expect(parseSavedPlaylist({...RAW, url: undefined})).toBeNull();
		expect(parseSavedPlaylist(null)).toBeNull();
	});
});

describe('MusicPlaylists', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		fetchMock.mockReset();
	});

	it('loads a guild list, moves a played one to the top and removes locally', async () => {
		const first = parseSavedPlaylist(RAW);
		const second = parseSavedPlaylist({...RAW, id: 'youtube-playlist-PLx', source: 'youtube', name: 'Samba'});
		if (!first || !second) throw new Error('fixtures must parse');
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({playlists: [RAW, {...RAW, id: 'youtube-playlist-PLx', source: 'youtube', name: 'Samba'}]}),
			),
		);

		await MusicPlaylists.load('g1');
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost/music/api/guilds/g1/playlists');
		expect(MusicPlaylists.loadOf('g1')).toEqual({kind: 'ready'});
		expect(MusicPlaylists.playlistsOf('g1').map((p) => p.name)).toEqual(['Road trip', 'Samba']);

		MusicPlaylists.upsert('g1', {...second, playCount: 2});
		expect(MusicPlaylists.playlistsOf('g1').map((p) => p.id)).toEqual(['youtube-playlist-PLx', 'spotify-playlist-abc']);

		MusicPlaylists.removeLocal('g1', 'spotify-playlist-abc');
		expect(MusicPlaylists.playlistsOf('g1').map((p) => p.id)).toEqual(['youtube-playlist-PLx']);
		expect(MusicPlaylists.playlistsOf('other')).toEqual([]);
	});

	it('keeps the cached list when a reload fails', async () => {
		vi.stubGlobal('fetch', fetchMock);
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		await MusicPlaylists.load('g1');
		expect(MusicPlaylists.loadOf('g1')).toEqual({
			kind: 'error',
			message: 'Não foi possível falar com o serviço de música.',
		});
		expect(MusicPlaylists.playlistsOf('g1').map((p) => p.id)).toEqual(['youtube-playlist-PLx']);
	});
});
