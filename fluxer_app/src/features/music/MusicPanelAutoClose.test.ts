// SPDX-License-Identifier: AGPL-3.0-or-later

import {installMusicPanelAutoClose} from '@app/features/music/MusicPanelAutoClose';
import {observable, runInAction} from 'mobx';
import {describe, expect, it, vi} from 'vitest';

describe('installMusicPanelAutoClose', () => {
	it('closes the panel when the call ends or moves to another channel', () => {
		const channelId = observable.box<string | null>('1');
		const closePanel = vi.fn();
		const dispose = installMusicPanelAutoClose(() => channelId.get(), closePanel);
		expect(closePanel).not.toHaveBeenCalled();
		runInAction(() => channelId.set(null));
		expect(closePanel).toHaveBeenCalledTimes(1);
		runInAction(() => channelId.set('2'));
		runInAction(() => channelId.set('3'));
		expect(closePanel).toHaveBeenCalledTimes(3);
		dispose();
		runInAction(() => channelId.set(null));
		expect(closePanel).toHaveBeenCalledTimes(3);
	});

	it('keeps the panel open across a reconnect to the same channel', () => {
		const channelId = observable.box<string | null>('1');
		const closePanel = vi.fn();
		installMusicPanelAutoClose(() => channelId.get(), closePanel);
		runInAction(() => channelId.set('1'));
		expect(closePanel).not.toHaveBeenCalled();
	});
});
