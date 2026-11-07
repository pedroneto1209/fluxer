// SPDX-License-Identifier: AGPL-3.0-or-later

// The community's saved playlists (the "Playlists" tab), cached per guild while the app runs.
// The server keeps the list; playing one moves it to the top for everyone.

import {listSavedPlaylists, type MusicSavedPlaylist} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
import {makeAutoObservable, runInAction} from 'mobx';

export type MusicPlaylistsLoad =
	| {kind: 'idle'}
	| {kind: 'loading'}
	| {kind: 'ready'}
	| {kind: 'error'; message: string};

const EMPTY: ReadonlyArray<MusicSavedPlaylist> = [];

class MusicPlaylists {
	byGuild = new Map<string, ReadonlyArray<MusicSavedPlaylist>>();
	loads = new Map<string, MusicPlaylistsLoad>();
	private readonly loadSeq = new Map<string, number>();

	constructor() {
		makeAutoObservable<this, 'loadSeq'>(this, {loadSeq: false}, {autoBind: true});
	}

	playlistsOf(guildId: string): ReadonlyArray<MusicSavedPlaylist> {
		return this.byGuild.get(guildId) ?? EMPTY;
	}

	loadOf(guildId: string): MusicPlaylistsLoad {
		return this.loads.get(guildId) ?? {kind: 'idle'};
	}

	/** Fetches the list; what is cached stays on screen meanwhile (and on failure). */
	async load(guildId: string): Promise<void> {
		const seq = (this.loadSeq.get(guildId) ?? 0) + 1;
		this.loadSeq.set(guildId, seq);
		if (!this.byGuild.has(guildId)) this.loads.set(guildId, {kind: 'loading'});
		try {
			const playlists = await listSavedPlaylists(guildId);
			if (this.loadSeq.get(guildId) !== seq) return;
			runInAction(() => {
				this.byGuild.set(guildId, playlists);
				this.loads.set(guildId, {kind: 'ready'});
			});
		} catch (error) {
			if (this.loadSeq.get(guildId) !== seq) return;
			runInAction(() => this.loads.set(guildId, {kind: 'error', message: MusicStore.describeMusicError(error)}));
		}
	}

	/** A playlist was just played: it goes to the top. */
	upsert(guildId: string, playlist: MusicSavedPlaylist): void {
		const rest = this.playlistsOf(guildId).filter((p) => p.id !== playlist.id);
		this.byGuild.set(guildId, [playlist, ...rest]);
	}

	removeLocal(guildId: string, playlistId: string): void {
		this.byGuild.set(
			guildId,
			this.playlistsOf(guildId).filter((p) => p.id !== playlistId),
		);
	}
}

export default new MusicPlaylists();
