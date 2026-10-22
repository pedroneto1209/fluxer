// SPDX-License-Identifier: AGPL-3.0-or-later

// Lyrics of a track (served by the music service from LRCLIB) and the pure maths of
// following them: which line is being sung at a playback position.

export interface MusicLyricsLine {
	timeMs: number;
	text: string;
}

export type MusicLyrics =
	| {kind: 'synced'; lines: Array<MusicLyricsLine>; text: string}
	| {kind: 'plain'; text: string}
	| {kind: 'none'};

export const NO_LYRICS: MusicLyrics = {kind: 'none'};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** Tolerant parse of the `/lyrics` answer: anything unusable is "no lyrics". */
export function parseLyrics(json: unknown): MusicLyrics {
	if (!isObject(json)) return NO_LYRICS;
	const text = typeof json.text === 'string' ? json.text : '';
	if (json.kind === 'synced' && Array.isArray(json.lines)) {
		const lines: Array<MusicLyricsLine> = [];
		for (const raw of json.lines) {
			if (!isObject(raw) || typeof raw.time_ms !== 'number' || !Number.isFinite(raw.time_ms)) continue;
			lines.push({timeMs: raw.time_ms, text: typeof raw.text === 'string' ? raw.text : ''});
		}
		lines.sort((a, b) => a.timeMs - b.timeMs);
		if (lines.length > 0) return {kind: 'synced', lines, text};
	}
	if ((json.kind === 'synced' || json.kind === 'plain') && text.trim()) return {kind: 'plain', text};
	return NO_LYRICS;
}

/** Index of the line being sung at `positionMs`, or -1 before the first line. */
export function currentLineIndex(lines: ReadonlyArray<MusicLyricsLine>, positionMs: number): number {
	let low = 0;
	let high = lines.length - 1;
	let found = -1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (lines[mid].timeMs <= positionMs) {
			found = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return found;
}

export interface LyricsWindowLine {
	key: number;
	text: string;
	role: 'previous' | 'current' | 'next';
}

/**
 * The lines the call tile shows: one before the current, the current, two after. Before the
 * first line the "current" slot is empty and the first lines are coming up.
 */
export function lyricsWindow(lines: ReadonlyArray<MusicLyricsLine>, index: number): Array<LyricsWindowLine> {
	const out: Array<LyricsWindowLine> = [];
	for (let i = index - 1; i <= index + 2; i++) {
		if (i < 0 || i >= lines.length) continue;
		out.push({key: i, text: lines[i].text, role: i < index ? 'previous' : i === index ? 'current' : 'next'});
	}
	return out;
}

export function lyricsKey(source: string, sourceId: string): string {
	return `${source}:${sourceId}`;
}
