// SPDX-License-Identifier: AGPL-3.0-or-later

import type {MusicTrack} from '@app/features/music/MusicApi';
import {loadSearchSource, saveSearchSource, visibleResults} from '@app/features/music/MusicSearchSource';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function track(source: 'spotify' | 'youtube', sourceId: string): MusicTrack {
	return {source, sourceId, title: sourceId, artist: 'x', durationMs: 1000, artworkUrl: null, url: ''};
}

describe('search source choice', () => {
	beforeEach(() => {
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => data.get(key) ?? null,
			setItem: (key: string, value: string) => void data.set(key, value),
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('defaults to spotify', () => {
		expect(loadSearchSource()).toBe('spotify');
	});

	it('keeps the saved choice', () => {
		saveSearchSource('youtube');
		expect(loadSearchSource()).toBe('youtube');
	});

	it('falls back to spotify when storage throws', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			},
		});
		expect(loadSearchSource()).toBe('spotify');
		expect(() => saveSearchSource('youtube')).not.toThrow();
	});
});

describe('visibleResults', () => {
	const a = track('youtube', 'a');
	const b = track('spotify', 'b');

	it('shows only the chosen source', () => {
		expect(visibleResults({youtube: [a], spotify: [b]}, 'youtube').tracks).toEqual([a]);
		expect(visibleResults({youtube: [a], spotify: [b]}, 'spotify')).toEqual({tracks: [b], spotifyUnavailable: false});
	});

	it('flags spotify as unavailable when the server sent none', () => {
		expect(visibleResults({youtube: [a], spotify: null}, 'spotify')).toEqual({tracks: [], spotifyUnavailable: true});
		expect(visibleResults({youtube: [a], spotify: null}, 'youtube').spotifyUnavailable).toBe(false);
	});
});
