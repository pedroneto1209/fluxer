// SPDX-License-Identifier: AGPL-3.0-or-later

import {AttentionOverlay} from '@app/features/attention/AttentionOverlay';
import AttentionStore from '@app/features/attention/AttentionStore';
import {ensureMusicPanelAutoClose} from '@app/features/music/MusicCall';
import {bindMusicRoom} from '@app/features/music/MusicRoomBinding';
import {ComponentBus} from '@app/features/platform/utils/ComponentBus';
import {VoiceRoomContext} from '@app/features/voice/components/VoiceRoomContext';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import AwayStore from '@app/features/voice/mic_flip/AwayStore';
import MicFlipStore from '@app/features/voice/mic_flip/MicFlipStore';
import {type RoomAudioRendererProps, RoomContext} from '@livekit/components-react';
import type {Room} from 'livekit-client';
import type React from 'react';
import {useEffect, useState} from 'react';

type RoomAudioRendererComponent = React.ComponentType<RoomAudioRendererProps & {'data-flx'?: string}>;

interface LiveKitComponentsModule {
	RoomAudioRenderer: RoomAudioRendererComponent;
}

interface VoiceLiveKitRootProps {
	room: Room | null;
	children: React.ReactNode;
	'data-flx'?: string;
}

let liveKitComponentsPromise: Promise<LiveKitComponentsModule> | null = null;

function loadLiveKitComponents(): Promise<LiveKitComponentsModule> {
	liveKitComponentsPromise ??= import('@livekit/components-react').then(({RoomAudioRenderer}) => ({RoomAudioRenderer}));
	return liveKitComponentsPromise;
}

export function VoiceLiveKitRoot({room, children}: VoiceLiveKitRootProps): React.ReactElement {
	const [components, setComponents] = useState<LiveKitComponentsModule | null>(null);

	// The voice_toggle_soundboard keybind (Ctrl+Shift+B by default) dispatches this.
	useEffect(
		() =>
			ComponentBus.subscribe('SOUNDBOARD_TOGGLE', () => {
				void import('@app/features/voice/soundboard/SoundboardModal').then(({toggleSoundboard}) => toggleSoundboard());
			}),
		[],
	);

	// Watches a JBL headset's flip-to-mute boom mic, if one is plugged in.
	useEffect(() => MicFlipStore.start(), []);

	// Tells the call when the headset mic is flipped up (and hears who else has).
	useEffect(() => (room ? AwayStore.bindRoom(room) : undefined), [room]);

	// Nudges ("chamar atenção") arrive as data messages in the call.
	useEffect(() => (room ? AttentionStore.bindRoom(room) : undefined), [room]);

	// Channel music: state pushed by the music participant, initial fetch, local volume.
	// The room and the channel come from the same connection snapshot (App re-renders on room change).
	useEffect(ensureMusicPanelAutoClose, []);
	const musicGuildId = room ? MediaEngine.guildId : null;
	const musicChannelId = room ? MediaEngine.channelId : null;
	useEffect(
		() => (room && musicChannelId ? bindMusicRoom(room, musicGuildId, musicChannelId) : undefined),
		[room, musicGuildId, musicChannelId],
	);

	useEffect(() => {
		if (!room || components) {
			return;
		}
		let canceled = false;
		void loadLiveKitComponents().then((loadedComponents) => {
			if (!canceled) {
				setComponents(loadedComponents);
			}
		});
		return () => {
			canceled = true;
		};
	}, [components, room]);

	if (!room) {
		return (
			<VoiceRoomContext.Provider value={undefined}>
				{children}
				<AttentionOverlay data-flx="app.app.app-wrapper.attention-overlay" />
			</VoiceRoomContext.Provider>
		);
	}

	return (
		<VoiceRoomContext.Provider value={room}>
			<RoomContext.Provider value={room}>
				{children}
				{components && <components.RoomAudioRenderer data-flx="app.app.app-wrapper.room-audio-renderer" />}
				<AttentionOverlay data-flx="app.app.app-wrapper.attention-overlay" />
			</RoomContext.Provider>
		</VoiceRoomContext.Provider>
	);
}
