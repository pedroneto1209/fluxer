// SPDX-License-Identifier: AGPL-3.0-or-later

// State of the music balloon (the popout with the "Fila" and "Buscar" tabs). Every trigger
// opens the same popout key, so there is only ever one balloon.

import type {MusicSessionState} from '@app/features/music/MusicApi';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import {makeAutoObservable} from 'mobx';

export const MUSIC_BALLOON_KEY = 'fluxer.music.balloon';

export type MusicBalloonTab = 'queue' | 'search';

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

export default new MusicBalloonState();
