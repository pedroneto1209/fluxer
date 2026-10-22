// SPDX-License-Identifier: AGPL-3.0-or-later

// Client for the instance's music service (fluxer-music), served under
// <web app origin>/music. The service checks every request against the Fluxer API
// with the caller's own token.

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import SessionManager from '@app/features/platform/state/AuthSession';

export type MusicSource = 'spotify' | 'youtube';

export interface MusicTrack {
	source: MusicSource;
	sourceId: string;
	title: string;
	artist: string;
	/** 0 means unknown. */
	durationMs: number;
	artworkUrl: string | null;
	url: string;
}

export interface MusicQueueItem extends MusicTrack {
	id: string;
	addedBy: string | null;
	recommended: boolean;
}

export interface MusicSessionState {
	guildId: string;
	channelId: string;
	spotifyAccount: {userId: string; displayName: string} | null;
	nowPlaying: MusicQueueItem | null;
	paused: boolean;
	positionMs: number;
	/** Unix ms at which positionMs was measured. */
	positionAt: number;
	/** The first items of the queue: data messages carry only the head of a long queue. */
	queue: Array<MusicQueueItem>;
	/** Total queue length on the server; at least queue.length. */
	queueLength: number;
	notice: string | null;
	revision: number;
}

export interface MusicGuildSession {
	channelId: string;
	nowPlaying: MusicQueueItem | null;
}

export interface MusicSearchResult {
	youtube: Array<MusicTrack>;
	spotify: Array<MusicTrack> | null;
}

export interface SpotifyStatus {
	connected: boolean;
	displayName: string | null;
}

export class MusicApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'MusicApiError';
		this.status = status;
		this.code = code;
	}
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTrack(raw: unknown): MusicTrack | null {
	if (!isObject(raw)) return null;
	const {source, source_id, title, artist, duration_ms, artwork_url, url} = raw;
	if (source !== 'spotify' && source !== 'youtube') return null;
	if (typeof source_id !== 'string' || typeof title !== 'string') return null;
	return {
		source,
		sourceId: source_id,
		title,
		artist: typeof artist === 'string' ? artist : '',
		durationMs: typeof duration_ms === 'number' && Number.isFinite(duration_ms) ? duration_ms : 0,
		artworkUrl: typeof artwork_url === 'string' ? artwork_url : null,
		url: typeof url === 'string' ? url : '',
	};
}

function parseQueueItem(raw: unknown): MusicQueueItem | null {
	const track = parseTrack(raw);
	if (!track || !isObject(raw) || typeof raw.id !== 'string') return null;
	return {
		...track,
		id: raw.id,
		addedBy: typeof raw.added_by === 'string' ? raw.added_by : null,
		recommended: raw.recommended === true,
	};
}

export function parseSessionState(json: unknown): MusicSessionState | null {
	if (!isObject(json)) return null;
	const {guild_id, channel_id, revision, queue} = json;
	if (typeof guild_id !== 'string' || typeof channel_id !== 'string') return null;
	if (typeof revision !== 'number' || !Number.isFinite(revision)) return null;
	if (!Array.isArray(queue)) return null;

	const items: Array<MusicQueueItem> = [];
	for (const entry of queue) {
		const item = parseQueueItem(entry);
		if (!item) return null;
		items.push(item);
	}

	let nowPlaying: MusicQueueItem | null = null;
	if (json.now_playing != null) {
		nowPlaying = parseQueueItem(json.now_playing);
		if (!nowPlaying) return null;
	}

	let spotifyAccount: MusicSessionState['spotifyAccount'] = null;
	const account = json.spotify_account;
	if (isObject(account) && typeof account.user_id === 'string') {
		spotifyAccount = {
			userId: account.user_id,
			displayName: typeof account.display_name === 'string' ? account.display_name : '',
		};
	}

	return {
		guildId: guild_id,
		channelId: channel_id,
		spotifyAccount,
		nowPlaying,
		paused: json.paused === true,
		positionMs: typeof json.position_ms === 'number' ? json.position_ms : 0,
		positionAt: typeof json.position_at === 'number' ? json.position_at : 0,
		queue: items,
		queueLength:
			typeof json.queue_length === 'number' && Number.isInteger(json.queue_length)
				? Math.max(json.queue_length, items.length)
				: items.length,
		notice: typeof json.notice === 'string' ? json.notice : null,
		revision,
	};
}

