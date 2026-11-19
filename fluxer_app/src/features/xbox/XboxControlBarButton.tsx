// SPDX-License-Identifier: AGPL-3.0-or-later

// "Xbox" button of the call control bar, only for the console's owner (the service says
// who that is): starts and stops streaming the Xbox into this call, or signs the
// Microsoft account in when the server has none.

import {FocusRingWrapper} from '@app/features/ui/components/FocusRingWrapper';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import styles from '@app/features/voice/components/VoiceControlBar.module.css';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {isVoiceMeshRoom} from '@app/features/voice/engine/mesh/VoiceMeshRoom';
import type {XboxStatus} from '@app/features/xbox/XboxApi';
import XboxStore from '@app/features/xbox/XboxStore';
import {GameControllerIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect} from 'react';

export type XboxButtonMode = 'hidden' | 'signIn' | 'start' | 'starting' | 'stop' | 'elsewhere';

/** What the button does in this call (pure, for tests). */
export function xboxButtonMode(
	status: XboxStatus | null,
	guildId: string | null,
	channelId: string | null,
): XboxButtonMode {
	if (!status?.canControl || !guildId || !channelId) return 'hidden';
	const stream = status.stream;
	const active = stream.state === 'starting' || stream.state === 'live' || stream.state === 'stopping';
	if (active) {
		if (stream.channelId !== channelId) return 'elsewhere';
		return stream.state === 'live' ? 'stop' : 'starting';
	}
	return status.signedIn ? 'start' : 'signIn';
}

const LABELS: Record<Exclude<XboxButtonMode, 'hidden'>, string> = {
	signIn: 'Conectar a conta Microsoft do Xbox',
	start: 'Transmitir o Xbox nesta call',
	starting: 'Xbox conectando… (clique para cancelar)',
	stop: 'Parar a transmissão do Xbox',
	elsewhere: 'O Xbox está transmitindo em outro canal',
};

export const XboxControlBarButton = observer(function XboxControlBarButton() {
	useEffect(() => XboxStore.poll(), []);
	const room = MediaEngine.room;
	const guildId = MediaEngine.guildId ?? null;
	const channelId = MediaEngine.channelId ?? null;
	if (!room || isVoiceMeshRoom(room) || MobileLayout.enabled || XboxStore.available !== true) return null;
	const mode = xboxButtonMode(XboxStore.status, guildId, channelId);
	if (mode === 'hidden' || !guildId || !channelId) return null;
	const step = XboxStore.status?.stream.step;
	const label = mode === 'starting' && step ? `Xbox: ${step}… (clique para cancelar)` : LABELS[mode];
	const onClick = () => {
		if (mode === 'signIn') void XboxStore.signIn();
		else if (mode === 'start') void XboxStore.start(guildId, channelId);
		else if (mode === 'stop' || mode === 'starting') void XboxStore.stop();
	};
	const on = mode === 'stop' || mode === 'starting';
	return (
		<div
			className={styles.buttonContainer}
			data-flx="voice.voice-control-bar.voice-control-bar-inner.button-container.xbox"
		>
			<Tooltip text={label} data-flx="voice.voice-control-bar.xbox-tooltip">
				<FocusRingWrapper
					focusRingOffset={-2}
					data-flx="voice.voice-control-bar.voice-control-bar-inner.focus-ring.xbox"
				>
					<button
						type="button"
						className={clsx(styles.button, on ? styles.buttonCameraOn : styles.buttonUnmuted)}
						aria-label={label}
						aria-pressed={on}
						disabled={XboxStore.busy || mode === 'elsewhere'}
						onClick={onClick}
						data-flx="voice.voice-control-bar.voice-control-bar-inner.button.xbox"
					>
						<GameControllerIcon
							weight="fill"
							className={styles.icon}
							data-flx="voice.voice-control-bar.voice-control-bar-inner.icon.xbox"
						/>
					</button>
				</FocusRingWrapper>
			</Tooltip>
		</div>
	);
});
