// SPDX-License-Identifier: AGPL-3.0-or-later

// Pure helpers for the "Fila" tab. The server keeps user items before recommended ones.

import type {MusicQueueItem, MusicSessionState} from '@app/features/music/MusicApi';

export function splitQueue(queue: ReadonlyArray<MusicQueueItem>): {
	user: Array<MusicQueueItem>;
	recommended: Array<MusicQueueItem>;
} {
	return {
		user: queue.filter((item) => !item.recommended),
		recommended: queue.filter((item) => item.recommended),
	};
}

export function queueTabLabel(session: MusicSessionState | null): string {
	if (!session) return 'Fila';
	return `Fila (${splitQueue(session.queue).user.length})`;
}

export function showRadioNotice(session: MusicSessionState): boolean {
	return session.spotifyRadio && splitQueue(session.queue).recommended.length === 0;
}
