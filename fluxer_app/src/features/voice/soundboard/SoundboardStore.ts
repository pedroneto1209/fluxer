// SPDX-License-Identifier: AGPL-3.0-or-later

import Guilds from '@app/features/guild/state/Guilds';
import SessionManager from '@app/features/platform/state/AuthSession';
import {Logger} from '@app/features/platform/utils/AppLogger';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {
	deleteSound,
	fetchSoundAudio,
	fetchSoundboardServiceInfo,
	listSounds,
	SoundboardApiError,
	type SoundboardServiceInfo,
	type SoundboardSound,
	uploadSound,
} from '@app/features/voice/soundboard/SoundboardApi';
import SoundboardPlayback from '@app/features/voice/soundboard/SoundboardPlayback';
import {makeAutoObservable, runInAction} from 'mobx';

const logger = new Logger('SoundboardStore');

const VOLUME_STORAGE_KEY = 'fluxer.soundboard.volume';
const SERVICE_RECHECK_MS = 5 * 60_000;
const PLAY_COOLDOWN_MS = 400;

export type SoundboardAvailability = 'unknown' | 'checking' | 'available' | 'unavailable';

function readStoredVolume(): number {
	try {
		const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
		const value = raw == null ? Number.NaN : Number.parseFloat(raw);
		return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.8;
	} catch {
		return 0.8;
	}
}

export function describeSoundboardError(error: unknown): string {
	if (error instanceof SoundboardApiError) return error.message;
	if (error instanceof Error && error.message) return error.message;
	return 'Something went wrong.';
}

class SoundboardStore {
	availability: SoundboardAvailability = 'unknown';
	serviceInfo: SoundboardServiceInfo | null = null;
	soundsByGuild = new Map<string, Array<SoundboardSound>>();
	loadingGuildId: string | null = null;
	loadError: string | null = null;
	playingSoundIds = new Set<string>();
	volume = readStoredVolume();
	private serviceCheckedAt = 0;
	private lastPlayAt = 0;

	constructor() {
		makeAutoObservable<SoundboardStore, 'serviceCheckedAt' | 'lastPlayAt'>(this, {
			serviceCheckedAt: false,
			lastPlayAt: false,
		});
	}

	get voiceGuildId(): string | null {
		return MediaEngine.connected ? MediaEngine.guildId : null;
	}

	soundsFor(guildId: string): Array<SoundboardSound> {
		return this.soundsByGuild.get(guildId) ?? [];
	}

	canDelete(sound: SoundboardSound): boolean {
		const me = SessionManager.userId;
		if (!me) return false;
		return sound.uploaderId === me || Guilds.getGuild(sound.guildId)?.ownerId === me;
	}

	async ensureService(force = false): Promise<boolean> {
		const fresh = Date.now() - this.serviceCheckedAt < SERVICE_RECHECK_MS;
		if (!force && fresh && this.availability !== 'unknown' && this.availability !== 'checking') {
			return this.availability === 'available';
		}
		runInAction(() => {
			this.availability = 'checking';
		});
		const info = await fetchSoundboardServiceInfo();
		runInAction(() => {
			this.serviceInfo = info;
			this.availability = info ? 'available' : 'unavailable';
			this.serviceCheckedAt = Date.now();
		});
		return info != null;
	}

	async load(guildId: string): Promise<void> {
		if (!(await this.ensureService())) return;
		runInAction(() => {
			this.loadingGuildId = guildId;
			this.loadError = null;
		});
		try {
			const sounds = await listSounds(guildId);
			runInAction(() => {
				this.soundsByGuild.set(guildId, sounds);
			});
		} catch (error) {
			logger.warn('Failed to load the soundboard', {error});
			runInAction(() => {
				this.loadError = describeSoundboardError(error);
			});
		} finally {
			runInAction(() => {
				if (this.loadingGuildId === guildId) this.loadingGuildId = null;
			});
		}
	}

	async upload(guildId: string, sound: {name: string; emoji: string | null; file: Blob}): Promise<SoundboardSound> {
		const created = await uploadSound(guildId, sound);
		runInAction(() => {
			this.soundsByGuild.set(guildId, [...this.soundsFor(guildId), created]);
		});
		return created;
	}

	async remove(sound: SoundboardSound): Promise<void> {
		await deleteSound(sound.guildId, sound.id);
		SoundboardPlayback.forget(sound.id);
		runInAction(() => {
			this.soundsByGuild.set(
				sound.guildId,
				this.soundsFor(sound.guildId).filter((existing) => existing.id !== sound.id),
			);
		});
	}

	async play(sound: SoundboardSound): Promise<void> {
		const now = Date.now();
		if (now - this.lastPlayAt < PLAY_COOLDOWN_MS) return;
		this.lastPlayAt = now;
		runInAction(() => {
			this.playingSoundIds.add(sound.id);
		});
		try {
			await SoundboardPlayback.play(sound.id, () => fetchSoundAudio(sound.guildId, sound.id), this.volume);
		} finally {
			setTimeout(
				() =>
					runInAction(() => {
						this.playingSoundIds.delete(sound.id);
					}),
				Math.max(300, sound.durationMs),
			);
		}
	}

	setVolume(volume: number): void {
		this.volume = Math.min(1, Math.max(0, volume));
		try {
			window.localStorage.setItem(VOLUME_STORAGE_KEY, String(this.volume));
		} catch {}
	}
}

export default new SoundboardStore();
