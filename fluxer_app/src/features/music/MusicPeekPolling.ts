// SPDX-License-Identifier: AGPL-3.0-or-later

// Faster refresh of the guild's music sessions while the peek balloon is open. Pure: the
// refresh function is injected. The sidebar's slower poller keeps running independently.

import {PEEK_POLL_MS} from '@app/features/music/MusicPeekModel';

/** Refreshes now and every PEEK_POLL_MS until the returned function is called. */
export function startPeekPolling(refresh: () => Promise<void> | void, intervalMs: number = PEEK_POLL_MS): () => void {
	const tick = () => {
		if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
		void Promise.resolve(refresh()).catch(() => undefined);
	};
	tick();
	const timer = setInterval(tick, intervalMs);
	return () => clearInterval(timer);
}
