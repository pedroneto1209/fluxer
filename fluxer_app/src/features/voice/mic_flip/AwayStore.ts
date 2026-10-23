// SPDX-License-Identifier: AGPL-3.0-or-later

// Who in the call has flipped their headset mic up to talk to someone in the room
// (MicFlipStore.raised). Shared as LiveKit data messages, separate from mute, so an
// ordinary mute never shows the "unavailable" styling:
//   {"v":1,"away":true|false} on topic fluxer.custom.away.v1
// sent to everyone when it changes, and to each newcomer while it's true.

import SessionManager from '@app/features/platform/state/AuthSession';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {isVoiceMeshRoom} from '@app/features/voice/engine/mesh/VoiceMeshRoom';
import MicFlipStore from '@app/features/voice/mic_flip/MicFlipStore';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {ConnectionState, type Participant, type RemoteParticipant, type Room, RoomEvent} from 'livekit-client';
import {makeAutoObservable, reaction} from 'mobx';

const logger = new Logger('AwayStore');

export const AWAY_DATA_TOPIC = 'fluxer.custom.away.v1';
const MAX_PAYLOAD_BYTES = 64;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeAway(away: boolean): Uint8Array<ArrayBuffer> {
	return encoder.encode(JSON.stringify({v: 1, away}));
}

function decodeAway(payload: Uint8Array): boolean | null {
	if (payload.byteLength > MAX_PAYLOAD_BYTES) return null;
	try {
		const message: unknown = JSON.parse(decoder.decode(payload));
		if (typeof message !== 'object' || message === null) return null;
		const {v, away} = message as {v?: unknown; away?: unknown};
		return v === 1 && typeof away === 'boolean' ? away : null;
	} catch {
		return null;
	}
}

class AwayStore {
	// LiveKit identity -> away, for the other people in our call.
	remoteAway = new Map<string, boolean>();
	inCall = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get localAway(): boolean {
		return this.inCall && MicFlipStore.raised;
	}

	isUserAway(userId: string): boolean {
		if (userId === SessionManager.userId) return this.localAway;
		for (const [identity, away] of this.remoteAway) {
			if (away && parseVoiceParticipantIdentity(identity).userId === userId) return true;
		}
		return false;
	}

	private setRemote(identity: string, away: boolean): void {
		if (away) this.remoteAway.set(identity, true);
		else this.remoteAway.delete(identity);
	}

	private reset(inCall: boolean): void {
		this.remoteAway.clear();
		this.inCall = inCall;
	}

	bindRoom(room: Room): () => void {
		if (isVoiceMeshRoom(room)) return () => {};
		this.reset(true);

		const send = (away: boolean, to?: string): void => {
			if (room.state !== ConnectionState.Connected) return;
			void room.localParticipant
				.publishData(encodeAway(away), {
					reliable: true,
					topic: AWAY_DATA_TOPIC,
					...(to ? {destinationIdentities: [to]} : {}),
				})
				.catch((error: unknown) => logger.warn('Could not share the mic-up state', {error}));
		};
		const announce = (): void => {
			if (MicFlipStore.raised) send(true);
		};
		const onData = (payload: Uint8Array, participant: Participant | undefined, _kind: unknown, topic?: string) => {
			if (topic !== AWAY_DATA_TOPIC || !participant) return;
			const away = decodeAway(payload);
			if (away !== null) this.setRemote(participant.identity, away);
		};
		const onJoined = (participant: RemoteParticipant): void => {
			if (MicFlipStore.raised) send(true, participant.identity);
		};
		const onLeft = (participant: RemoteParticipant): void => this.setRemote(participant.identity, false);

		room.on(RoomEvent.DataReceived, onData);
		room.on(RoomEvent.ParticipantConnected, onJoined);
		room.on(RoomEvent.ParticipantDisconnected, onLeft);
		room.on(RoomEvent.Connected, announce);
		room.on(RoomEvent.Reconnected, announce);
		const stopReaction = reaction(
			() => MicFlipStore.raised,
			(raised) => send(raised),
		);
		announce();
		return () => {
			stopReaction();
			room.off(RoomEvent.DataReceived, onData);
			room.off(RoomEvent.ParticipantConnected, onJoined);
			room.off(RoomEvent.ParticipantDisconnected, onLeft);
			room.off(RoomEvent.Connected, announce);
			room.off(RoomEvent.Reconnected, announce);
			if (MicFlipStore.raised) send(false);
			this.reset(false);
		};
	}
}

export default new AwayStore();
