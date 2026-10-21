// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção": send an MSN-style nudge (optionally with an animation) to a friend,
// and play the ones sent to us: bring the app to the front, shake it, show the clip.

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {
	formatAttentionMessage,
	parseAttentionMessage,
} from '@app/features/attention/AttentionProtocol';
import {ensureDMChannel} from '@app/features/channel/commands/PrivateChannelCommands';
import Channels from '@app/features/channel/state/Channels';
import SessionManager from '@app/features/platform/state/AuthSession';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {getElectronAPI} from '@app/features/ui/utils/NativeUtils';
import {type AttentionWink, listWinks} from '@app/features/voice/soundboard/SoundboardApi';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import type {Message} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {makeAutoObservable, runInAction} from 'mobx';

const logger = new Logger('AttentionStore');

const SEND_COOLDOWN_MS = 10_000;
const MAX_MESSAGE_AGE_MS = 60_000;
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
	private seenMessageIds = new Set<string>();
	private nextKey = 1;

	constructor() {
		makeAutoObservable<AttentionStore, 'winksLoadedAt' | 'lastSentTo' | 'seenMessageIds' | 'nextKey'>(this, {
			winksLoadedAt: false,
			lastSentTo: false,
			seenMessageIds: false,
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

	async send(userId: string, wink: AttentionWink | null): Promise<void> {
		const remaining = this.cooldownRemainingMs(userId);
		if (remaining > 0) {
			throw new Error(`Espere ${Math.ceil(remaining / 1000)}s para chamar a atenção de novo.`);
		}
		this.lastSentTo.set(userId, Date.now());
		try {
			const channelId = await ensureDMChannel(userId);
			await http.post(Endpoints.CHANNEL_MESSAGES(channelId), {
				body: {content: formatAttentionMessage(wink?.name ?? null)},
			});
		} catch (error) {
			this.lastSentTo.delete(userId);
			throw error;
		}
	}

	handleIncoming(message: Message): void {
		const parsed = parseAttentionMessage(message.content);
		if (!parsed) return;
		const me = SessionManager.userId;
		if (!me || message.author?.id === me) return;
		const channel = Channels.getChannel(message.channel_id);
		if (message.guild_id || (channel && channel.type !== ChannelTypes.DM)) return;
		if (this.seenMessageIds.has(message.id)) return;
		this.seenMessageIds.add(message.id);
		const sentAt = Date.parse(message.timestamp);
		if (Number.isFinite(sentAt) && Date.now() - sentAt > MAX_MESSAGE_AGE_MS) return;
		if (this.active) return;

		const senderName = message.author.global_name || message.author.username || 'Alguém';
		getElectronAPI()?.windowBringToFront?.({shake: true});
		void this.loadWinks().then((winks) => {
			const wink = parsed.winkName ? (winks.find((candidate) => candidate.name === parsed.winkName) ?? null) : null;
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
