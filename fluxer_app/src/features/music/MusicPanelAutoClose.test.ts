// SPDX-License-Identifier: AGPL-3.0-or-later

import {installMusicPanelAutoClose, MUSIC_CALL_END_GRACE_MS} from '@app/features/music/MusicPanelAutoClose';
import {observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

function setup(initial: string | null = '1') {
	const channelId = observable.box<string | null>(initial);
	const onCallLeft = vi.fn();
	const dispose = installMusicPanelAutoClose(() => channelId.get(), onCallLeft);
	const set = (value: string | null) => runInAction(() => channelId.set(value));
	return {set, onCallLeft, dispose};
}

describe('installMusicPanelAutoClose', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('closes right away when the call moves to another channel', () => {
		const {set, onCallLeft, dispose} = setup();
		expect(onCallLeft).not.toHaveBeenCalled();
		set('2');
		expect(onCallLeft).toHaveBeenCalledTimes(1);
		set('3');
		expect(onCallLeft).toHaveBeenCalledTimes(2);
		dispose();
		set('4');
		expect(onCallLeft).toHaveBeenCalledTimes(2);
	});

	it('closes when the call stays gone for the grace period', () => {
		const {set, onCallLeft} = setup();
		set(null);
		vi.advanceTimersByTime(MUSIC_CALL_END_GRACE_MS - 1);
		expect(onCallLeft).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onCallLeft).toHaveBeenCalledTimes(1);
	});

	it('keeps the panel across a transient null during a reconnect to the same channel', () => {
		const {set, onCallLeft} = setup();
		set(null);
		vi.advanceTimersByTime(1_000);
		set('1');
		vi.advanceTimersByTime(MUSIC_CALL_END_GRACE_MS * 2);
		expect(onCallLeft).not.toHaveBeenCalled();
	});

	it('closes once when the call comes back in a different channel after a null', () => {
		const {set, onCallLeft} = setup();
		set(null);
		set('2');
		expect(onCallLeft).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(MUSIC_CALL_END_GRACE_MS * 2);
		expect(onCallLeft).toHaveBeenCalledTimes(1);
	});

	it('dispose cancels a pending close', () => {
		const {set, onCallLeft, dispose} = setup();
		set(null);
		dispose();
		vi.advanceTimersByTime(MUSIC_CALL_END_GRACE_MS * 2);
		expect(onCallLeft).not.toHaveBeenCalled();
	});

	it('does nothing when installed outside a call', () => {
		const {set, onCallLeft} = setup(null);
		vi.advanceTimersByTime(MUSIC_CALL_END_GRACE_MS * 2);
		set('1');
		expect(onCallLeft).not.toHaveBeenCalled();
	});
});
