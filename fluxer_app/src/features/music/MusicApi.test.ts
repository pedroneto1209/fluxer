// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	listGuildSessions,
	MusicApiError,
	parseSessionState,
	searchTracks,
	startSpotifyAuthorize,
} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
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

const QUEUE_ITEM = {
	id: 'q1',
	source: 'youtube',
	source_id: 'abc',
	title: 'Song',
	artist: 'Artist',
	duration_ms: 1000,
	artwork_url: null,
	url: 'https://x',
	added_by: null,
	recommended: false,
};

function rawState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {guild_id: 'g1', channel_id: 'c1', revision: 1, queue: [QUEUE_ITEM], ...overrides};
}

describe('parseSessionState queue', () => {
	it('defaults queueLength to the queue it carries', () => {
		expect(parseSessionState(rawState())?.queueLength).toBe(1);
		expect(parseSessionState(rawState({queue_length: 'x'}))?.queueLength).toBe(1);
		expect(parseSessionState(rawState({queue_length: -3}))?.queueLength).toBe(1);
	});

	it('reads the total queue_length the server sends', () => {
		expect(parseSessionState(rawState({queue_length: 120}))?.queueLength).toBe(120);
		// Never smaller than the items actually present.
		expect(parseSessionState(rawState({queue_length: 0}))?.queueLength).toBe(1);
	});

	it('rejects a malformed queue item', () => {
		expect(parseSessionState(rawState({queue: [QUEUE_ITEM, {id: 'q2', source: 'tidal'}]}))).toBeNull();
		expect(parseSessionState(rawState({queue: [{...QUEUE_ITEM, id: 5}]}))).toBeNull();
		expect(parseSessionState(rawState({queue: [null]}))).toBeNull();
	});
});

const OLD_SESSION = {channelId: 'c1', nowPlaying: null, paused: false, positionMs: 0, positionAt: 0, upNext: []};

describe('spotify_radio and guild session peek', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('parseSessionState reads spotify_radio', () => {
		expect(parseSessionState(rawState({spotify_radio: true}))?.spotifyRadio).toBe(true);
		expect(parseSessionState(rawState())?.spotifyRadio).toBe(false);
		expect(parseSessionState(rawState({spotify_radio: 'yes'}))?.spotifyRadio).toBe(false);
	});

	it('listGuildSessions parses the peek and skips invalid up_next items', async () => {
		respondWith({
			sessions: [
				{
					channel_id: 'c1',
					now_playing: QUEUE_ITEM,
					paused: true,
					position_ms: 1500,
					position_at: 1700000000000,
					up_next: [QUEUE_ITEM, {id: 5}, {...QUEUE_ITEM, id: 'q2', recommended: true}],
				},
			],
		});
		const [session] = await listGuildSessions('g1');
		expect(session?.upNext).toHaveLength(2);
		expect(session?.upNext[1]?.recommended).toBe(true);
		expect(session?.paused).toBe(true);
		expect(session?.positionMs).toBe(1500);
		expect(session?.positionAt).toBe(1700000000000);
	});

	it('listGuildSessions tolerates an old server without the peek fields', async () => {
		respondWith({sessions: [{channel_id: 'c1', now_playing: null, up_next: 'junk'}]});
		await expect(listGuildSessions('g1')).resolves.toEqual([OLD_SESSION]);
	});
});

describe('array guards', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('searchTracks treats non-array result lists as empty', async () => {
		respondWith({youtube: {not: 'a list'}, spotify: 'nope'});
		await expect(searchTracks('g1', 'c1', 'q')).resolves.toEqual({youtube: [], spotify: null});
		respondWith({youtube: [{...QUEUE_ITEM}], spotify: [{...QUEUE_ITEM, source: 'spotify'}]});
		const result = await searchTracks('g1', 'c1', 'q');
		expect(result.youtube).toHaveLength(1);
		expect(result.spotify).toHaveLength(1);
	});

	it('listGuildSessions rejects a non-array sessions field', async () => {
		respondWith({sessions: {c1: {}}});
		const error = await listGuildSessions('g1').catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(MusicApiError);
		expect((error as MusicApiError).code).toBe('BAD_RESPONSE');
		respondWith(null);
		await expect(listGuildSessions('g1')).rejects.toBeInstanceOf(MusicApiError);
		respondWith({sessions: [{channel_id: 'c1', now_playing: null}, 'junk']});
		await expect(listGuildSessions('g1')).resolves.toEqual([OLD_SESSION]);
	});
});

describe('MusicStore.refreshGuildSessions', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		MusicStore.guildSessions.clear();
	});

	function respondStatus(status: number, body: unknown = {code: 'X', message: 'x'}): void {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(body), {status})),
		);
	}

	it('stores the sessions on success', async () => {
		respondWith({sessions: [{channel_id: 'c1', now_playing: QUEUE_ITEM}]});
		await MusicStore.refreshGuildSessions('g1');
		expect(MusicStore.guildSessions.get('g1')?.[0]?.nowPlaying?.title).toBe('Song');
	});

	it('keeps the last list on a transient failure', async () => {
		respondWith({sessions: [{channel_id: 'c1', now_playing: null}]});
		await MusicStore.refreshGuildSessions('g1');
		respondStatus(502);
		await MusicStore.refreshGuildSessions('g1');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject(new TypeError('offline'))),
		);
		await MusicStore.refreshGuildSessions('g1');
		respondWith({sessions: 'garbage'});
		await MusicStore.refreshGuildSessions('g1');
		expect(MusicStore.guildSessions.get('g1')).toEqual([OLD_SESSION]);
	});

	it('drops the list when the service says not found', async () => {
		respondWith({sessions: [{channel_id: 'c1', now_playing: null}]});
		await MusicStore.refreshGuildSessions('g1');
		respondStatus(404, {code: 'NOT_FOUND', message: 'x'});
		await MusicStore.refreshGuildSessions('g1');
		expect(MusicStore.guildSessions.has('g1')).toBe(false);
	});
});
