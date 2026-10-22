// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicGuildSessionsPoller} from '@app/features/music/MusicGuildSessionsPoller';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function setup(options: {available?: boolean; visible?: boolean} = {}) {
	const state = {available: options.available ?? true, visible: options.visible ?? true};
	const refresh = vi.fn(async (_guildId: string) => {});
	const poller = new MusicGuildSessionsPoller({
		refresh,
		ensureAvailable: async () => state.available,
		isVisible: () => state.visible,
	});
	return {state, refresh, poller};
}

describe('MusicGuildSessionsPoller', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('polls every 15s while active', async () => {
		const {refresh, poller} = setup();
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(refresh).toHaveBeenCalledTimes(4);
		expect(refresh).toHaveBeenLastCalledWith('g1');
		poller.stop();
	});

	it('stops when guild changes', async () => {
		const {refresh, poller} = setup();
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(0);
		poller.start('g2');
		await vi.advanceTimersByTimeAsync(15_000);
		const guilds = refresh.mock.calls.map((call) => call[0]);
		expect(guilds).toEqual(['g1', 'g2', 'g2']);
		poller.stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(refresh).toHaveBeenCalledTimes(3);
	});

	it('pauses while document hidden', async () => {
		const {state, refresh, poller} = setup();
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(0);
		state.visible = false;
		await vi.advanceTimersByTimeAsync(45_000);
		expect(refresh).toHaveBeenCalledTimes(1);
		state.visible = true;
		poller.handleVisibilityChange();
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(2);
		poller.stop();
	});

	it('does nothing when service unavailable', async () => {
		const {refresh, poller} = setup({available: false});
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(45_000);
		expect(refresh).not.toHaveBeenCalled();
		poller.stop();
	});

	it('skips a refocus poll right after a tick', async () => {
		const {state, refresh, poller} = setup();
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(0);
		state.visible = false;
		await vi.advanceTimersByTimeAsync(1_000);
		state.visible = true;
		poller.handleVisibilityChange();
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		// Far enough from the last poll: the refocus polls.
		await vi.advanceTimersByTimeAsync(12_500);
		poller.handleVisibilityChange();
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(2);
		// The tick 1.5 s after that refocus poll is skipped too.
		await vi.advanceTimersByTimeAsync(1_500);
		expect(refresh).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(refresh).toHaveBeenCalledTimes(3);
		poller.stop();
	});

	it('does not start a second poll while one is in flight', async () => {
		let release!: () => void;
		const refresh = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
		const poller = new MusicGuildSessionsPoller({
			refresh,
			ensureAvailable: async () => true,
			isVisible: () => true,
			intervalMs: 1_000,
		});
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(5_000);
		poller.handleVisibilityChange();
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh).toHaveBeenCalledTimes(1);
		release();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(refresh).toHaveBeenCalledTimes(2);
		poller.stop();
	});

	it('polls the new guild right away even just after a poll of the old one', async () => {
		const {refresh, poller} = setup();
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(100);
		poller.start('g2');
		await vi.advanceTimersByTimeAsync(0);
		expect(refresh.mock.calls.map((call) => call[0])).toEqual(['g1', 'g2']);
		poller.stop();
	});

	it('drops the guild list when the service turns unavailable', async () => {
		const state = {available: true};
		const onUnavailable = vi.fn();
		const refresh = vi.fn(async (_guildId: string) => {});
		const gated = new MusicGuildSessionsPoller({
			refresh,
			ensureAvailable: async () => state.available,
			isVisible: () => true,
			onUnavailable,
		});
		gated.start('g1');
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnavailable).not.toHaveBeenCalled();
		state.available = false;
		await vi.advanceTimersByTimeAsync(15_000);
		expect(onUnavailable).toHaveBeenCalledWith('g1');
		expect(refresh).toHaveBeenCalledTimes(1);
		gated.stop();
	});

	it('does not stay stuck behind a poll that never settles', async () => {
		const refresh = vi.fn(() => new Promise<void>(() => {}));
		const poller = new MusicGuildSessionsPoller({refresh, ensureAvailable: async () => true, isVisible: () => true});
		poller.start('g1');
		await vi.advanceTimersByTimeAsync(15_000);
		expect(refresh).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(15_000);
		// 30 s after it started, the hung poll no longer blocks the next one.
		expect(refresh).toHaveBeenCalledTimes(2);
		poller.stop();
	});
});
