// SPDX-License-Identifier: AGPL-3.0-or-later

import {currentLineIndex, lyricsWindow, NO_LYRICS, parseLyrics} from '@app/features/music/MusicLyricsModel';
import {MusicLyricsState, type MusicLyricsStorage} from '@app/features/music/MusicLyricsStore';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/music/MusicApi', () => ({getLyrics: vi.fn()}));

const LINES = [
	{timeMs: 1000, text: 'one'},
	{timeMs: 5000, text: 'two'},
	{timeMs: 9000, text: 'three'},
	{timeMs: 12000, text: 'four'},
];

function memoryStorage(initial: Record<string, string> = {}): MusicLyricsStorage & {data: Record<string, string>} {
	const data = {...initial};
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		},
	};
}

describe('parseLyrics', () => {
	it('reads synced lines sorted by time, skipping broken ones', () => {
		const lyrics = parseLyrics({
			kind: 'synced',
			lines: [{time_ms: 5000, text: 'b'}, {time_ms: 'x'}, {time_ms: 1000, text: 'a'}],
			text: 'a\nb',
		});
		expect(lyrics).toEqual({
			kind: 'synced',
			lines: [
				{timeMs: 1000, text: 'a'},
				{timeMs: 5000, text: 'b'},
			],
			text: 'a\nb',
		});
	});

	it('falls back to plain text, and to none when there is nothing usable', () => {
		expect(parseLyrics({kind: 'plain', lines: null, text: 'la la'})).toEqual({kind: 'plain', text: 'la la'});
		expect(parseLyrics({kind: 'synced', lines: [], text: 'only text'})).toEqual({kind: 'plain', text: 'only text'});
		expect(parseLyrics({kind: 'none', lines: null, text: null})).toBe(NO_LYRICS);
		expect(parseLyrics('garbage')).toBe(NO_LYRICS);
	});
});

describe('currentLineIndex', () => {
	it('finds the line being sung', () => {
		expect(currentLineIndex(LINES, 0)).toBe(-1);
		expect(currentLineIndex(LINES, 1000)).toBe(0);
		expect(currentLineIndex(LINES, 8999)).toBe(1);
		expect(currentLineIndex(LINES, 60000)).toBe(3);
		expect(currentLineIndex([], 5000)).toBe(-1);
	});
});

describe('lyricsWindow', () => {
	it('shows one line before and two after the current', () => {
		expect(lyricsWindow(LINES, 1).map((l) => [l.text, l.role])).toEqual([
			['one', 'previous'],
			['two', 'current'],
			['three', 'next'],
			['four', 'next'],
		]);
	});

	it('before the first line, the first lines are coming up', () => {
		expect(lyricsWindow(LINES, -1).map((l) => l.role)).toEqual(['next', 'next']);
	});
});

describe('MusicLyricsState', () => {
	it('is on by default and remembers being turned off', () => {
		const storage = memoryStorage();
		const state = new MusicLyricsState(vi.fn(), () => storage);
		expect(state.enabled).toBe(true);
		state.toggleEnabled();
		expect(storage.data['fluxer.music.lyrics']).toBe('off');
		expect(new MusicLyricsState(vi.fn(), () => storage).enabled).toBe(false);
	});

	it('keeps the default when storage throws', () => {
		const state = new MusicLyricsState(vi.fn(), () => {
			throw new Error('blocked');
		});
		expect(state.enabled).toBe(true);
		expect(() => state.toggleEnabled()).not.toThrow();
	});

	it('fetches a track once, is loading until then, and a failure counts as no lyrics', async () => {
		const fetch = vi.fn().mockResolvedValueOnce({kind: 'plain', text: 'hi'}).mockRejectedValueOnce(new Error('down'));
		const state = new MusicLyricsState(fetch, () => null);
		expect(state.lyricsOf('youtube', 'a')).toBe('loading');
		state.ensure('g', 'c', 'youtube', 'a');
		state.ensure('g', 'c', 'youtube', 'a');
		state.ensure('g', 'c', 'spotify', 'b');
		await vi.waitFor(() => expect(state.lyricsOf('spotify', 'b')).toEqual(NO_LYRICS));
		expect(state.lyricsOf('youtube', 'a')).toEqual({kind: 'plain', text: 'hi'});
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenCalledWith('g', 'c', 'youtube', 'a');
	});
});
