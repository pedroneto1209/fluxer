// SPDX-License-Identifier: AGPL-3.0-or-later

// "Microfone levantado": JBL Quantum wireless headsets mute their boom mic when it is
// flipped up and say so on a vendor HID collection (usage page 0xff13, report 6:
// 0x00 = mic up/muted, 0x01 = mic down/live). When this is turned on and we're in a
// call, flipping the mic up mutes us in Fluxer (so others see it) and plays a chosen
// soundboard sound into the call; flipping it down unmutes us again.

import * as VoiceStateCommands from '@app/features/devtools/commands/VoiceStateCommands';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import {initializeStore} from '@app/features/platform/utils/StoreInitialization';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {fetchSoundAudio} from '@app/features/voice/soundboard/SoundboardApi';
import SoundboardPlayback from '@app/features/voice/soundboard/SoundboardPlayback';
import SoundboardStore from '@app/features/voice/soundboard/SoundboardStore';
import LocalVoiceState from '@app/features/voice/state/LocalVoiceState';
import {makeAutoObservable, runInAction} from 'mobx';

const logger = new Logger('MicFlipStore');

const JBL_VENDOR_ID = 0x0ecb;
const MIC_USAGE_PAGE = 0xff13;
const MIC_REPORT_ID = 6;

// The slice of WebHID we use (TypeScript's DOM library doesn't ship it).
interface HidCollection {
	usagePage: number;
	usage: number;
}
interface HidInputReportEvent extends Event {
	reportId: number;
	data: DataView;
	device: HidDevice;
}
interface HidDevice extends EventTarget {
	opened: boolean;
	vendorId: number;
	productId: number;
	productName: string;
	collections: Array<HidCollection>;
	open(): Promise<void>;
}
interface HidApi extends EventTarget {
	getDevices(): Promise<Array<HidDevice>>;
}

function getHidApi(): HidApi | null {
	return (navigator as Navigator & {hid?: HidApi}).hid ?? null;
}

function isMicFlipDevice(device: HidDevice): boolean {
	return device.vendorId === JBL_VENDOR_ID && device.collections.some((c) => c.usagePage === MIC_USAGE_PAGE);
}

export type MicPosition = 'unknown' | 'up' | 'down';

class MicFlipStore {
	// Persisted settings.
	enabled = false;
	soundId: string | null = null;
	soundGuildId: string | null = null;
	soundName: string | null = null;
	unmuteOnLower = true;

	// Live state.
	headsetName: string | null = null;
	position: MicPosition = 'unknown';
	private mutedByFlip = false;
	private listening = new Set<HidDevice>();
	private started = false;

	constructor() {
		makeAutoObservable<MicFlipStore, 'mutedByFlip' | 'listening' | 'started'>(
			this,
			{mutedByFlip: false, listening: false, started: false},
			{autoBind: true},
		);
		initializeStore(this, () =>
			makePersistent(this, 'MicFlip', ['enabled', 'soundId', 'soundGuildId', 'soundName', 'unmuteOnLower']),
		);
	}

	get headsetFound(): boolean {
		return this.headsetName != null;
	}

	// "Talking to someone in the room": the option is on and the boom mic is up. Shared
	// with the call by AwayStore so everyone sees it (unlike an ordinary mute).
	get raised(): boolean {
		return this.enabled && this.position === 'up';
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setUnmuteOnLower(value: boolean): void {
		this.unmuteOnLower = value;
	}

	setSound(sound: {id: string; guildId: string; name: string} | null): void {
		this.soundId = sound?.id ?? null;
		this.soundGuildId = sound?.guildId ?? null;
		this.soundName = sound?.name ?? null;
	}

	// Safe to call more than once; watches for the headset (re)connecting too.
	start(): void {
		if (this.started) return;
		const hid = getHidApi();
		if (!hid) return;
		this.started = true;
		hid.addEventListener('connect', () => void this.scan());
		hid.addEventListener('disconnect', (event) => {
			const device = (event as Event & {device?: HidDevice}).device;
			if (device) this.listening.delete(device);
			if (this.listening.size === 0) {
				runInAction(() => {
					this.headsetName = null;
					this.position = 'unknown';
				});
			}
		});
		void this.scan();
	}

	private async scan(): Promise<void> {
		const hid = getHidApi();
		if (!hid) return;
		let devices: Array<HidDevice>;
		try {
			devices = (await hid.getDevices()).filter(isMicFlipDevice);
		} catch (error) {
			logger.warn('Could not list HID devices', {error});
			return;
		}
		for (const device of devices) {
			if (this.listening.has(device)) continue;
			try {
				if (!device.opened) await device.open();
			} catch (error) {
				logger.warn('Could not open the headset', {error, product: device.productName});
				continue;
			}
			device.addEventListener('inputreport', (event) => this.handleReport(event as HidInputReportEvent));
			this.listening.add(device);
			runInAction(() => {
				this.headsetName = device.productName || 'JBL Quantum';
			});
			logger.info('Watching the headset mic', {product: device.productName});
		}
	}

	private handleReport(event: HidInputReportEvent): void {
		if (event.reportId !== MIC_REPORT_ID || event.data.byteLength < 1) return;
		const position: MicPosition = event.data.getUint8(0) === 0 ? 'up' : 'down';
		if (position === this.position) return;
		runInAction(() => {
			this.position = position;
		});
		if (position === 'up') void this.onLifted();
		else void this.onLowered();
	}

	private async onLifted(): Promise<void> {
		if (!this.enabled || !MediaEngine.connected) return;
		if (!LocalVoiceState.getSelfMute() && !LocalVoiceState.getSelfDeaf()) {
			this.mutedByFlip = true;
			await VoiceStateCommands.toggleSelfMute();
		}
		const {soundId, soundGuildId} = this;
		if (soundId && soundGuildId) {
			try {
				// The soundboard track isn't affected by mute, so the call still hears it.
				await SoundboardPlayback.play(soundId, () => fetchSoundAudio(soundGuildId, soundId), SoundboardStore.volume);
			} catch (error) {
				logger.warn('Could not play the mic-up sound', {error});
			}
		}
	}

	private async onLowered(): Promise<void> {
		const mutedByFlip = this.mutedByFlip;
		this.mutedByFlip = false;
		if (!this.enabled || !this.unmuteOnLower || !mutedByFlip || !MediaEngine.connected) return;
		if (LocalVoiceState.getSelfMute() && !LocalVoiceState.getSelfDeaf()) {
			await VoiceStateCommands.toggleSelfMute();
		}
	}
}

export default new MicFlipStore();
