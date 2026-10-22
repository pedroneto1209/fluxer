// SPDX-License-Identifier: AGPL-3.0-or-later

// What the mini player shows for a session. Pure (no UI imports) so it is easy to test.

import type {MusicSessionState} from '@app/features/music/MusicApi';

export type MiniPlayerView =
	| {kind: 'idle'}
	| {
			kind: 'playing';
			title: string;
			artist: string;
			artworkUrl: string | null;
			paused: boolean;
			positionMs: number;
			durationMs: number;
	  };

/** The part of a session the position math needs (a live session or a polled guild one). */
export type MusicPositionSource = Pick<MusicSessionState, 'nowPlaying' | 'paused' | 'positionMs' | 'positionAt'>;

export function miniPlayerView(session: MusicPositionSource | null, nowMs: number): MiniPlayerView {
	const track = session?.nowPlaying;
	if (!session || !track) return {kind: 'idle'};
	const base = Math.max(0, session.positionMs);
	const position = session.paused ? base : base + Math.max(0, nowMs - session.positionAt);
	// durationMs 0 = unknown: keep counting without a ceiling.
	const positionMs = track.durationMs > 0 ? Math.min(position, track.durationMs) : position;
	return {
		kind: 'playing',
		title: track.title,
		artist: track.artist,
		artworkUrl: track.artworkUrl,
		paused: session.paused,
		positionMs,
		durationMs: track.durationMs,
	};
}