export function getMusicBaseUrl(): string {
	return `${RuntimeConfig.webAppEndpoint.replace(/\/+$/u, '')}/music`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const token = SessionManager.token;
	if (!token) {
		throw new MusicApiError(401, 'UNAUTHORIZED', 'Você não está conectado.');
	}
	const headers = new Headers(init.headers);
	headers.set('Authorization', token);
	let response: Response;
	try {
		response = await fetch(`${getMusicBaseUrl()}${path}`, {
			...init,
			headers,
			credentials: 'omit',
			cache: 'no-store',
		});
	} catch {
		throw new MusicApiError(0, 'NETWORK', 'Não foi possível falar com o serviço de música.');
	}
	if (!response.ok) {
		let code = 'HTTP_ERROR';
		let message = `O serviço de música respondeu ${response.status}.`;
		try {
			const body = (await response.json()) as {code?: unknown; message?: unknown};
			if (typeof body.code === 'string') code = body.code;
			if (typeof body.message === 'string') message = body.message;
		} catch {}
		throw new MusicApiError(response.status, code, message);
	}
	return response;
}

function jsonInit(method: string, body?: unknown): RequestInit {
	if (body === undefined) return {method};
	return {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)};
}

function channelPath(guildId: string, channelId: string): string {
	return `/api/guilds/${encodeURIComponent(guildId)}/channels/${encodeURIComponent(channelId)}`;
}

async function readState(response: Response): Promise<MusicSessionState> {
	const state = parseSessionState(await response.json());
	if (!state) throw new MusicApiError(response.status, 'BAD_RESPONSE', 'Resposta inválida do serviço de música.');
	return state;
}

// Instances without the service answer /music/health with the web app's HTML, so
// availability is decided by the JSON identity, not just the status code.
export async function fetchMusicServiceAvailable(): Promise<boolean> {
	try {
		const response = await fetch(`${getMusicBaseUrl()}/health`, {credentials: 'omit', cache: 'no-store'});
		if (!response.ok) return false;
		const body = (await response.json()) as {service?: unknown};
		return body.service === 'fluxer-music';
	} catch {
		return false;
	}
}

export async function getSession(guildId: string, channelId: string): Promise<MusicSessionState | null> {
	try {
		return await readState(await request(channelPath(guildId, channelId)));
	} catch (error) {
		if (error instanceof MusicApiError && error.code === 'NO_SESSION') return null;
		throw error;
	}
}

export async function searchTracks(guildId: string, channelId: string, query: string): Promise<MusicSearchResult> {
	const response = await request(`${channelPath(guildId, channelId)}/search?q=${encodeURIComponent(query)}`);
	const body: unknown = await response.json();
	if (!isObject(body))
		throw new MusicApiError(response.status, 'BAD_RESPONSE', 'Resposta inválida do serviço de música.');
	const tracks = (list: Array<unknown>) => list.map(parseTrack).filter((t): t is MusicTrack => t !== null);
	// A missing or malformed list means no results from that source.
	return {
		youtube: Array.isArray(body.youtube) ? tracks(body.youtube) : [],
		spotify: Array.isArray(body.spotify) ? tracks(body.spotify) : null,
	};
}

export async function addToQueue(
	guildId: string,
	channelId: string,
	payload: {input: string} | {track: Pick<MusicTrack, 'source' | 'sourceId'>},
): Promise<MusicSessionState> {
	const body =
		'input' in payload
			? {input: payload.input}
			: {track: {source: payload.track.source, source_id: payload.track.sourceId}};
	return readState(await request(`${channelPath(guildId, channelId)}/queue`, jsonInit('POST', body)));
}

