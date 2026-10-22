// SPDX-License-Identifier: AGPL-3.0-or-later

// The music panel docked at the right edge of the call when the call fills the view
// (expanded or fullscreen), where the channel side panel slot is not visible. It is the
// last child of the call's container: the container gets room for it through a
// fork-owned `:has()` rule (MusicPanel.module.css), so the upstream markup is unchanged.

import type {Channel} from '@app/features/channel/models/Channel';
import {isMusicPanelShown} from '@app/features/music/MusicCall';
import {MusicPanel} from '@app/features/music/MusicPanel';
import styles from '@app/features/music/MusicPanel.module.css';
import {observer} from 'mobx-react-lite';

interface MusicCallSidePanelProps {
	channel: Channel;
	/** False when the panel is shown elsewhere (the channel side panel slot). */
	enabled: boolean;
}

export const MusicCallSidePanel = observer(function MusicCallSidePanel({channel, enabled}: MusicCallSidePanelProps) {
	if (!enabled || !isMusicPanelShown(channel.id)) return null;
	return (
		<div className={styles.callSideDock} data-flx="music.music-call-side-panel">
			<MusicPanel channel={channel} data-flx="music.music-call-side-panel.music-panel" />
		</div>
	);
});
