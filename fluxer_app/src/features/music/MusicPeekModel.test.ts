// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MusicGuildSession, MusicQueueItem} from '@app/features/music/MusicApi';
import {joinToListenLabel, PEEK_POLL_MS, peekView} from '@app/features/music/MusicPeekModel';
import {startPeekPolling} from '@app/features/music/MusicPeekPolling';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function item(id: string, over: Partial<MusicQueueItem> = {}): MusicQueueItem {
	return {
		id,
		source: 'youtube',
		sourceId: id,
		title: `T${id}`,
		artist: 'A',
		durationMs: 200_000,
		artworkUrl: null,
		url: `https://x/${id}`,
		addedBy: 'u1',
		recommended: false,
		...over,
	};
}

function session(over: Partial<MusicGuildSession> = {}): MusicGuildSession {
	return {
		channelId: 'c1',
		nowPlaying: item('1'),
		paused: false,
		positionMs: 10_000,
		positionAt: 1_000,
		upNext: [],
		...over,
	};
}

describe('peekView', () => {
	it('is null without a session or without a current track', () => {
		expect(peekView(undefined, 0)).toBeNull();
		expect(peekView(session({nowPlaying: null}), 0)).toBeNull();
	});

	it('marks recommended items in up next', () => {
		const view = peekView(session({upNext: [item('2'), item('3', {recommended: true})]}), 1_000);
		expect(view?.upNext.map((entry) => entry.recommended)).toEqual([false, true]);
		expect(view?.current).toMatchObject({title: 'T1', addedBy: 'u1', recommended: false});
	});

	it('advances progress while playing and not while paused', () => {
		expect(peekView(session(), 6_000)?.positionMs).toBe(15_000);
		expect(peekView(session({paused: true}), 6_000)?.positionMs).toBe(10_000);
	});

	it('keeps counting when the duration is unknown', () => {
		const view = peekView(session({nowPlaying: item('1', {durationMs: 0})}), 1_000_000);
		expect(view?.durationMs).toBe(0);
		expect(view?.positionMs).toBe(1_009_000);
	});
});

describe('joinToListenLabel', () => {
	it('names the channel', () => {
		expect(joinToListenLabel('Geral')).toBe('Entrar em Geral para ouvir');
	});
});

describe('startPeekPolling', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('refreshes on open and every 5 s until stopped', () => {
		const refresh = vi.fn(async () => {});
		const stop = startPeekPolling(refresh);
		expect(refresh).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(PEEK_POLL_MS);
		expect(refresh).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(PEEK_POLL_MS * 2);
		expect(refresh).toHaveBeenCalledTimes(4);
		stop();
		vi.advanceTimersByTime(PEEK_POLL_MS * 5);
		expect(refresh).toHaveBeenCalledTimes(4);
	});

	it('survives a failing refresh', async () => {
		const refresh = vi.fn(async () => {
			throw new Error('x');
		});
		const stop = startPeekPolling(refresh);
		await vi.advanceTimersByTimeAsync(PEEK_POLL_MS);
		expect(refresh).toHaveBeenCalledTimes(2);
		stop();
	});
});
