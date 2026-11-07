// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const sendVoiceDropReport = vi.fn(async (_report: object) => undefined);

vi.mock('@app/features/voice/soundboard/SoundboardApi', () => ({
	sendVoiceDropReport: (report: object) => sendVoiceDropReport(report),
}));
vi.mock('@app/features/voice/engine/MediaEngineFacade', () => ({
	default: {connected: true, guildId: '1', channelId: '2', connectionId: 'otter-kelp'},
}));
vi.mock('@app/features/voice/mic_flip/MicFlipStore', () => ({
	default: {enabled: true, position: 'up', headsetName: 'JBL Quantum 910'},
}));
vi.mock('@app/features/voice/state/LocalVoiceState', () => ({
	default: {getSelfMute: () => true, getSelfDeaf: () => false},
}));

const {Logger} = await import('@app/features/platform/utils/AppLogger');
const {notifyVoiceStateSend} = await import('@app/features/voice/diagnostics/VoiceStateSendTap');
const {default: VoiceDropRecorder} = await import('@app/features/voice/diagnostics/VoiceDropRecorder');

interface SentReport {
	triggers: Array<{kind: string; stack: string | null; detail: Record<string, unknown>}>;
	state: {micFlip: {position: string}};
	lines: Array<{name: string; text: string}>;
}

function lastReport(): SentReport {
	const call = sendVoiceDropReport.mock.calls.at(-1);
	if (!call) throw new Error('no report was sent');
	return call[0] as SentReport;
}

describe('VoiceDropRecorder', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		sendVoiceDropReport.mockClear();
		VoiceDropRecorder.start();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('reports a gateway leave with its stack and the recent voice lines', async () => {
		new Logger('MediaEngineFacade').debug('Reconnect state updated', {reason: 'error'});
		new Logger('MessageList').info('not about voice');
		notifyVoiceStateSend({
			guild_id: '1',
			channel_id: null,
			connection_id: 'otter-kelp',
			self_mute: true,
			self_deaf: true,
		});
		expect(sendVoiceDropReport).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(5000);

		expect(sendVoiceDropReport).toHaveBeenCalledTimes(1);
		const report = lastReport();
		expect(report.triggers.map((t) => t.kind)).toEqual(['gateway-leave']);
		expect(report.triggers[0]?.stack).toContain('voice drop');
		expect(report.triggers[0]?.detail['connectionId']).toBe('otter-kelp');
		expect(report.state.micFlip.position).toBe('up');
		expect(report.lines.some((l) => l.name === 'MediaEngineFacade' && l.text.includes('Reconnect state updated'))).toBe(
			true,
		);
		expect(report.lines.some((l) => l.name === 'MessageList')).toBe(false);
	});

	it('ignores ordinary voice state updates such as mute toggles', async () => {
		notifyVoiceStateSend({
			guild_id: '1',
			channel_id: '2',
			connection_id: 'otter-kelp',
			self_mute: true,
			self_deaf: false,
		});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(sendVoiceDropReport).not.toHaveBeenCalled();
	});

	it('folds a room disconnect that follows the leave into the same report', async () => {
		const disconnect = vi.fn(async () => undefined);
		const listeners = new Map<string, (...args: Array<unknown>) => void>();
		const room = {
			name: 'guild_1_channel_2',
			disconnect,
			on: (event: string, fn: (...args: Array<unknown>) => void) => listeners.set(event, fn),
			off: (event: string) => listeners.delete(event),
		};
		const unbind = VoiceDropRecorder.bindRoom(room as never);

		notifyVoiceStateSend({
			guild_id: '1',
			channel_id: null,
			connection_id: 'otter-kelp',
			self_mute: true,
			self_deaf: true,
		});
		await room.disconnect();
		expect(disconnect).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5000);

		expect(sendVoiceDropReport).toHaveBeenCalledTimes(1);
		expect(lastReport().triggers.map((t) => t.kind)).toEqual(['gateway-leave', 'room-disconnect-called']);

		unbind();
		expect(room.disconnect).toBe(disconnect);
		expect(listeners.size).toBe(0);
	});
});
