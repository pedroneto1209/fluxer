// SPDX-License-Identifier: AGPL-3.0-or-later

// "Música" button of the call control bar (next to the soundboard). It opens and closes
// the music panel and only shows up where music works: instance with the music service,
// guild voice call over the SFU (not peer-to-peer) and the desktop layout.

import {ensureMusicPanelAutoClose, isMusicUsableInCall} from '@app/features/music/MusicCall';
import MusicStore from '@app/features/music/MusicStore';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/VoiceControlBar.module.css';
import {MusicNoteIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const MusicControlBarButton = observer(function MusicControlBarButton() {
	useEffect(() => {
		void MusicStore.checkAvailability();
		ensureMusicPanelAutoClose();
	}, []);
	if (!isMusicUsableInCall()) return null;
	const open = MusicStore.panelOpen;
	const label = open ? 'Fechar música' : 'Música';
	return (
		<div
			className={styles.buttonContainer}
			data-flx="voice.voice-control-bar.voice-control-bar-inner.button-container.music"
		>
			<Tooltip text={label} data-flx="voice.voice-control-bar.voice-control-bar-inner.tooltip.music">
				<FocusRing offset={-2} data-flx="voice.voice-control-bar.voice-control-bar-inner.focus-ring.music">
					<button
						type="button"
						className={clsx(styles.button, open ? styles.buttonCameraOn : styles.buttonUnmuted)}
						onClick={MusicStore.togglePanel}
						aria-label="Música"
						aria-pressed={open}
						data-flx="voice.voice-control-bar.voice-control-bar-inner.button.music"
					>
						<MusicNoteIcon
							weight="fill"
							className={styles.icon}
							data-flx="voice.voice-control-bar.voice-control-bar-inner.icon.music"
						/>
					</button>
				</FocusRing>
			</Tooltip>
		</div>
	);
});
