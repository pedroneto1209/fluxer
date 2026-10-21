// SPDX-License-Identifier: AGPL-3.0-or-later

// Plays soundboard clips into the current voice call.
//
// A clip is mixed into a dedicated audio track (named SOUNDBOARD_TRACK_NAME) that is
// published next to the user's microphone, so everyone in the call hears it on any
// client, and mute or push-to-talk on the microphone does not cut it. The same clip
// is also played locally so the sender hears what they triggered.

import {Logger} from '@app/features/platform/utils/AppLogger';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {getEffectiveAudioState} from '@app/features/voice/engine/VoiceEffectiveAudioState';
import {SOUNDBOARD_TRACK_NAME} from '@app/features/voice/engine/VoiceTrackPublicationUtils';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {AudioPresets, ConnectionState, LocalAudioTrack, type Room, Track} from 'livekit-client';

const logger = new Logger('SoundboardPlayback');

const IDLE_UNPUBLISH_MS = 60_000;
const MAX_CACHED_BUFFERS = 64;

type SinkableAudioContext = AudioContext & {setSinkId?: (sinkId: string) => Promise<void>};

export class SoundboardNotInVoiceError extends Error {
	constructor() {
		super('Join a voice channel to play sounds.');
		this.name = 'SoundboardNotInVoiceError';
	}
}

class SoundboardPlayback {
	private context: SinkableAudioContext | null = null;
	private appliedSinkId: string | null = null;
	private destination: MediaStreamAudioDestinationNode | null = null;
	private track: LocalAudioTrack | null = null;
	private publishedRoom: Room | null = null;
	private publishing: Promise<void> | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly buffers = new Map<string, Promise<AudioBuffer>>();
	private readonly playing = new Set<AudioBufferSourceNode>();

	async play(key: string, loadBytes: () => Promise<ArrayBuffer>, volume: number): Promise<void> {
		const room = MediaEngine.room;
		if (!room || !MediaEngine.connected) {
			throw new SoundboardNotInVoiceError();
		}
		const context = this.ensureContext();
		if (context.state === 'suspended') {
			await context.resume();
		}
		const buffer = await this.loadBuffer(key, loadBytes);
		await this.ensurePublished(room, context);
		const destination = this.destination;
		if (!destination) {
			throw new Error('The soundboard track is not ready.');
		}

		const source = context.createBufferSource();
		source.buffer = buffer;
		const sendGain = context.createGain();
		sendGain.gain.value = clampVolume(volume);
		source.connect(sendGain).connect(destination);
		if (!getEffectiveAudioState().effectiveDeaf) {
			const monitorGain = context.createGain();
			monitorGain.gain.value = clampVolume(volume);
			source.connect(monitorGain).connect(context.destination);
		}
		this.playing.add(source);
		source.onended = () => {
			this.playing.delete(source);
			try {
				source.disconnect();
			} catch {}
			this.armIdleUnpublish();
		};
		this.clearIdleTimer();
		source.start();
	}

	stopAll(): void {
		for (const source of Array.from(this.playing)) {
			try {
				source.stop();
			} catch {}
		}
	}

	// Decoding is cheap to repeat but network fetches are not; keep recent clips.
	private loadBuffer(key: string, loadBytes: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
		const cached = this.buffers.get(key);
		if (cached) {
			this.buffers.delete(key);
			this.buffers.set(key, cached);
			return cached;
		}
		const context = this.ensureContext();
		const loading = loadBytes().then((bytes) => context.decodeAudioData(bytes));
		loading.catch(() => {
			if (this.buffers.get(key) === loading) this.buffers.delete(key);
		});
		this.buffers.set(key, loading);
		while (this.buffers.size > MAX_CACHED_BUFFERS) {
			const oldest = this.buffers.keys().next().value;
			if (oldest === undefined) break;
			this.buffers.delete(oldest);
		}
		return loading;
	}

	forget(key: string): void {
		this.buffers.delete(key);
	}

	private ensureContext(): SinkableAudioContext {
		if (!this.context || this.context.state === 'closed') {
			this.context = new AudioContext({latencyHint: 'interactive'}) as SinkableAudioContext;
			this.appliedSinkId = null;
		}
		this.applyOutputDevice(this.context);
		return this.context;
	}

	// Follow the output device chosen in Fluxer's voice settings for the local copy.
	private applyOutputDevice(context: SinkableAudioContext): void {
		const sinkId = VoiceSettings.outputDeviceId === 'default' ? '' : VoiceSettings.outputDeviceId;
		if (typeof context.setSinkId !== 'function' || sinkId === this.appliedSinkId) return;
		this.appliedSinkId = sinkId;
		context.setSinkId(sinkId).catch((error: unknown) => {
			logger.warn('Could not route soundboard playback to the selected output device', {error});
		});
	}

	private isPublishedTo(room: Room): boolean {
		if (this.publishedRoom !== room || !this.track) return false;
		if (this.track.mediaStreamTrack.readyState !== 'live') return false;
		for (const publication of room.localParticipant.audioTrackPublications.values()) {
			if (publication.track === this.track) return true;
		}
		return false;
	}

	private async ensurePublished(room: Room, context: AudioContext): Promise<void> {
		if (this.isPublishedTo(room)) return;
		if (this.publishing) {
			await this.publishing;
			if (this.isPublishedTo(room)) return;
		}
		this.publishing = (async () => {
			await this.unpublish();
			// A fresh destination per publication: LiveKit stops the published
			// MediaStreamTrack when the publication or the room goes away.
			const destination = context.createMediaStreamDestination();
			const mediaTrack = destination.stream.getAudioTracks()[0];
			if (!mediaTrack) {
				throw new Error('Could not create the soundboard audio track.');
			}
			const track = new LocalAudioTrack(mediaTrack, undefined, true);
			await room.localParticipant.publishTrack(track, {
				name: SOUNDBOARD_TRACK_NAME,
				source: Track.Source.Microphone,
				audioPreset: AudioPresets.music,
				red: false,
			});
			this.destination = destination;
			this.track = track;
			this.publishedRoom = room;
			logger.info('Published the soundboard track');
		})();
		try {
			await this.publishing;
		} finally {
			this.publishing = null;
		}
	}

	private async unpublish(): Promise<void> {
		this.clearIdleTimer();
		const track = this.track;
		const room = this.publishedRoom;
		this.track = null;
		this.publishedRoom = null;
		this.destination = null;
		if (!track) return;
		try {
			if (room && room.state !== ConnectionState.Disconnected) {
				await room.localParticipant.unpublishTrack(track, true);
			} else {
				track.stop();
			}
		} catch (error) {
			logger.debug('Soundboard track was already gone', {error});
			track.stop();
		}
	}

	private armIdleUnpublish(): void {
		if (this.playing.size > 0) return;
		this.clearIdleTimer();
		this.idleTimer = setTimeout(() => {
			this.idleTimer = null;
			if (this.playing.size > 0) return;
			void this.unpublish();
		}, IDLE_UNPUBLISH_MS);
	}

	private clearIdleTimer(): void {
		if (this.idleTimer != null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}
}

function clampVolume(volume: number): number {
	return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
}

export default new SoundboardPlayback();
