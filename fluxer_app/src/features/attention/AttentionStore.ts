// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção": send an MSN-style nudge (optionally with an animation) to someone in
// the same call, and play the ones sent to us: bring the app to the front, shake it,
// show the clip. The person nudged answers with an ack, so the sender can see what
// actually happened on the other side.

import AttentionBlocks from '@app/features/attention/AttentionBlocks';
import {
	ATTENTION_DATA_TOPIC,
	type AttentionAckStatus,
	decodeAttentionMessage,
	encodeAttentionAck,
	encodeAttentionNudge,
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
// How long a sender waits for the other side to answer before saying so.
const ACK_TIMEOUT_MS = 6000;

export interface ActiveAttention {
	key: number;
	senderName: string;
	wink: AttentionWink | null;
}

export type SentAttentionStatus = AttentionAckStatus | 'no-answer';

// What the sender sees in the corner after a nudge.
export interface SentAttention {
	key: number;
	recipientName: string;
	wink: AttentionWink | null;
	status: SentAttentionStatus;
}

interface PendingNudge {
	userId: string;
	recipientName: string;
	wink: AttentionWink | null;
	timer: ReturnType<typeof setTimeout>;
}

function createNonce(): string {
	return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

class AttentionStore {
	winks: Array<AttentionWink> = [];
	winksLoading = false;
	winksError: string | null = null;
	active: ActiveAttention | null = null;
	sent: SentAttention | null = null;
	private winksLoadedAt = 0;
	private lastSentTo = new Map<string, number>();
	private pending = new Map<string, PendingNudge>();
	private nextKey = 1;

	constructor() {
		makeAutoObservable<AttentionStore, 'winksLoadedAt' | 'lastSentTo' | 'pending' | 'nextKey'>(this, {
			winksLoadedAt: false,
			lastSentTo: false,
			pending: false,
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
				this.winksError = 'Não foi possível carregar as animações.';
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
		const nonce = createNonce();
		this.lastSentTo.set(userId, Date.now());
		try {
			await room.localParticipant.publishData(encodeAttentionNudge(wink?.id ?? null, nonce), {
				reliable: true,
				topic: ATTENTION_DATA_TOPIC,
				destinationIdentities,
			});
		} catch (error) {
			this.lastSentTo.delete(userId);
			throw error;
		}
		const recipientName = Users.getUser(userId)?.displayName || 'Essa pessoa';
		const timer = setTimeout(() => this.resolvePending(nonce, 'no-answer'), ACK_TIMEOUT_MS);
		this.pending.set(nonce, {userId, recipientName, wink, timer});
	}

	bindRoom(room: Room): () => void {
		const onDataReceived = (
			payload: Uint8Array,
			participant: Participant | undefined,
			_kind: unknown,
			topic?: string,
		): void => {
			if (topic !== ATTENTION_DATA_TOPIC || !participant) return;
			const message = decodeAttentionMessage(payload);
			if (!message) return;
			if (message.type === 'ack') {
				const pending = this.pending.get(message.nonce);
				if (pending && parseVoiceParticipantIdentity(participant.identity).userId === pending.userId) {
					this.resolvePending(message.nonce, message.status);
				}
				return;
			}
			this.handleIncoming(room, participant, message.winkId, message.nonce);
		};
		room.on(RoomEvent.DataReceived, onDataReceived);
		return () => {
			room.off(RoomEvent.DataReceived, onDataReceived);
		};
	}

	private resolvePending(nonce: string, status: SentAttentionStatus): void {
		const pending = this.pending.get(nonce);
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pending.delete(nonce);
		this.sent = {key: this.nextKey++, recipientName: pending.recipientName, wink: pending.wink, status};
	}

	private answer(room: Room, participant: Participant, nonce: string | null, status: AttentionAckStatus): void {
		if (!nonce) return;
		void room.localParticipant
			.publishData(encodeAttentionAck(nonce, status), {
				reliable: true,
				topic: ATTENTION_DATA_TOPIC,
				destinationIdentities: [participant.identity],
			})
			.catch((error: unknown) => logger.warn('Could not answer a nudge', {error}));
	}

	private handleIncoming(room: Room, participant: Participant, winkId: string | null, nonce: string | null): void {
		const {userId} = parseVoiceParticipantIdentity(participant.identity);
		if (!userId || userId === SessionManager.userId) return;
		if (AttentionBlocks.isBlocked(userId)) {
			this.answer(room, participant, nonce, 'blocked');
			return;
		}
		if (this.active) {
			this.answer(room, participant, nonce, 'busy');
			return;
		}

		const senderName = Users.getUser(userId)?.displayName || participant.name || 'Alguém';
		getElectronAPI()?.windowBringToFront?.({shake: true});
		void this.loadWinks(winkId != null && !this.winks.some((wink) => wink.id === winkId)).then((winks) => {
			const wink = winkId ? (winks.find((candidate) => candidate.id === winkId) ?? null) : null;
			runInAction(() => {
				if (this.active) {
					this.answer(room, participant, nonce, 'busy');
					return;
				}
				this.active = {key: this.nextKey++, senderName, wink};
				this.answer(room, participant, nonce, 'shown');
			});
		});
	}

	dismiss(key: number): void {
		if (this.active?.key === key) {
			this.active = null;
		}
	}

	dismissSent(key: number): void {
		if (this.sent?.key === key) {
			this.sent = null;
		}
	}
}

export default new AttentionStore();
