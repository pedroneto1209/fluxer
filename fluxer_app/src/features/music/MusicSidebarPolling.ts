// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicGuildSessionsPoller} from '@app/features/music/MusicGuildSessionsPoller';
import MusicStore from '@app/features/music/MusicStore';
import SelectedGuild from '@app/features/navigation/state/SelectedGuild';
import {reaction} from 'mobx';

let installed = false;

/** Polls the selected community's music sessions. Safe to call many times. */
export function ensureMusicSidebarPolling(): void {
	if (installed) return;
	installed = true;
	const poller = new MusicGuildSessionsPoller({
		refresh: (guildId) => MusicStore.refreshGuildSessions(guildId),
		ensureAvailable: async () => {
			await MusicStore.checkAvailability();
			return MusicStore.availability === 'available';
		},
		isVisible: () => document.visibilityState === 'visible',
	});
	reaction(
		() => SelectedGuild.selectedGuildId,
		(guildId) => (guildId ? poller.start(guildId) : poller.stop()),
		{fireImmediately: true},
	);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') poller.handleVisibilityChange();
	});
}
