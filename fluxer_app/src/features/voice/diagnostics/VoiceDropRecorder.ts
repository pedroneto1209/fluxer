// SPDX-License-Identifier: AGPL-3.0-or-later

// Diagnostics for calls that end on their own. Keeps the recent voice-related log
// lines (debug ones too, which the console hides) plus LiveKit's own log, and when the
// app leaves a call (a leave sent to the gateway, the LiveKit room being closed, or
// LiveKit dropping it) sends a short report to the soundboard service, with the stack
// of the code that asked for it. Reports stay in the server's data directory.

import Config from '@app/features/app/config/Config';
import {Logger, LogLevel} from '@app/features/platform/utils/AppLogger';
import {type SentVoiceState, setVoiceStateSendListener} from '@app/features/voice/diagnostics/VoiceStateSendTap';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import MicFlipStore from '@app/features/voice/mic_flip/MicFlipStore';
import {sendVoiceDropReport} from '@app/features/voice/soundboard/SoundboardApi';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import {DisconnectReason, type Room, RoomEvent, setLogExtension} from 'livekit-client';

const MAX_LINES = 500;
const MAX_LINE_CHARS = 600;
const MAX_STACK_CHARS = 4000;
// Lines logged right after a leave usually say what happened next, so wait a little.
const REPORT_DELAY_MS = 5000;
const RETRY_DELAYS_MS = [30_000, 120_000];
const VOICE_LOGGER_NAME =
	/voice|media|livekit|reconnect|gateway|soundboard|micflip|away|music|attention|call|rtc|permission|audio|microphone/i;
const LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
const LIVEKIT_LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error'];

interface LogLine {
	t: number;
	level: string;
	name: string;
	text: string;
}

interface Trigger {
	kind: string;
	t: number;
	detail: Record<string, unknown>;
	stack: string | null;
}

function summarize(value: unknown, depth: number): unknown {
	if (typeof value === 'bigint') return String(value);
	if (value === null || typeof value !== 'object') return value;
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : '{…}';
	if (Array.isArray(value)) return value.slice(0, 10).map((item) => summarize(item, depth + 1));
	const proto = Object.getPrototypeOf(value);
	if (proto !== Object.prototype && proto !== null) return `[${proto?.constructor?.name ?? 'object'}]`;
	const out: Record<string, unknown> = {};
	let count = 0;
	for (const [key, item] of Object.entries(value)) {
		if (count++ >= 20) {
			out['…'] = 'more';
			break;
		}
		out[key] = summarize(item, depth + 1);
	}
	return out;
}

function describe(args: ReadonlyArray<unknown>): string {
	const text = args
		.map((arg) => {
			if (typeof arg === 'string') return arg;
			try {
				return JSON.stringify(summarize(arg, 0)) ?? String(arg);
			} catch {
				return Object.prototype.toString.call(arg);
			}
		})
		.join(' ');
	return text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text;
}

function captureStack(): string | null {
	const stack = new Error('voice drop').stack ?? null;
	return stack && stack.length > MAX_STACK_CHARS ? stack.slice(0, MAX_STACK_CHARS) : stack;
}

class VoiceDropRecorder {
	private readonly lines: Array<LogLine> = [];
	private triggers: Array<Trigger> = [];
	private reportTimer: ReturnType<typeof setTimeout> | null = null;
	private started = false;

	start(): void {
		if (this.started) return;
		this.started = true;
		Logger.setTap((level, name, args) => {
			if (level < LogLevel.Debug || level >= LogLevel.Silent || !VOICE_LOGGER_NAME.test(name)) return;
			this.push({t: Date.now(), level: LEVEL_NAMES[level] ?? String(level), name, text: describe(args)});
		});
		setLogExtension((level, msg, context) => {
			this.push({
				t: Date.now(),
				level: LIVEKIT_LEVEL_NAMES[level] ?? String(level),
				name: 'livekit',
				text: describe(context ? [msg, context] : [msg]),
			});
		});
		setVoiceStateSendListener((params) => this.onVoiceStateSent(params));
	}

	// Watches one LiveKit room: who closes it, and why LiveKit says it ended.
	bindRoom(room: Room): () => void {
		const originalDisconnect = room.disconnect;
		room.disconnect = (...args: Parameters<Room['disconnect']>) => {
			this.trigger('room-disconnect-called', {roomName: room.name});
			return originalDisconnect.apply(room, args);
		};
		const onDisconnected = (reason?: DisconnectReason) => {
			this.trigger('livekit-disconnected', {
				roomName: room.name,
				reason: reason === undefined ? null : (DisconnectReason[reason] ?? reason),
			});
		};
		room.on(RoomEvent.Disconnected, onDisconnected);
		return () => {
			room.off(RoomEvent.Disconnected, onDisconnected);
			if (room.disconnect !== originalDisconnect) room.disconnect = originalDisconnect;
		};
	}

	private push(line: LogLine): void {
		this.lines.push(line);
		if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
	}

	private onVoiceStateSent(params: SentVoiceState): void {
		const detail = {
			guildId: params.guild_id,
			channelId: params.channel_id,
			connectionId: params.connection_id ?? null,
			selfMute: params.self_mute,
			selfDeaf: params.self_deaf,
			connectedConnectionId: MediaEngine.connectionId,
		};
		if (params.channel_id == null) {
			this.trigger('gateway-leave', detail);
		} else if (params.connection_id == null && MediaEngine.connected) {
			// A fresh join while still in a call: worth a line with where it came from.
			this.push({
				t: Date.now(),
				level: 'info',
				name: 'VoiceDropRecorder',
				text: describe(['fresh join while connected', detail, captureStack()]),
			});
		}
	}

	private trigger(kind: string, detail: Record<string, unknown>): void {
		this.triggers.push({kind, t: Date.now(), detail, stack: captureStack()});
		this.push({t: Date.now(), level: 'info', name: 'VoiceDropRecorder', text: describe([kind, detail])});
		if (this.reportTimer == null) {
			this.reportTimer = setTimeout(() => this.flush(), REPORT_DELAY_MS);
		}
	}

	private flush(): void {
		this.reportTimer = null;
		const triggers = this.triggers;
		this.triggers = [];
		if (triggers.length === 0) return;
		const report = {
			version: 1,
			build: Config.PUBLIC_BUILD_VERSION,
			sentAt: new Date().toISOString(),
			triggers,
			state: {
				connected: MediaEngine.connected,
				guildId: MediaEngine.guildId,
				channelId: MediaEngine.channelId,
				connectionId: MediaEngine.connectionId,
				selfMute: LocalVoiceState.getSelfMute(),
				selfDeaf: LocalVoiceState.getSelfDeaf(),
				micFlip: {enabled: MicFlipStore.enabled, position: MicFlipStore.position, headset: MicFlipStore.headsetName},
				visibility: typeof document === 'undefined' ? null : document.visibilityState,
				online: typeof navigator === 'undefined' ? null : navigator.onLine,
			},
			lines: this.lines.slice(),
		};
		void this.send(report, 0);
	}

	private async send(report: object, attempt: number): Promise<void> {
		try {
			await sendVoiceDropReport(report);
		} catch {
			const delay = RETRY_DELAYS_MS[attempt];
			if (delay !== undefined) setTimeout(() => void this.send(report, attempt + 1), delay);
		}
	}
}

export default new VoiceDropRecorder();
