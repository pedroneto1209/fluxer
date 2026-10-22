// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	canUseMusicInCall,
	classifyInput,
	createMusicCommandRunner,
	createMusicSearchInput,
	describeMusicProgress,
	formatMusicTime,
	MUSIC_SEARCH_DEBOUNCE_MS,
	queueMoveIndex,
	queueOverflowLabel,
} from '@app/features/music/MusicPanelStateMachine';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

describe('classifyInput', () => {
	it('classifies spotify, youtube and youtu.be links', () => {
		expect(classifyInput('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toBe('link');
		expect(classifyInput('open.spotify.com/intl-pt/album/4uLU6hMCjMI75M1A2tKUQC')).toBe('link');
		expect(classifyInput('spotify:playlist:4uLU6hMCjMI75M1A2tKUQC')).toBe('link');
		expect(classifyInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('link');
		expect(classifyInput('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('link');
		expect(classifyInput('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('link');
		expect(classifyInput('https://music.youtube.com/playlist?list=PL123')).toBe('link');
		expect(classifyInput('  https://youtu.be/dQw4w9WgXcQ  ')).toBe('link');
	});

	it('classifies plain text as search', () => {
		expect(classifyInput('blinding lights')).toBe('search');
		expect(classifyInput('weeknd')).toBe('search');
		expect(classifyInput('https://example.com/song')).toBe('search');
		expect(classifyInput('youtube.com is a site')).toBe('search');
		expect(classifyInput('notyoutube.com/watch?v=dQw4w9WgXcQ')).toBe('search');
	});

	it('blank is empty', () => {
		expect(classifyInput('')).toBe('empty');
		expect(classifyInput('   \n\t ')).toBe('empty');
	});
});

describe('createMusicSearchInput', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('debounces search', () => {
		const onSearch = vi.fn();
		const input = createMusicSearchInput({onSearch});
		input.change('blin');
		vi.advanceTimersByTime(200);
		input.change('blinding');
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS - 1);
		expect(onSearch).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSearch).toHaveBeenCalledTimes(1);
		expect(onSearch).toHaveBeenCalledWith('blinding');
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS * 2);
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it('does not search links or blank text and cancels a pending search', () => {
		const onSearch = vi.fn();
		const onClear = vi.fn();
		const input = createMusicSearchInput({onSearch, onClear});
		input.change('blinding');
		input.change('https://youtu.be/dQw4w9WgXcQ');
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS);
		expect(onSearch).not.toHaveBeenCalled();
		expect(onClear).toHaveBeenCalledTimes(1);
		input.change('blinding');
		input.change('  ');
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS);
		expect(onSearch).not.toHaveBeenCalled();
		expect(onClear).toHaveBeenCalledTimes(2);
	});

	it('submit searches right away and returns the kind', () => {
		const onSearch = vi.fn();
		const input = createMusicSearchInput({onSearch});
		input.change('blinding');
		expect(input.submit('blinding')).toBe('search');
		expect(onSearch).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS);
		expect(onSearch).toHaveBeenCalledTimes(1);
		expect(input.submit('https://youtu.be/dQw4w9WgXcQ')).toBe('link');
		expect(input.submit('')).toBe('empty');
		expect(onSearch).toHaveBeenCalledTimes(1);
	});

	it('dispose cancels the pending search', () => {
		const onSearch = vi.fn();
		const input = createMusicSearchInput({onSearch});
		input.change('blinding');
		input.dispose();
		vi.advanceTimersByTime(MUSIC_SEARCH_DEBOUNCE_MS);
		expect(onSearch).not.toHaveBeenCalled();
	});
});

describe('queueMoveIndex', () => {
	it('computes the final index for a drop before or after a row', () => {
		// Queue [a, b, c, d]. Drop a after c -> [b, c, a, d].
		expect(queueMoveIndex(0, 2, 'after')).toBe(2);
		// Drop a before c -> [b, a, c, d].
		expect(queueMoveIndex(0, 2, 'before')).toBe(1);
		// Drop d before a -> [d, a, b, c].
		expect(queueMoveIndex(3, 0, 'before')).toBe(0);
		// Drop d after a -> [a, d, b, c].
		expect(queueMoveIndex(3, 0, 'after')).toBe(1);
	});

	it('returns null when nothing moves', () => {
		expect(queueMoveIndex(1, 1, 'before')).toBeNull();
		expect(queueMoveIndex(1, 0, 'after')).toBeNull();
		expect(queueMoveIndex(1, 2, 'before')).toBeNull();
	});
});

describe('progress', () => {
	it('formats times', () => {
		expect(formatMusicTime(0)).toBe('0:00');
		expect(formatMusicTime(61_500)).toBe('1:01');
		expect(formatMusicTime(3_725_000)).toBe('1:02:05');
		expect(formatMusicTime(-5)).toBe('0:00');
	});

	it('describes progress with a known duration', () => {
		expect(describeMusicProgress(30_000, 120_000)).toEqual({elapsed: '0:30', total: '2:00', fraction: 0.25});
		expect(describeMusicProgress(500_000, 120_000).fraction).toBe(1);
	});

	it('duration 0 is unknown: elapsed only, no fraction, no clamp', () => {
		expect(describeMusicProgress(500_000, 0)).toEqual({elapsed: '8:20', total: null, fraction: null});
	});
});

describe('canUseMusicInCall', () => {
	const base = {
		availability: 'available' as const,
		mobileLayout: false,
		connected: {guildId: 'g1', channelId: '1', mesh: false},
	};

	it('allows a desktop guild call on an instance with the service', () => {
		expect(canUseMusicInCall(base)).toBe(true);
		expect(canUseMusicInCall({...base, channelId: '1'})).toBe(true);
	});

	it('hides music in peer-to-peer (mesh) calls', () => {
		expect(canUseMusicInCall({...base, connected: {...base.connected, mesh: true}})).toBe(false);
	});

	it('hides music without the service, outside a guild call, on mobile or for another channel', () => {
		expect(canUseMusicInCall({...base, availability: 'unavailable'})).toBe(false);
		expect(canUseMusicInCall({...base, availability: 'checking'})).toBe(false);
		expect(canUseMusicInCall({...base, connected: null})).toBe(false);
		expect(canUseMusicInCall({...base, connected: {...base.connected, guildId: null}})).toBe(false);
		expect(canUseMusicInCall({...base, mobileLayout: true})).toBe(false);
		expect(canUseMusicInCall({...base, channelId: '2'})).toBe(false);
	});
});

describe('createMusicCommandRunner', () => {
	function deferred<T>() {
		let resolve!: (value: T) => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return {promise, resolve, reject};
	}

	it('ignores a second command while one is in flight (double-click on skip)', async () => {
		const apply = vi.fn();
		const pendingChanges: Array<boolean> = [];
		const runner = createMusicCommandRunner<{revision: number}>({
			apply,
			onError: vi.fn(),
			onPendingChange: (pending) => pendingChanges.push(pending),
		});
		const request = deferred<{revision: number}>();
		const skip = vi.fn(() => request.promise);
		const first = runner.run(skip);
		const second = runner.run(skip);
		expect(runner.pending).toBe(true);
		await expect(second).resolves.toBe(false);
		expect(skip).toHaveBeenCalledTimes(1);
		request.resolve({revision: 2});
		await expect(first).resolves.toBe(true);
		expect(apply).toHaveBeenCalledWith({revision: 2});
		expect(runner.pending).toBe(false);
		expect(pendingChanges).toEqual([true, false]);
		await runner.run(skip);
		expect(skip).toHaveBeenCalledTimes(2);
	});

	it('reports errors, clears the previous error and releases the pending state', async () => {
		const onError = vi.fn();
		const runner = createMusicCommandRunner<{revision: number}>({apply: vi.fn(), onError});
		const failure = new Error('nope');
		await expect(runner.run(() => Promise.reject(failure))).resolves.toBe(false);
		expect(onError).toHaveBeenLastCalledWith(failure);
		await expect(runner.run(async () => null)).resolves.toBe(true);
		expect(onError).toHaveBeenLastCalledWith(null);
		expect(runner.pending).toBe(false);
	});

	it('reset drops the in-flight command: no apply, no error, a new command can run', async () => {
		const apply = vi.fn();
		const onError = vi.fn();
		const pendingChanges: Array<boolean> = [];
		const runner = createMusicCommandRunner<{revision: number}>({
			apply,
			onError,
			onPendingChange: (pending) => pendingChanges.push(pending),
		});
		const stale = deferred<{revision: number}>();
		const first = runner.run(() => stale.promise);
		runner.reset();
		expect(runner.pending).toBe(false);
		expect(onError).toHaveBeenLastCalledWith(null);
		const fresh = deferred<{revision: number}>();
		const second = runner.run(() => fresh.promise);
		expect(runner.pending).toBe(true);
		stale.reject(new Error('old call'));
		await expect(first).resolves.toBe(false);
		// The stale command neither reports its error nor releases the new command's pending state.
		expect(onError).toHaveBeenLastCalledWith(null);
		expect(runner.pending).toBe(true);
		fresh.resolve({revision: 9});
		await expect(second).resolves.toBe(true);
		expect(apply).toHaveBeenCalledTimes(1);
		expect(apply).toHaveBeenCalledWith({revision: 9});
		expect(pendingChanges).toEqual([true, false, true, false]);
	});
});

describe('queueOverflowLabel', () => {
	it('labels the queue items the state message left out', () => {
		expect(queueOverflowLabel(3, 3)).toBeNull();
		expect(queueOverflowLabel(0, 0)).toBeNull();
		expect(queueOverflowLabel(40, 2)).toBeNull();
		expect(queueOverflowLabel(40, 41)).toBe('+1 música na fila');
		expect(queueOverflowLabel(40, 125)).toBe('+85 músicas na fila');
	});
});
