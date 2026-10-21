// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicApiError, type MusicSessionState, parseSessionState} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: null}}));

function makeState(overrides: Partial<MusicSessionState> = {}): MusicSessionState {
	return {
		guildId: 'g1',
		channelId: 'c1',
		spotifyAccount: null,
		nowPlaying: {
			id: 'q1',
			source: 'youtube',
			sourceId: 'abc',
			title: 'Song',
			artist: 'Artist',
			durationMs: 200_000,
			artworkUrl: null,
			url: 'https://example.com/abc',
			addedBy: null,
			recommended: false,
		},
		paused: false,
		positionMs: 10_000,
		positionAt: 1_000_000,
		queue: [],
		notice: null,
		revision: 5,
		...overrides,
	};
}

describe('MusicStore', () => {
	beforeEach(() => {
		MusicStore.clearChannel('c1');
	});

	it('applyState ignores older revisions', () => {
		MusicStore.applyState(makeState({revision: 5}));
		MusicStore.applyState(makeState({revision: 4, paused: true}));
		expect(MusicStore.sessionByChannel.get('c1')?.paused).toBe(false);
		MusicStore.applyState(makeState({revision: 6, paused: true}));
		expect(MusicStore.sessionByChannel.get('c1')?.paused).toBe(true);
	});

	it('currentPositionMs extrapolates while playing', () => {
		MusicStore.applyState(makeState());
		expect(MusicStore.currentPositionMs('c1', 1_005_000)).toBe(15_000);
	});

	it('currentPositionMs freezes while paused', () => {
		MusicStore.applyState(makeState({paused: true}));
		expect(MusicStore.currentPositionMs('c1', 1_500_000)).toBe(10_000);
	});

	it('currentPositionMs clamps to duration', () => {
		MusicStore.applyState(makeState());
		expect(MusicStore.currentPositionMs('c1', 9_000_000)).toBe(200_000);
	});

	it('currentPositionMs does not clamp when duration is unknown', () => {
		const base = makeState();
		MusicStore.applyState({...base, nowPlaying: base.nowPlaying && {...base.nowPlaying, durationMs: 0}});
		expect(MusicStore.currentPositionMs('c1', 1_300_000)).toBe(310_000);
	});

	it('currentPositionMs is 0 without a session', () => {
		expect(MusicStore.currentPositionMs('nope')).toBe(0);
	});

	it('describeMusicError maps known codes', () => {
		expect(MusicStore.describeMusicError(new MusicApiError(403, 'NOT_IN_CHANNEL', 'x'))).toBe(
			'Entre no canal de voz para controlar a música.',
		);
		expect(MusicStore.describeMusicError(new MusicApiError(502, 'LIVEKIT_UNREACHABLE', 'x'))).not.toBe('x');
		expect(MusicStore.describeMusicError(new MusicApiError(418, 'WEIRD', 'raw message'))).toBe('raw message');
	});
});

describe('parseSessionState', () => {
	it('rejects malformed payloads', () => {
		expect(parseSessionState(null)).toBeNull();
		expect(parseSessionState('x')).toBeNull();
		expect(parseSessionState({})).toBeNull();
		expect(parseSessionState({channel_id: 'c', guild_id: 'g', revision: 'x', queue: []})).toBeNull();
		expect(parseSessionState({channel_id: 'c', guild_id: 'g', revision: 1, queue: 'no'})).toBeNull();
	});

	it('maps snake_case', () => {
		const state = parseSessionState({
			guild_id: 'g1',
			channel_id: 'c1',
			spotify_account: {user_id: 'u1', display_name: 'Ana'},
			now_playing: {
				id: 'q1',
				source: 'spotify',
				source_id: 's1',
				title: 'T',
				artist: 'A',
				duration_ms: 0,
				artwork_url: null,
				url: 'https://x',
				added_by: 'u1',
				recommended: true,
			},
			paused: true,
			position_ms: 5,
			position_at: 10,
			queue: [],
			notice: 'hi',
			revision: 3,
		});
		expect(state?.guildId).toBe('g1');
		expect(state?.spotifyAccount).toEqual({userId: 'u1', displayName: 'Ana'});
		expect(state?.nowPlaying?.sourceId).toBe('s1');
		expect(state?.nowPlaying?.addedBy).toBe('u1');
		expect(state?.positionAt).toBe(10);
		expect(state?.revision).toBe(3);
	});
});