export async function removeFromQueue(guildId: string, channelId: string, itemId: string): Promise<MusicSessionState> {
	return readState(
		await request(`${channelPath(guildId, channelId)}/queue/${encodeURIComponent(itemId)}`, jsonInit('DELETE')),
	);
}

export async function moveInQueue(
	guildId: string,
	channelId: string,
	itemId: string,
	index: number,
): Promise<MusicSessionState> {
	return readState(
		await request(
			`${channelPath(guildId, channelId)}/queue/${encodeURIComponent(itemId)}/move`,
			jsonInit('POST', {index}),
		),
	);
}

export async function skip(guildId: string, channelId: string): Promise<MusicSessionState> {
	return readState(await request(`${channelPath(guildId, channelId)}/skip`, jsonInit('POST')));
}

export async function previous(guildId: string, channelId: string): Promise<MusicSessionState> {
	return readState(await request(`${channelPath(guildId, channelId)}/previous`, jsonInit('POST')));
}

export async function setPaused(guildId: string, channelId: string, paused: boolean): Promise<MusicSessionState> {
	return readState(await request(`${channelPath(guildId, channelId)}/pause`, jsonInit('POST', {paused})));
}

export async function stopSession(guildId: string, channelId: string): Promise<void> {
	await request(`${channelPath(guildId, channelId)}/stop`, jsonInit('POST'));
}

export async function listGuildSessions(guildId: string): Promise<Array<MusicGuildSession>> {
	const response = await request(`/api/guilds/${encodeURIComponent(guildId)}/sessions`);
	const body: unknown = await response.json();
	// A malformed answer is an error, not "no sessions": the sidebar keeps what it shows.
	if (!isObject(body) || !Array.isArray(body.sessions)) {
		throw new MusicApiError(response.status, 'BAD_RESPONSE', 'Resposta inválida do serviço de música.');
	}
	const result: Array<MusicGuildSession> = [];
	for (const entry of body.sessions) {
		if (!isObject(entry) || typeof entry.channel_id !== 'string') continue;
		result.push({
			channelId: entry.channel_id,
			nowPlaying: entry.now_playing == null ? null : parseQueueItem(entry.now_playing),
		});
	}
	return result;
}

function parseSpotifyStatus(body: {connected?: unknown; display_name?: unknown}): SpotifyStatus {
	return {
		connected: body.connected === true,
		displayName: typeof body.display_name === 'string' ? body.display_name : null,
	};
}

export async function getSpotifyStatus(): Promise<SpotifyStatus> {
	return parseSpotifyStatus(await (await request('/api/spotify/status')).json());
}

const SPOTIFY_AUTHORIZE_ORIGIN = 'https://accounts.spotify.com/';

export async function startSpotifyAuthorize(): Promise<{url: string; state: string}> {
	const response = await request('/api/spotify/authorize', jsonInit('POST'));
	const body: unknown = await response.json();
	// The URL is opened in the browser, so only ever open Spotify's own login page.
	if (
		!isObject(body) ||
		typeof body.url !== 'string' ||
		!body.url.startsWith(SPOTIFY_AUTHORIZE_ORIGIN) ||
		typeof body.state !== 'string'
	) {
		throw new MusicApiError(response.status, 'BAD_RESPONSE', 'Resposta inválida do serviço de música.');
	}
	return {url: body.url, state: body.state};
}

export async function connectSpotify(
	payload: {code: string; state: string} | {redirectUrl: string},
): Promise<SpotifyStatus> {
	const body = 'redirectUrl' in payload ? {redirect_url: payload.redirectUrl} : payload;
	return parseSpotifyStatus(await (await request('/api/spotify/connect', jsonInit('POST', body))).json());
}

export async function disconnectSpotify(): Promise<void> {
	await request('/api/spotify', jsonInit('DELETE'));
}
