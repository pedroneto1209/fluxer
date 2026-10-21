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
});
