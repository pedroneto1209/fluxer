// SPDX-License-Identifier: AGPL-3.0-or-later

// State of the music balloon (the popout with the "Fila", "Buscar" and "Letra" tabs). Every trigger
// opens the same popout key, so there is only ever one balloon.

import type {MusicSessionState} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import {makeAutoObservable} from 'mobx';

export const MUSIC_BALLOON_KEY = 'fluxer.music.balloon';

export type MusicBalloonTab = 'queue' | 'search' | 'lyrics';

/** The queue while something plays, search otherwise (nothing to show in the queue yet). */
export function initialTabFor(session: MusicSessionState | null): MusicBalloonTab {
	return session?.nowPlaying ? 'queue' : 'search';
}

class MusicBalloonState {
	tab: MusicBalloonTab = 'search';

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	setTab(tab: MusicBalloonTab): void {
		this.tab = tab;
	}

	/** Called when the balloon opens: picks the tab it opens on. */
	openAt(tab: MusicBalloonTab): void {
		this.tab = tab;
	}

	close(): void {
		PopoutCommands.close(MUSIC_BALLOON_KEY);
	}
}

const musicBalloonState = new MusicBalloonState();
export default musicBalloonState;

/**
 * The call ended or moved to another channel (MusicPanelAutoClose, installed by MusicCall):
 * drops the command state and closes the balloon. On logout the call ends too, so the
 * balloon closes through this path (and its triggers unmount with the call).
 */
export function handleMusicCallLeft(): void {
	MusicStore.handleCallLeft();
	musicBalloonState.close();
}
