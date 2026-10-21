// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção": send an MSN-style nudge (optionally with an animation) to someone in
// the same call, and play the ones sent to us: bring the app to the front, shake it,
// show the clip.

import {
	ATTENTION_DATA_TOPIC,
	decodeAttentionPayload,
	encodeAttentionPayload,
} from '@app/features/attention/AttentionProtocol';
import SessionManager from '@app/features/platform/state/AuthSession';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import Users from '@app/features/user/state/Users';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {isVoiceMeshRoom} from '@app/features/voice/engine/mesh/VoiceMeshRoom';
import {type AttentionWink, listWinks} from '@app/features/voice/soundboard/SoundboardApi';
import {parseVoiceParticipantIdentity} from '@app/features/voice/utils/VoiceParticipantIdentity';
import {type Participant, type Room, RoomEvent} from 'livekit-client';
import {makeAutoObservable, runInAction} from 'mobx';

const logger = new Logger('AttentionStore');

const SEND_COOLDOWN_MS = 10_000;
const WINK_CATALOG_TTL_MS = 5 * 60_000;

export interface ActiveAttention {
	key: number;
	senderName: string;
	wink: AttentionWink | null;
}

class AttentionStore {
	winks: Array<AttentionWink> = [];
	winksLoading = false;
	winksError: string | null = null;
	active: ActiveAttention | null = null;
	private winksLoadedAt = 0;
	private lastSentTo = new Map<string, number>();
	private nextKey = 1;

	constructor() {
		makeAutoObservable<AttentionStore, 'winksLoadedAt' | 'lastSentTo' | 'nextKey'>(this, {
			winksLoadedAt: false,
			lastSentTo: false,
			nextKey: false,
		});
	}

	async loadWinks(force = false): Promise<Array<AttentionWink>> {
		if (!force && this.winks.length > 0 && Date.now() - this.winksLoadedAt < WINK_CATALOG_TTL_MS) {
			return this.winks;
		}
		runInAction(() => {
			this.winksLoading = true;
			this.winksError = null;
		});
		try {
			const winks = await listWinks();
			runInAction(() => {
				this.winks = winks;
				this.winksLoadedAt = Date.now();
			});
			return winks;
		} catch (error) {
			logger.warn('Could not load the attention animations', {error});
			runInAction(() => {
				this.winksError = 'Could not load the animations.';
			});
			return this.winks;
		} finally {
			runInAction(() => {
				this.winksLoading = false;
			});
		}
	}

	cooldownRemainingMs(userId: string): number {
		const last = this.lastSentTo.get(userId) ?? 0;
		return Math.max(0, last + SEND_COOLDOWN_MS - Date.now());
	}

	// Sent as a LiveKit data message to every connection the user has in our call, so
	// nothing shows up in any chat.
	async send(userId: string, wink: AttentionWink | null): Promise<void> {
		const remaining = this.cooldownRemainingMs(userId);
		if (remaining > 0) {
			throw new Error(`Espere ${Math.ceil(remaining / 1000)}s para chamar a atenção de novo.`);
		}
		const room = MediaEngine.room;
		if (!room || !MediaEngine.connected) {
			throw new Error('Entre na chamada para chamar a atenção de alguém.');
		}
		if (isVoiceMeshRoom(room)) {
			throw new Error('Chamar atenção não funciona em chamadas ponto a ponto.');
		}
		const destinationIdentities = Array.from(room.remoteParticipants.values())
			.map((participant) => participant.identity)
			.filter((identity) => parseVoiceParticipantIdentity(identity).userId === userId);
		if (destinationIdentities.length === 0) {
			throw new Error('Essa pessoa não está mais na chamada.');
		}
		this.lastSentTo.set(userId, Date.now());
		try {
			await room.localParticipant.publishData(encodeAttentionPayload(wink?.id ?? null), {
				reliable: true,
				topic: ATTENTION_DATA_TOPIC,
				destinationIdentities,
			});
		} catch (error) {
			this.lastSentTo.delete(userId);
			throw error;
		}
	}

	bindRoom(room: Room): () => void {
		const onDataReceived = (
			payload: Uint8Array,
			participant: Participant | undefined,
			_kind: unknown,
			topic?: string,
		): void => {
			if (topic !== ATTENTION_DATA_TOPIC || !participant) return;
			const decoded = decodeAttentionPayload(payload);
			if (!decoded) return;
			this.handleIncoming(participant, decoded.winkId);
		};
		room.on(RoomEvent.DataReceived, onDataReceived);
		return () => {
			room.off(RoomEvent.DataReceived, onDataReceived);
		};
	}

	private handleIncoming(participant: Participant, winkId: string | null): void {
		const {userId} = parseVoiceParticipantIdentity(participant.identity);
		if (!userId || userId === SessionManager.userId) return;
		if (this.active) return;

		const senderName = Users.getUser(userId)?.displayName || participant.name || 'Alguém';
		getElectronAPI()?.windowBringToFront?.({shake: true});
		void this.loadWinks().then((winks) => {
			const wink = winkId ? (winks.find((candidate) => candidate.id === winkId) ?? null) : null;
			runInAction(() => {
				if (this.active) return;
				this.active = {key: this.nextKey++, senderName, wink};
			});
		});
	}

	dismiss(key: number): void {
		if (this.active?.key === key) {
			this.active = null;
		}
	}
}

export default new AttentionStore();
