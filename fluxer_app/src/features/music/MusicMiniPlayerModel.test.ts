// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MusicQueueItem, MusicSessionState} from '@app/features/music/MusicApi';
import {miniPlayerView} from '@app/features/music/MusicMiniPlayerModel';
import {describe, expect, it} from 'vitest';

function track(durationMs: number): MusicQueueItem {
	return {
		id: 't1',
		source: 'spotify',
		sourceId: 't1',
		title: 'Sangue Latino',
		artist: 'Secos & Molhados',
		durationMs,
		artworkUrl: 'https://example.com/a.jpg',
		url: '',
		addedBy: 'u',
		recommended: false,
	};
}

function session(overrides: Partial<MusicSessionState>): MusicSessionState {
	return {
		guildId: 'g',
		channelId: 'c',
		spotifyAccount: null,
		nowPlaying: track(200000),
		paused: false,
		positionMs: 0,
		positionAt: 0,
		queue: [],
		queueLength: 0,
		notice: null,
		spotifyRadio: false,
		revision: 1,
		...overrides,
	};
}

describe('miniPlayerView', () => {
	it('is idle without a session', () => {
		expect(miniPlayerView(null, 1000)).toEqual({kind: 'idle'});
	});

	it('is idle when nothing is playing', () => {
		expect(miniPlayerView(session({nowPlaying: null}), 1000)).toEqual({kind: 'idle'});
	});

	it('does not advance a paused track', () => {
		const view = miniPlayerView(session({paused: true, positionMs: 42000, positionAt: 1000}), 999999);
		expect(view).toMatchObject({kind: 'playing', paused: true, positionMs: 42000, durationMs: 200000});
	});

	it('advances a playing track by the clock', () => {
		const view = miniPlayerView(session({positionMs: 1000, positionAt: 95000}), 100000);
		expect(view).toMatchObject({kind: 'playing', paused: false, positionMs: 6000});
	});

	it('clamps to the duration when it is known', () => {
		const view = miniPlayerView(session({positionMs: 199000, positionAt: 0}), 100000);
		expect(view).toMatchObject({positionMs: 200000});
	});

	it('does not clamp when the duration is unknown (0)', () => {
		const view = miniPlayerView(session({nowPlaying: track(0), positionMs: 1000, positionAt: 0}), 5000);
		expect(view).toMatchObject({positionMs: 6000, durationMs: 0});
	});
});
