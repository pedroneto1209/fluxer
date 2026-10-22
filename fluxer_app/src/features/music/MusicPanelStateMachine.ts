// SPDX-License-Identifier: AGPL-3.0-or-later

// Pure logic behind the music panel: what the search field holds (a link to queue or
// text to search), the debounced search, queue drag-and-drop indexes and progress text.

import type {MusicAvailability} from '@app/features/music/MusicStore';

export type MusicInputKind = 'link' | 'search' | 'empty';

export const MUSIC_SEARCH_DEBOUNCE_MS = 400;

// Same hosts the music service accepts (fluxer-music app/links.py). Anything else is searched.
const LINK_HOSTS = new Set([
	'open.spotify.com',
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
]);

export function classifyInput(text: string): MusicInputKind {
	const value = text.trim();
	if (!value) return 'empty';
	if (/\s/u.test(value)) return 'search';
	if (value.toLowerCase().startsWith('spotify:')) return 'link';
	let url: URL;
	try {
		url = new URL(value.includes('://') ? value : `https://${value}`);
	} catch {
		return 'search';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'search';
	return LINK_HOSTS.has(url.hostname.toLowerCase()) ? 'link' : 'search';
}

export interface MusicSearchInputOptions {
	onSearch: (query: string) => void;
	/** Called when the field no longer holds searchable text (blank or a link). */
	onClear?: () => void;
	delayMs?: number;
}

export interface MusicSearchInput {
	change(text: string): void;
	/** Enter: searches text right away; the caller queues links. */
	submit(text: string): MusicInputKind;
	dispose(): void;
}

export function createMusicSearchInput({
	onSearch,
	onClear,
	delayMs = MUSIC_SEARCH_DEBOUNCE_MS,
}: MusicSearchInputOptions): MusicSearchInput {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const cancel = (): void => {
		if (timer != null) clearTimeout(timer);
		timer = null;
	};
	return {
		change(text) {
			cancel();
			if (classifyInput(text) !== 'search') {
				onClear?.();
				return;
			}
			const query = text.trim();
			timer = setTimeout(() => {
				timer = null;
				onSearch(query);
			}, delayMs);
		},
		submit(text) {
			cancel();
			const kind = classifyInput(text);
			if (kind === 'search') onSearch(text.trim());
			return kind;
		},
		dispose: cancel,
	};
}

/**
 * Final queue index for an item dragged from `fromIndex` and dropped before or after the
 * row at `targetIndex` (the service removes the item, then inserts it at the index).
 * Null when the drop leaves the queue unchanged.
 */
export function queueMoveIndex(fromIndex: number, targetIndex: number, position: 'before' | 'after'): number | null {
	let index = position === 'before' ? targetIndex : targetIndex + 1;
	if (fromIndex < index) index -= 1;
	return index === fromIndex ? null : index;
}

export function formatMusicTime(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = String(totalSeconds % 60).padStart(2, '0');
	return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export interface MusicProgress {
	elapsed: string;
	/** Null when the duration is unknown (0). */
	total: string | null;
	/** 0..1, or null when the duration is unknown: show an indeterminate bar. */
	fraction: number | null;
}

export function describeMusicProgress(positionMs: number, durationMs: number): MusicProgress {
	if (!(durationMs > 0)) return {elapsed: formatMusicTime(positionMs), total: null, fraction: null};
	const clamped = Math.min(Math.max(0, positionMs), durationMs);
	return {elapsed: formatMusicTime(clamped), total: formatMusicTime(durationMs), fraction: clamped / durationMs};
}

export interface MusicCallGateInput {
	availability: MusicAvailability;
	mobileLayout: boolean;
	/** The call we are in, or null. */
	connected: {guildId: string | null; channelId: string; mesh: boolean} | null;
	/** When given, the call must be in this channel. */
	channelId?: string;
}

// Music needs the instance service, a guild voice channel (the service API is per guild),
// an SFU room (the bot cannot join peer-to-peer calls) and the desktop layout (the panel
// lives in the side panel slot, which mobile does not render).
export function canUseMusicInCall({availability, mobileLayout, connected, channelId}: MusicCallGateInput): boolean {
	if (availability !== 'available' || mobileLayout || !connected) return false;
	if (!connected.guildId || connected.mesh) return false;
	return channelId == null || connected.channelId === channelId;
}

export interface MusicCommandRunnerOptions<State> {
	apply: (state: State) => void;
	/** Called with null when a command starts, and with the error when it fails. */
	onError: (error: unknown) => void;
	onPendingChange?: (pending: boolean) => void;
}

export interface MusicCommandRunner<State> {
	readonly pending: boolean;
	/** False when the command failed or was ignored because another one is in flight. */
	run(command: () => Promise<State | null>): Promise<boolean>;
}

// One music command at a time per panel, so a double-click on "Pular" skips once.
export function createMusicCommandRunner<State>({
	apply,
	onError,
	onPendingChange,
}: MusicCommandRunnerOptions<State>): MusicCommandRunner<State> {
	let pending = false;
	const setPending = (value: boolean): void => {
		pending = value;
		onPendingChange?.(value);
	};
	return {
		get pending() {
			return pending;
		},
		async run(command) {
			if (pending) return false;
			setPending(true);
			onError(null);
			try {
				const state = await command();
				if (state) apply(state);
				return true;
			} catch (error) {
				onError(error);
				return false;
			} finally {
				setPending(false);
			}
		},
	};
}
