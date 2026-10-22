// SPDX-License-Identifier: AGPL-3.0-or-later

// What the read-only "peek" balloon shows for people outside the call. Pure (no UI imports).

import type {MusicGuildSession, MusicSource} from '@app/features/music/MusicApi';
import {miniPlayerView} from '@app/features/music/MusicMiniPlayerModel';

/** While the peek is open the guild's sessions are refreshed this often. */
export const PEEK_POLL_MS = 5_000;

export interface PeekTrack {
	id: string;
	title: string;
	artist: string;
	artworkUrl: string | null;
	source: MusicSource;
	addedBy: string | null;
	recommended: boolean;
}

export interface PeekView {
	current: PeekTrack;
	paused: boolean;
	positionMs: number;
	/** 0 = unknown. */
	durationMs: number;
	upNext: Array<PeekTrack>;
}

/** Null when nothing is playing (or there is no session). */
export function peekView(session: MusicGuildSession | undefined, nowMs: number): PeekView | null {
	const mini = miniPlayerView(session ?? null, nowMs);
	const current = session?.nowPlaying;
	if (mini.kind === 'idle' || !session || !current) return null;
	return {
		current: toPeekTrack(current),
		paused: mini.paused,
		positionMs: mini.positionMs,
		durationMs: mini.durationMs,
		upNext: session.upNext.map(toPeekTrack),
	};
}

function toPeekTrack(item: MusicGuildSession['upNext'][number]): PeekTrack {
	return {
		id: item.id,
		title: item.title,
		artist: item.artist,
		artworkUrl: item.artworkUrl,
		source: item.source,
		addedBy: item.addedBy,
		recommended: item.recommended,
	};
}

export function joinToListenLabel(channelName: string): string {
	return `Entrar em ${channelName} para ouvir`;
}
