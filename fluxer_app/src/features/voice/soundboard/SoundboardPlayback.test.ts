// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

class FakeNode {
	readonly targets: Array<unknown> = [];
	connect<T>(target: T): T {
		this.targets.push(target);
		return target;
	}
	disconnect = vi.fn(() => {
		this.targets.length = 0;
	});
}

class FakeConstantSource extends FakeNode {
	readonly offset = {value: 1};
	start = vi.fn();
	stop = vi.fn();
}

class FakeBufferSource extends FakeNode {
	buffer: unknown = null;
	onended: (() => void) | null = null;
	start = vi.fn();
	stop = vi.fn();
}

class FakeDestination extends FakeNode {
	readonly mediaTrack = {readyState: 'live'};
	readonly stream = {getAudioTracks: () => [this.mediaTrack]};
}

const created = {silences: [] as Array<FakeConstantSource>, sources: [] as Array<FakeBufferSource>};

class FakeAudioContext {
	state = 'running';
	readonly destination = new FakeNode();
	createMediaStreamDestination = () => new FakeDestination();
	createConstantSource = () => {
		const node = new FakeConstantSource();
		created.silences.push(node);
		return node;
	};
	createBufferSource = () => {
		const node = new FakeBufferSource();
		created.sources.push(node);
		return node;
	};
	createGain = () => Object.assign(new FakeNode(), {gain: {value: 1}});
	decodeAudioData = async () => ({duration: 1});
	resume = async () => undefined;
}

const publications = new Map<string, {track: unknown}>();
const room = {
	state: 'connected',
	localParticipant: {
		audioTrackPublications: publications,
		publishTrack: vi.fn(async (track: unknown) => {
			publications.set('TR_soundboard', {track});
		}),
		unpublishTrack: vi.fn(async () => {
			publications.clear();
		}),
	},
};

vi.mock('@app/features/voice/engine/MediaEngineFacade', () => ({default: {room, connected: true}}));
vi.mock('@app/features/voice/engine/VoiceEffectiveAudioState', () => ({
	getEffectiveAudioState: () => ({effectiveDeaf: false}),
}));
vi.mock('@app/features/voice/engine/VoiceTrackPublicationUtils', () => ({SOUNDBOARD_TRACK_NAME: 'fluxer-soundboard'}));
vi.mock('@app/features/voice/state/VoiceSettings', () => ({default: {outputDeviceId: 'default'}}));
vi.mock('livekit-client', () => ({
	AudioPresets: {music: {maxBitrate: 48_000}},
	ConnectionState: {Disconnected: 'disconnected'},
	Track: {Source: {Microphone: 'microphone'}},
	LocalAudioTrack: class {
		constructor(readonly mediaStreamTrack: unknown) {}
		stop = vi.fn();
	},
}));

const {default: SoundboardPlayback} = await import('@app/features/voice/soundboard/SoundboardPlayback');

const loadBytes = async () => new ArrayBuffer(8);

describe('SoundboardPlayback', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('AudioContext', FakeAudioContext);
		created.silences.length = 0;
		created.sources.length = 0;
		publications.clear();
		room.localParticipant.publishTrack.mockClear();
		room.localParticipant.unpublishTrack.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('keeps the published track fed with silence between clips, until it is unpublished', async () => {
		await SoundboardPlayback.play('clip-a', loadBytes, 1);

		expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
		expect(created.silences).toHaveLength(1);
		const silence = created.silences[0];
		const clip = created.sources[0];
		if (!silence || !clip) throw new Error('expected a silence source and a clip');
		expect(silence.offset.value).toBe(0);
		expect(silence.start).toHaveBeenCalledTimes(1);
		const destination = silence.targets[0];
		expect(destination).toBeInstanceOf(FakeDestination);

		// The clip ends: the destination is still fed by the silence, so the track
		// keeps sending packets and the server never sees a dry, unmuted track.
		clip.onended?.();
		expect(clip.disconnect).toHaveBeenCalled();
		expect(silence.targets).toEqual([destination]);
		expect(silence.stop).not.toHaveBeenCalled();

		// A second clip reuses the same publication and the same silence source.
		await SoundboardPlayback.play('clip-b', loadBytes, 1);
		expect(room.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
		expect(created.silences).toHaveLength(1);
		created.sources[1]?.onended?.();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(room.localParticipant.unpublishTrack).toHaveBeenCalledTimes(1);
		expect(silence.stop).toHaveBeenCalledTimes(1);
		expect(silence.disconnect).toHaveBeenCalled();
	});

	it('stops the silence when publishing fails', async () => {
		room.localParticipant.publishTrack.mockRejectedValueOnce(new Error('negotiation failed'));

		await expect(SoundboardPlayback.play('clip-c', loadBytes, 1)).rejects.toThrow('negotiation failed');

		const silence = created.silences[0];
		if (!silence) throw new Error('expected a silence source');
		expect(silence.stop).toHaveBeenCalledTimes(1);
		expect(silence.disconnect).toHaveBeenCalled();
	});
});
