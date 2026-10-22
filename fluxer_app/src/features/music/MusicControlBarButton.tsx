// SPDX-License-Identifier: AGPL-3.0-or-later

// "Música" button of the call control bar (next to the soundboard). It opens and closes
// the music balloon above it and only shows up where music works: instance with the music
// service, guild voice call over the SFU (not peer-to-peer) and the desktop layout.

import Channels from '@app/features/channel/state/Channels';
import {MusicBalloonPopout} from '@app/features/music/MusicBalloon';
import {MUSIC_BALLOON_KEY} from '@app/features/music/MusicBalloonState';
import {isMusicUsableInCall} from '@app/features/music/MusicCall';
import MusicStore from '@app/features/music/MusicStore';
import {FocusRingWrapper} from '@app/features/ui/components/FocusRingWrapper';
import PopoutState from '@app/features/ui/state/Popout';
import styles from '@app/features/voice/components/VoiceControlBar.module.css';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {MusicNoteIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export const MusicControlBarButton = observer(function MusicControlBarButton() {
	useEffect(() => {
		void MusicStore.checkAvailability();
	}, []);
	const channelId = MediaEngine.channelId;
	const channel = channelId ? Channels.getChannel(channelId) : undefined;
	if (!channel || !isMusicUsableInCall()) return null;
	const open = MUSIC_BALLOON_KEY in PopoutState.popouts;
	return (
		<div
			className={styles.buttonContainer}
			data-flx="voice.voice-control-bar.voice-control-bar-inner.button-container.music"
		>
			<MusicBalloonPopout
				channel={channel}
				position="top"
				tooltip="Música"
				data-flx="voice.voice-control-bar.music-balloon-popout"
			>
				<FocusRingWrapper
					focusRingOffset={-2}
					data-flx="voice.voice-control-bar.voice-control-bar-inner.focus-ring.music"
				>
					<button
						type="button"
						className={clsx(styles.button, open ? styles.buttonCameraOn : styles.buttonUnmuted)}
						aria-label="Música"
						data-flx="voice.voice-control-bar.voice-control-bar-inner.button.music"
					>
						<MusicNoteIcon
							weight="fill"
							className={styles.icon}
							data-flx="voice.voice-control-bar.voice-control-bar-inner.icon.music"
						/>
					</button>
				</FocusRingWrapper>
			</MusicBalloonPopout>
		</div>
	);
});
