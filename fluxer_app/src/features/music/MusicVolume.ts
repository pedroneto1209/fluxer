// SPDX-License-Identifier: AGPL-3.0-or-later

// Local playback volume of the channel music participant. ParticipantVolume only
// handles `user_*` identities, so the music participant gets its own control. Like
// every other voice it is also scaled by the user's global output volume.

import {isMusicIdentity} from '@app/features/music/MusicIdentity';
import {clampVoiceTrackTotalGain, composeVoiceVolumeGain} from '@app/features/voice/utils/VoiceVolumeUtils';
import type {Room} from 'livekit-client';
import {makeAutoObservable} from 'mobx';

const STORAGE_KEY = 'fluxer.music.volume';
const DEFAULT_VOLUME = 0.5;

export interface MusicVolumeStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

function defaultStorage(): MusicVolumeStorage | null {
	return typeof window === 'undefined' ? null : window.localStorage;
}

function clampVolume(volume: number): number {
	if (!Number.isFinite(volume)) return DEFAULT_VOLUME;
	return Math.min(1, Math.max(0, volume));
}

export class MusicVolumeState {
	volume = DEFAULT_VOLUME;
	muted = false;
	private readonly getStorage: () => MusicVolumeStorage | null;

	constructor(getStorage: () => MusicVolumeStorage | null = defaultStorage) {
		this.getStorage = getStorage;
		this.restore();
		makeAutoObservable<this, 'getStorage'>(this, {getStorage: false, applyToRoom: false}, {autoBind: true});
	}

	setVolume(volume: number): void {
		this.volume = clampVolume(volume);
		this.persist();
	}

	toggleMuted(): void {
		this.muted = !this.muted;
		this.persist();
	}

	/** `outputVolumePercent` is VoiceSettings' output volume (0..200, 100 = unity). */
	applyToRoom(room: Room | null, outputVolumePercent = 100): void {
		if (!room) return;
		const gain = this.muted ? 0 : clampVoiceTrackTotalGain(this.volume * composeVoiceVolumeGain(outputVolumePercent));
		room.remoteParticipants.forEach((participant) => {
			if (!isMusicIdentity(participant.identity)) return;
			participant.audioTrackPublications.forEach((publication) => {
				const track = publication.audioTrack;
				if (track && 'setVolume' in track) track.setVolume(gain);
			});
		});
	}

	private restore(): void {
		try {
			const raw = this.getStorage()?.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as {volume?: unknown; muted?: unknown};
			if (typeof parsed.volume === 'number') this.volume = clampVolume(parsed.volume);
			if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
		} catch {
			// Corrupt value or storage unavailable: keep the defaults.
		}
	}

	private persist(): void {
		try {
			this.getStorage()?.setItem(STORAGE_KEY, JSON.stringify({volume: this.volume, muted: this.muted}));
		} catch {
			// Storage unavailable (private mode, quota): the value still applies for this session.
		}
	}
}

export default new MusicVolumeState();
