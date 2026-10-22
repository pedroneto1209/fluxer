// SPDX-License-Identifier: AGPL-3.0-or-later

// Closes the music panel (and drops its command state) when the call ends or moves to
// another channel, so it does not pop open again in the next call. During a reconnect the
// channel briefly reads null: only a null that lasts MUSIC_CALL_END_GRACE_MS counts as the
// call ending, and coming back to the same channel keeps the panel open.

import {reaction} from 'mobx';

export const MUSIC_CALL_END_GRACE_MS = 3_000;

export function installMusicPanelAutoClose(
	getChannelId: () => string | null,
	onCallLeft: () => void,
	graceMs: number = MUSIC_CALL_END_GRACE_MS,
): () => void {
	/** The channel of the call the panel belongs to; null once that call is over. */
	let callChannelId = getChannelId();
	let endTimer: ReturnType<typeof setTimeout> | null = null;
	const cancelEnd = (): void => {
		if (endTimer != null) clearTimeout(endTimer);
		endTimer = null;
	};
	const disposeReaction = reaction(getChannelId, (channelId) => {
		if (channelId == null) {
			if (callChannelId == null || endTimer != null) return;
			endTimer = setTimeout(() => {
				endTimer = null;
				callChannelId = null;
				onCallLeft();
			}, graceMs);
			return;
		}
		cancelEnd();
		const previous = callChannelId;
		callChannelId = channelId;
		if (previous != null && previous !== channelId) onCallLeft();
	});
	return () => {
		cancelEnd();
		disposeReaction();
	};
}
