// SPDX-License-Identifier: AGPL-3.0-or-later

// Wires the call's LiveKit room to the music feature: session state pushed by the
// music participant as data messages, the initial state over HTTP, and the local
// music volume.

import {getSession, type MusicSessionState, parseSessionState} from '@app/features/music/MusicApi';
import {musicIdentityForChannel} from '@app/features/music/MusicIdentity';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume, {type MusicVolumeState} from '@app/features/music/MusicVolume';
import {Logger} from '@app/features/platform/utils/AppLogger';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {ConnectionState, type Participant, type Room, RoomEvent} from 'livekit-client';
import {reaction} from 'mobx';

export const MUSIC_DATA_TOPIC = 'fluxer.custom.music.v1';

const logger = new Logger('MusicRoomBinding');
const decoder = new TextDecoder();

export interface MusicRoomBindingDependencies {
	/** Resolves once the service availability is known (sharing any in-flight check); true when it runs. */
	ensureAvailable: () => Promise<boolean>;
	getSession: (guildId: string, channelId: string) => Promise<MusicSessionState | null>;
	volume: MusicVolumeState;
	/** Global output volume percent; read inside a mobx reaction, so it should be observable. */
	getOutputVolume: () => number;
}

function decodeState(payload: Uint8Array): MusicSessionState | null {
	try {
		return parseSessionState(JSON.parse(decoder.decode(payload)));
	} catch {
		return null;
	}
}

export function bindMusicRoom(
	room: Room,
	guildId: string | null,
	channelId: string,
	dependencies: MusicRoomBindingDependencies = {
		ensureAvailable: async () => {
			await MusicStore.checkAvailability();
			return MusicStore.availability === 'available';
		},
		getSession,
		volume: MusicVolume,
		getOutputVolume: () => VoiceSettings.getOutputVolume(),
	},
): () => void {
	const {volume, getOutputVolume} = dependencies;
	// Only this channel's music participant may push its state.
	const musicIdentity = musicIdentityForChannel(channelId);
	let disposed = false;
	const applyVolume = (): void => volume.applyToRoom(room, getOutputVolume());

	const fetchInitialState = (): void => {
		if (!guildId) return;
		// Instances without the music service answer with HTML; do not request the session there.
		dependencies
			.ensureAvailable()
			.then((available) => (!disposed && available ? dependencies.getSession(guildId, channelId) : null))
			.then((state) => {
				if (!disposed && state && state.channelId === channelId) MusicStore.applyState(state);
			})
			.catch((error) => {
				logger.debug('Could not fetch the channel music session', {error});
			});
	};

	const onDataReceived = (
		payload: Uint8Array,
		participant: Participant | undefined,
		_kind: unknown,
		topic?: string,
	): void => {
		if (topic !== MUSIC_DATA_TOPIC || participant?.identity !== musicIdentity) return;
		const state = decodeState(payload);
		if (!state || state.channelId !== channelId) return;
		MusicStore.applyState(state);
	};

	// A (re)joining music participant means a new or resumed session: fetch its state
	// instead of waiting for the next data message.
	const onParticipantConnected = (participant: Participant): void => {
		if (participant.identity === musicIdentity) fetchInitialState();
	};

	// A new session can restart its revision low, so forget the old one when the bot leaves.
	const onParticipantDisconnected = (participant: Participant): void => {
		if (participant.identity === musicIdentity) MusicStore.clearChannel(channelId);
	};

	const onTrackSubscribed = (_track: unknown, _publication: unknown, participant: Participant): void => {
		if (participant.identity === musicIdentity) applyVolume();
	};

	room.on(RoomEvent.DataReceived, onDataReceived);
	room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
	room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
	room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
	room.on(RoomEvent.Connected, fetchInitialState);
	room.on(RoomEvent.Reconnected, fetchInitialState);
	const disposeVolumeReaction = reaction(() => [volume.volume, volume.muted, getOutputVolume()], applyVolume);

	applyVolume();
	if (room.state === ConnectionState.Connected) fetchInitialState();

	return () => {
		disposed = true;
		room.off(RoomEvent.DataReceived, onDataReceived);
		room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
		room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
		room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
		room.off(RoomEvent.Connected, fetchInitialState);
		room.off(RoomEvent.Reconnected, fetchInitialState);
		disposeVolumeReaction();
		MusicStore.clearChannel(channelId);
	};
}
