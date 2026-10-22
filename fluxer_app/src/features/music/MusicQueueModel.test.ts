// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MusicQueueItem, MusicSessionState} from '@app/features/music/MusicApi';
import {
	promoteIndex,
	queueIndexOf,
	queueTabLabel,
	showRadioNotice,
	splitQueue,
} from '@app/features/music/MusicQueueModel';
import {describe, expect, it} from 'vitest';

function item(id: string, recommended: boolean): MusicQueueItem {
	return {
		id,
		source: 'youtube',
		sourceId: id,
		title: id,
		artist: 'x',
		durationMs: 1000,
		artworkUrl: null,
		url: '',
		addedBy: recommended ? null : 'u',
		recommended,
	};
}

function session(queue: Array<MusicQueueItem>, spotifyRadio = false): MusicSessionState {
	return {
		guildId: 'g',
		channelId: 'c',
		spotifyAccount: null,
		nowPlaying: null,
		paused: false,
		positionMs: 0,
		positionAt: 0,
		queue,
		queueLength: queue.length,
		notice: null,
		spotifyRadio,
		revision: 1,
	};
}

describe('splitQueue', () => {
	it('separates user items from recommended ones, keeping order', () => {
		const [u1, u2, r1, r2] = [item('u1', false), item('u2', false), item('r1', true), item('r2', true)];
		expect(splitQueue([u1, u2, r1, r2])).toEqual({user: [u1, u2], recommended: [r1, r2]});
	});
});

describe('queueTabLabel', () => {
	it('counts only user items', () => {
		const queue = [item('u1', false), item('u2', false), ...Array.from({length: 15}, (_, i) => item(`r${i}`, true))];
		expect(queueTabLabel(session(queue))).toBe('Fila (2)');
	});

	it('has no count without a session', () => {
		expect(queueTabLabel(null)).toBe('Fila');
	});
});

describe('showRadioNotice', () => {
	it('shows only for the Spotify radio with no recommended items', () => {
		expect(showRadioNotice(session([item('u1', false)], true))).toBe(true);
		expect(showRadioNotice(session([item('u1', false)], false))).toBe(false);
		expect(showRadioNotice(session([item('u1', false), item('r1', true)], true))).toBe(false);
	});
});

describe('queueIndexOf', () => {
	it('is the position in the whole queue, recommended included', () => {
		const queue = [item('u1', false), item('u2', false), item('r1', true)];
		expect(queueIndexOf(session(queue), 'u2')).toBe(1);
		expect(queueIndexOf(session(queue), 'r1')).toBe(2);
		expect(queueIndexOf(session(queue), 'nope')).toBe(-1);
	});
});

describe('promoteIndex', () => {
	it('is the number of user items', () => {
		expect(promoteIndex(session([item('u1', false), item('r1', true), item('r2', true)]))).toBe(1);
		expect(promoteIndex(session([item('r1', true)]))).toBe(0);
		expect(promoteIndex(session([]))).toBe(0);
	});
});
