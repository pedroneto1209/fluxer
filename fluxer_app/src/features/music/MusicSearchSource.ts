// SPDX-License-Identifier: AGPL-3.0-or-later

// Which source the "Buscar" tab shows (one at a time) and the pick kept between sessions.

import type {MusicSearchResult, MusicTrack} from '@app/features/music/MusicApi';

export type MusicSearchSourceChoice = 'spotify' | 'youtube';

const STORAGE_KEY = 'fluxer.music.searchSource';

export function loadSearchSource(): MusicSearchSourceChoice {
	try {
		return globalThis.localStorage?.getItem(STORAGE_KEY) === 'youtube' ? 'youtube' : 'spotify';
	} catch {
		return 'spotify';
	}
}

export function saveSearchSource(choice: MusicSearchSourceChoice): void {
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, choice);
	} catch {
		// Storage can be blocked; the choice just is not kept.
	}
}

export function visibleResults(
	result: MusicSearchResult,
	choice: MusicSearchSourceChoice,
): {tracks: Array<MusicTrack>; spotifyUnavailable: boolean} {
	if (choice === 'youtube') return {tracks: result.youtube, spotifyUnavailable: false};
	if (result.spotify === null) return {tracks: [], spotifyUnavailable: true};
	return {tracks: result.spotify, spotifyUnavailable: false};
}
