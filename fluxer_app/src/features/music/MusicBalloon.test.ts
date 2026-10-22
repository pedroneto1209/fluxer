// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicApiError, type MusicSessionState} from '@app/features/music/MusicApi';
import MusicBalloonState, {initialTabFor, MUSIC_BALLOON_KEY} from '@app/features/music/MusicBalloonState';
import MusicStore from '@app/features/music/MusicStore';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: null}}));
vi.mock('@app/features/ui/commands/PopoutCommands', () => ({close: vi.fn()}));

function makeState(overrides: Partial<MusicSessionState> = {}): MusicSessionState {
	return {
		guildId: 'g1',
		channelId: 'c1',
		spotifyAccount: null,
		nowPlaying: {
			id: 'q1',
			source: 'youtube',
			sourceId: 'abc',
			title: 'Song',
			artist: 'Artist',
			durationMs: 200_000,
			artworkUrl: null,
			url: 'https://example.com/abc',
			addedBy: null,
			recommended: false,
		},
		paused: false,
		positionMs: 0,
		positionAt: 0,
		queue: [],
		queueLength: 0,
		notice: null,
		spotifyRadio: false,
		revision: 1,
		...overrides,
	};
}

describe('music balloon', () => {
	afterEach(() => {
		vi.mocked(PopoutCommands.close).mockClear();
	});

	it('closes the balloon and drops the command state when the call is left', async () => {
		await MusicStore.runCommand(() => Promise.reject(new MusicApiError(409, 'QUEUE_FULL', 'full')));
		const hanging = MusicStore.runCommand(() => new Promise<MusicSessionState>(() => {}));
		expect(MusicStore.commandPending).toBe(true);
		MusicStore.handleCallLeft();
		expect(PopoutCommands.close).toHaveBeenCalledWith(MUSIC_BALLOON_KEY);
		expect(MusicStore.commandPending).toBe(false);
		expect(MusicStore.commandError).toBeNull();
		void hanging;
	});

	it('uses one popout key for every trigger', () => {
		expect(MUSIC_BALLOON_KEY).toBe('fluxer.music.balloon');
		MusicBalloonState.close();
		expect(PopoutCommands.close).toHaveBeenCalledWith(MUSIC_BALLOON_KEY);
	});

	it('opens on the queue while music plays, otherwise on search', () => {
		expect(initialTabFor(makeState())).toBe('queue');
		expect(initialTabFor(null)).toBe('search');
	});

	it('openAt and setTab choose the tab', () => {
		MusicBalloonState.openAt('search');
		expect(MusicBalloonState.tab).toBe('search');
		MusicBalloonState.setTab('queue');
		expect(MusicBalloonState.tab).toBe('queue');
	});
});
