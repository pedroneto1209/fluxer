// SPDX-License-Identifier: AGPL-3.0-or-later

import {MusicVolumeState, type MusicVolumeStorage} from '@app/features/music/MusicVolume';
import {composeVoiceVolumeGain} from '@app/features/voice/utils/VoiceVolumeUtils';
import type {Room} from 'livekit-client';
import {describe, expect, it, vi} from 'vitest';

function memoryStorage(): MusicVolumeStorage & {data: Map<string, string>} {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => {
			data.set(key, value);
		},
	};
}

function throwingStorage(): MusicVolumeStorage {
	return {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {
			throw new Error('denied');
		},
	};
}

function fakeParticipant(identity: string) {
	const track = {setVolume: vi.fn()};
	const publication = {audioTrack: track};
	return {
		identity,
		track,
		audioTrackPublications: new Map([['TR_1', publication]]),
	};
}

function fakeRoom(...participants: Array<ReturnType<typeof fakeParticipant>>): Room {
	return {
		remoteParticipants: new Map(participants.map((participant) => [participant.identity, participant])),
	} as unknown as Room;
}

describe('MusicVolume', () => {
	it('defaults to half volume, not muted', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		expect(state.volume).toBe(0.5);
		expect(state.muted).toBe(false);
	});

	it('MusicVolume persists and restores', () => {
		const storage = memoryStorage();
		const first = new MusicVolumeState(() => storage);
		first.setVolume(0.8);
		first.toggleMuted();
		const second = new MusicVolumeState(() => storage);
		expect(second.volume).toBe(0.8);
		expect(second.muted).toBe(true);
	});

	it('clamps the volume to 0..1', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		state.setVolume(3);
		expect(state.volume).toBe(1);
		state.setVolume(-1);
		expect(state.volume).toBe(0);
	});

	it('ignores corrupt stored values', () => {
		const storage = memoryStorage();
		storage.data.set('fluxer.music.volume', '{not json');
		const state = new MusicVolumeState(() => storage);
		expect(state.volume).toBe(0.5);
		expect(state.muted).toBe(false);
	});

	it('MusicVolume survives localStorage throwing', () => {
		expect(() => new MusicVolumeState(throwingStorage)).not.toThrow();
		const state = new MusicVolumeState(throwingStorage);
		expect(() => state.setVolume(0.3)).not.toThrow();
		expect(() => state.toggleMuted()).not.toThrow();
		expect(state.volume).toBe(0.3);
		expect(state.muted).toBe(true);
		const noStorage = new MusicVolumeState(() => {
			throw new Error('no storage');
		});
		expect(noStorage.volume).toBe(0.5);
		expect(() => noStorage.setVolume(0.2)).not.toThrow();
	});

	it('applyToRoom sets volume only on music participants', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		state.setVolume(0.7);
		const user = fakeParticipant('user_1_conn');
		const music = fakeParticipant('music_42');
		state.applyToRoom(fakeRoom(user, music));
		expect(music.track.setVolume).toHaveBeenCalledWith(0.7);
		expect(user.track.setVolume).not.toHaveBeenCalled();
	});

	it('muted applies zero', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		state.setVolume(0.7);
		state.toggleMuted();
		const music = fakeParticipant('music_42');
		state.applyToRoom(fakeRoom(music));
		expect(music.track.setVolume).toHaveBeenCalledWith(0);
	});

	it('moving the volume slider while muted unmutes and applies the new volume', () => {
		const storage = memoryStorage();
		const state = new MusicVolumeState(() => storage);
		state.toggleMuted();
		state.setVolumeUnmuted(0.6);
		expect(state.muted).toBe(false);
		expect(state.volume).toBe(0.6);
		const music = fakeParticipant('music_42');
		state.applyToRoom(fakeRoom(music));
		expect(music.track.setVolume).toHaveBeenCalledWith(0.6);
		expect(new MusicVolumeState(() => storage).muted).toBe(false);
	});

	it('moving the volume slider while unmuted keeps it unmuted', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		state.setVolumeUnmuted(0.3);
		expect(state.muted).toBe(false);
		expect(state.volume).toBe(0.3);
	});

	it('applyToRoom tolerates a null room and unsubscribed publications', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		expect(() => state.applyToRoom(null)).not.toThrow();
		const room = {
			remoteParticipants: new Map([['music_1', {identity: 'music_1', audioTrackPublications: new Map([['TR', {}]])}]]),
		} as unknown as Room;
		expect(() => state.applyToRoom(room)).not.toThrow();
	});

	it('scales with the global output volume like other voices', () => {
		const state = new MusicVolumeState(() => memoryStorage());
		state.setVolume(0.5);
		const music = fakeParticipant('music_42');
		state.applyToRoom(fakeRoom(music), 100);
		expect(music.track.setVolume).toHaveBeenLastCalledWith(0.5);
		state.applyToRoom(fakeRoom(music), 50);
		expect(music.track.setVolume).toHaveBeenLastCalledWith(0.5 * composeVoiceVolumeGain(50));
		expect(composeVoiceVolumeGain(50)).toBeLessThan(1);
		state.applyToRoom(fakeRoom(music), 0);
		expect(music.track.setVolume).toHaveBeenLastCalledWith(0);
		state.applyToRoom(fakeRoom(music), 200);
		expect(music.track.setVolume).toHaveBeenLastCalledWith(0.5 * composeVoiceVolumeGain(200));
	});
});
