// SPDX-License-Identifier: AGPL-3.0-or-later

// Lyrics per track (fetched once per track while it is in the session) and the user's
// "show lyrics" preference, which is local to this device and on by default.

import {getLyrics} from '@app/features/music/MusicApi';
import {lyricsKey, type MusicLyrics, NO_LYRICS} from '@app/features/music/MusicLyricsModel';
import {makeAutoObservable, observable, runInAction} from 'mobx';

const STORAGE_KEY = 'fluxer.music.lyrics';
const MAX_ENTRIES = 50;

export interface MusicLyricsStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

type Fetch = (guildId: string, channelId: string, source: string, sourceId: string) => Promise<MusicLyrics>;

function defaultStorage(): MusicLyricsStorage | null {
	return typeof window === 'undefined' ? null : window.localStorage;
}

export class MusicLyricsState {
	enabled = true;
	/** Absent = not asked yet; 'loading' = in flight. */
	// Shallow: the lyrics themselves never change once fetched.
	byTrack = observable.map<string, MusicLyrics | 'loading'>(undefined, {deep: false});
	private readonly getStorage: () => MusicLyricsStorage | null;
	private readonly fetch: Fetch;

	constructor(fetch: Fetch = getLyrics, getStorage: () => MusicLyricsStorage | null = defaultStorage) {
		this.fetch = fetch;
		this.getStorage = getStorage;
		try {
			const raw = this.getStorage()?.getItem(STORAGE_KEY);
			if (raw === 'off') this.enabled = false;
		} catch {
			// Storage unavailable: keep the default (on).
		}
		makeAutoObservable<this, 'getStorage' | 'fetch'>(
			this,
			{byTrack: false, getStorage: false, fetch: false},
			{autoBind: true},
		);
	}

	toggleEnabled(): void {
		this.enabled = !this.enabled;
		try {
			this.getStorage()?.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
		} catch {}
	}

	/** The lyrics of a track, or 'loading' while they are not known yet (never "none" by default). */
	lyricsOf(source: string, sourceId: string): MusicLyrics | 'loading' {
		return this.byTrack.get(lyricsKey(source, sourceId)) ?? 'loading';
	}

	/** Fetches a track's lyrics once. A failed request counts as "no lyrics" for that track. */
	ensure(guildId: string, channelId: string, source: string, sourceId: string): void {
		const key = lyricsKey(source, sourceId);
		if (this.byTrack.has(key)) return;
		if (this.byTrack.size >= MAX_ENTRIES) {
			const oldest = this.byTrack.keys().next().value;
			if (oldest !== undefined) this.byTrack.delete(oldest);
		}
		this.byTrack.set(key, 'loading');
		this.fetch(guildId, channelId, source, sourceId).then(
			(lyrics) => runInAction(() => this.byTrack.set(key, lyrics)),
			() => runInAction(() => this.byTrack.set(key, NO_LYRICS)),
		);
	}
}

const musicLyrics = new MusicLyricsState();
export default musicLyrics;
