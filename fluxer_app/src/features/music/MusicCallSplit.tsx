// SPDX-License-Identifier: AGPL-3.0-or-later

// Wraps the call view so the music panel can sit at its right when the call fills the
// view (expanded or fullscreen), where the channel side panel slot is not visible. The
// wrappers use `display: contents` while the panel is closed, so the call keeps its
// upstream layout and is never remounted when the panel opens or closes.

import type {Channel} from '@app/features/channel/models/Channel';
import {isMusicPanelShown} from '@app/features/music/MusicCall';
import {MusicPanel} from '@app/features/music/MusicPanel';
import styles from '@app/features/music/MusicPanel.module.css';
import {observer} from 'mobx-react-lite';
import type React from 'react';

interface MusicCallSplitProps {
	channel: Channel;
	/** False when the panel is shown elsewhere (the channel side panel slot). */
	enabled: boolean;
	children: React.ReactNode;
}

export const MusicCallSplit = observer(function MusicCallSplit({channel, enabled, children}: MusicCallSplitProps) {
	const showPanel = enabled && isMusicPanelShown(channel.id);
	return (
		<div className={showPanel ? styles.callSplit : styles.passthrough} data-flx="music.music-call-split">
			<div className={showPanel ? styles.callSplitCall : styles.passthrough} data-flx="music.music-call-split.call">
				{children}
			</div>
			{showPanel && <MusicPanel channel={channel} data-flx="music.music-call-split.music-panel" />}
		</div>
	);
});
