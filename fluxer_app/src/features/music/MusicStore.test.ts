// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicApiError, type MusicSessionState, parseSessionState} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: null}}));

function makeState(overrides: Partial<MusicSessionState> = {}): MusicSessionState {
	return {
		guildId: 'g1',
		channelId: 'c1',
		spotifyAccount: null,
		nowPlaying: {
			id: 'q1',
			source: 'youtube',
			sourceId: 'abc',
			title: 'Song',
			artist: 'Artist',
			durationMs: 200_000,
			artworkUrl: null,
			url: 'https://example.com/abc',
			addedBy: null,
			recommended: false,
		},
		paused: false,
		positionMs: 10_000,
		positionAt: 1_000_000,
		queue: [],
		queueLength: 0,
		notice: null,
		spotifyRadio: false,
		revision: 5,
		...overrides,
	};
}

describe('MusicStore', () => {
	beforeEach(() => {
		MusicStore.clearChannel('c1');
		// The fixtures measure positions at t=1_000_000; keep the local clock there.
		vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('applyState ignores older revisions', () => {
		MusicStore.applyState(makeState({revision: 5}));
		MusicStore.applyState(makeState({revision: 4, paused: true}));
		expect(MusicStore.sessionByChannel.get('c1')?.paused).toBe(false);
		MusicStore.applyState(makeState({revision: 6, paused: true}));
		expect(MusicStore.sessionByChannel.get('c1')?.paused).toBe(true);
	});

	it('a shorter queue of the same revision does not replace the longer one', () => {
		const base = makeState();
		const item = base.nowPlaying!;
		const full = Array.from({length: 60}, (_, index) => ({...item, id: `q${index}`}));
		MusicStore.applyState(makeState({revision: 7, queue: full, queueLength: 60}));
		MusicStore.applyState(makeState({revision: 7, queue: full.slice(0, 40), queueLength: 60}));
		expect(MusicStore.sessionByChannel.get('c1')?.queue).toHaveLength(60);
		MusicStore.applyState(makeState({revision: 8, queue: full.slice(1, 41), queueLength: 59}));
		expect(MusicStore.sessionByChannel.get('c1')?.queue).toHaveLength(40);
		expect(MusicStore.sessionByChannel.get('c1')?.queueLength).toBe(59);
	});

	it('currentPositionMs extrapolates while playing', () => {
		MusicStore.applyState(makeState());
		expect(MusicStore.currentPositionMs('c1', 1_005_000)).toBe(15_000);
	});

	it('currentPositionMs freezes while paused', () => {
		MusicStore.applyState(makeState({paused: true}));
		expect(MusicStore.currentPositionMs('c1', 1_500_000)).toBe(10_000);
	});

	it('currentPositionMs clamps to duration', () => {
		MusicStore.applyState(makeState());
		expect(MusicStore.currentPositionMs('c1', 9_000_000)).toBe(200_000);
	});

	it('currentPositionMs does not clamp when duration is unknown', () => {
		const base = makeState();
		MusicStore.applyState({...base, nowPlaying: base.nowPlaying && {...base.nowPlaying, durationMs: 0}});
		expect(MusicStore.currentPositionMs('c1', 1_300_000)).toBe(310_000);
	});

	it('runs a command when the balloon holds runCommand detached', async () => {
		const run = MusicStore.runCommand;
		await expect(run(async () => null)).resolves.toBe(true);
	});

	it('runs one command at a time across balloon remounts and keeps its error', async () => {
		let resolve!: (state: MusicSessionState) => void;
		const skip = vi.fn(() => new Promise<MusicSessionState>((res) => (resolve = res)));
		const first = MusicStore.runCommand(skip);
		expect(MusicStore.commandPending).toBe(true);
		await expect(MusicStore.runCommand(skip)).resolves.toBe(false);
		expect(skip).toHaveBeenCalledTimes(1);
		resolve(makeState({channelId: 'run1', revision: 4}));
		await expect(first).resolves.toBe(true);
		expect(MusicStore.commandPending).toBe(false);
		expect(MusicStore.sessionByChannel.get('run1')?.revision).toBe(4);
		await MusicStore.runCommand(() => Promise.reject(new MusicApiError(409, 'QUEUE_FULL', 'full')));
		expect(MusicStore.commandError).toBe('A fila está cheia.');
		await MusicStore.runCommand(async () => null);
		expect(MusicStore.commandError).toBeNull();
	});

	it('rebases positionAt to local time when the server clock is skewed', () => {
		const now = Date.now();
		MusicStore.applyState(makeState({channelId: 'skew', positionMs: 30_000, positionAt: now + 60_000}));
		const skewed = MusicStore.sessionByChannel.get('skew');
		expect(skewed?.positionMs).toBe(30_000);
		expect(skewed?.positionAt).toBe(now);

		MusicStore.applyState(makeState({channelId: 'close', positionAt: now - 2_000}));
		expect(MusicStore.sessionByChannel.get('close')?.positionAt).toBe(now - 2_000);
	});

	it('clears the command error when the balloon closes', async () => {
		await MusicStore.runCommand(() => Promise.reject(new MusicApiError(409, 'QUEUE_FULL', 'full')));
		expect(MusicStore.commandError).not.toBeNull();
		MusicStore.clearCommandError();
		expect(MusicStore.commandError).toBeNull();
	});

	it('forgets the command state when the call is left or the session ends', async () => {
		for (const reset of [() => MusicStore.handleCallLeft(), () => MusicStore.handleLogout()]) {
			await MusicStore.runCommand(() => Promise.reject(new MusicApiError(409, 'QUEUE_FULL', 'full')));
			const hanging = MusicStore.runCommand(() => new Promise<MusicSessionState>(() => {}));
			expect(MusicStore.commandPending).toBe(true);
			reset();
			expect(MusicStore.commandPending).toBe(false);
			expect(MusicStore.commandError).toBeNull();
			void hanging;
		}
	});

	it('logout clears the community sessions', () => {
		MusicStore.guildSessions.set('g1', [
			{channelId: 'c1', nowPlaying: null, paused: false, positionMs: 0, positionAt: 0, upNext: []},
		]);
		MusicStore.handleLogout();
		expect(MusicStore.guildSessions.size).toBe(0);
	});

	it('currentPositionMs is 0 without a session', () => {
		expect(MusicStore.currentPositionMs('nope')).toBe(0);
	});

	it('describeMusicError maps known codes', () => {
		expect(MusicStore.describeMusicError(new MusicApiError(403, 'NOT_IN_CHANNEL', 'x'))).toBe(
			'Entre no canal de voz para controlar a música.',
		);
		expect(MusicStore.describeMusicError(new MusicApiError(502, 'LIVEKIT_UNREACHABLE', 'x'))).not.toBe('x');
		expect(MusicStore.describeMusicError(new MusicApiError(418, 'WEIRD', 'raw message'))).toBe('raw message');
	});
});

describe('MusicStore.checkAvailability', () => {
	const healthy = () => new Response(JSON.stringify({service: 'fluxer-music', version: 1}), {status: 200});
	const html = () => new Response('<html></html>', {status: 200, headers: {'Content-Type': 'text/html'}});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("re-check keeps 'available' (one failed probe does not hide the feature)", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => healthy()),
		);
		await MusicStore.checkAvailability(true);
		expect(MusicStore.availability).toBe('available');

		let release!: () => void;
		const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = () => resolve(html()))));
		vi.stubGlobal('fetch', fetchMock);
		const recheck = MusicStore.checkAvailability(true);
		// Never flips to 'checking' once known, so the UI does not unmount mid re-check.
		expect(MusicStore.availability).toBe('available');
		release();
		await recheck;
		expect(MusicStore.availability).toBe('available');

		// A second consecutive failure downgrades.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => html()),
		);
		await MusicStore.checkAvailability(true);
		expect(MusicStore.availability).toBe('unavailable');

		// A success brings it back and resets the failure count.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => healthy()),
		);
		await MusicStore.checkAvailability(true);
		expect(MusicStore.availability).toBe('available');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => html()),
		);
		await MusicStore.checkAvailability(true);
		expect(MusicStore.availability).toBe('available');
	});

	it('concurrent callers await the same check', async () => {
		let release!: () => void;
		const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = () => resolve(healthy()))));
		vi.stubGlobal('fetch', fetchMock);
		const first = MusicStore.checkAvailability(true);
		let secondDone = false;
		const second = MusicStore.checkAvailability(true).then(() => {
			secondDone = true;
		});
		await Promise.resolve();
		expect(secondDone).toBe(false);
		release();
		await Promise.all([first, second]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(MusicStore.availability).toBe('available');
	});
});

