// SPDX-License-Identifier: AGPL-3.0-or-later

// Closes the music panel when the call ends or moves to another channel, so it does not
// pop open again in the next call. A reconnect to the same channel keeps it open.

import {reaction} from 'mobx';

export function installMusicPanelAutoClose(getChannelId: () => string | null, closePanel: () => void): () => void {
	return reaction(getChannelId, (channelId, previousChannelId) => {
		if (channelId !== previousChannelId) closePanel();
	});
}