describe('parseSessionState', () => {
	it('rejects malformed payloads', () => {
		expect(parseSessionState(null)).toBeNull();
		expect(parseSessionState('x')).toBeNull();
		expect(parseSessionState({})).toBeNull();
		expect(parseSessionState({channel_id: 'c', guild_id: 'g', revision: 'x', queue: []})).toBeNull();
		expect(parseSessionState({channel_id: 'c', guild_id: 'g', revision: 1, queue: 'no'})).toBeNull();
	});

	it('maps snake_case', () => {
		const state = parseSessionState({
			guild_id: 'g1',
			channel_id: 'c1',
			spotify_account: {user_id: 'u1', display_name: 'Ana'},
			now_playing: {
				id: 'q1',
				source: 'spotify',
				source_id: 's1',
				title: 'T',
				artist: 'A',
				duration_ms: 0,
				artwork_url: null,
				url: 'https://x',
				added_by: 'u1',
				recommended: true,
			},
			paused: true,
			position_ms: 5,
			position_at: 10,
			queue: [],
			notice: 'hi',
			revision: 3,
		});
		expect(state?.guildId).toBe('g1');
		expect(state?.spotifyAccount).toEqual({userId: 'u1', displayName: 'Ana'});
		expect(state?.nowPlaying?.sourceId).toBe('s1');
		expect(state?.nowPlaying?.addedBy).toBe('u1');
		expect(state?.positionAt).toBe(10);
		expect(state?.revision).toBe(3);
	});
});
