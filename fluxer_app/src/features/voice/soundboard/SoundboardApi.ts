// SPDX-License-Identifier: AGPL-3.0-or-later

// Client for the instance's soundboard service (fluxer-soundboard), served under
// <web app origin>/soundboard. The service checks every request against the Fluxer
// API with the caller's own token, so it only answers members of a community.

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import SessionManager from '@app/features/platform/state/AuthSession';

export interface SoundboardSound {
	id: string;
	guildId: string;
	name: string;
	emoji: string | null;
	uploaderId: string;
	contentType: string;
	durationMs: number;
	sizeBytes: number;
	createdAt: number;
}

export interface SoundboardServiceInfo {
	maxClipMs: number;
	maxClipBytes: number;
}

interface ApiSound {
	id: string;
	guild_id: string;
	name: string;
	emoji: string | null;
	uploader_id: string;
	content_type: string;
	duration_ms: number;
	size_bytes: number;
	created_at: number;
}

export class SoundboardApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'SoundboardApiError';
		this.status = status;
		this.code = code;
	}
}

function toSound(row: ApiSound): SoundboardSound {
	return {
		id: row.id,
		guildId: row.guild_id,
		name: row.name,
		emoji: row.emoji,
		uploaderId: row.uploader_id,
		contentType: row.content_type,
		durationMs: row.duration_ms,
		sizeBytes: row.size_bytes,
		createdAt: row.created_at,
	};
}

export function getSoundboardBaseUrl(): string {
	return `${RuntimeConfig.webAppEndpoint.replace(/\/+$/u, '')}/soundboard`;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const token = SessionManager.token;
	if (!token) {
		throw new SoundboardApiError(401, 'UNAUTHORIZED', 'You are not signed in.');
	}
	const headers = new Headers(init.headers);
	headers.set('Authorization', token);
	let response: Response;
	try {
		response = await fetch(`${getSoundboardBaseUrl()}${path}`, {
			...init,
			headers,
			credentials: 'omit',
			cache: 'no-store',
		});
	} catch {
		throw new SoundboardApiError(0, 'NETWORK', 'Could not reach the soundboard.');
	}
	if (!response.ok) {
		let code = 'HTTP_ERROR';
		let message = `The soundboard answered ${response.status}.`;
		try {
			const body = (await response.json()) as {code?: unknown; message?: unknown};
			if (typeof body.code === 'string') code = body.code;
			if (typeof body.message === 'string') message = body.message;
		} catch {}
		throw new SoundboardApiError(response.status, code, message);
	}
	return response;
}

// Instances without the service answer /soundboard/health with the web app's HTML, so
// availability is decided by the JSON identity, not just the status code.
export async function fetchSoundboardServiceInfo(): Promise<SoundboardServiceInfo | null> {
	try {
		const response = await fetch(`${getSoundboardBaseUrl()}/health`, {credentials: 'omit', cache: 'no-store'});
		if (!response.ok) return null;
		const body = (await response.json()) as {service?: unknown; max_clip_ms?: unknown; max_clip_bytes?: unknown};
		if (body.service !== 'fluxer-soundboard') return null;
		return {
			maxClipMs: typeof body.max_clip_ms === 'number' ? body.max_clip_ms : 5200,
			maxClipBytes: typeof body.max_clip_bytes === 'number' ? body.max_clip_bytes : 1024 * 1024,
		};
	} catch {
		return null;
	}
}

export async function listSounds(guildId: string): Promise<Array<SoundboardSound>> {
	const response = await request(`/api/guilds/${encodeURIComponent(guildId)}/sounds`);
	const body = (await response.json()) as {sounds: Array<ApiSound>};
	return body.sounds.map(toSound);
}

function readFileAsBase64(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
		reader.onload = () => {
			const result = typeof reader.result === 'string' ? reader.result : '';
			resolve(result.slice(result.indexOf(',') + 1));
		};
		reader.readAsDataURL(file);
	});
}

export async function uploadSound(
	guildId: string,
	sound: {name: string; emoji: string | null; file: Blob},
): Promise<SoundboardSound> {
	const audio = await readFileAsBase64(sound.file);
	const response = await request(`/api/guilds/${encodeURIComponent(guildId)}/sounds`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({name: sound.name, emoji: sound.emoji, audio}),
	});
	return toSound((await response.json()) as ApiSound);
}

export async function deleteSound(guildId: string, soundId: string): Promise<void> {
	await request(`/api/guilds/${encodeURIComponent(guildId)}/sounds/${encodeURIComponent(soundId)}`, {
		method: 'DELETE',
	});
}

export async function fetchSoundAudio(guildId: string, soundId: string): Promise<ArrayBuffer> {
	const response = await request(
		`/api/guilds/${encodeURIComponent(guildId)}/sounds/${encodeURIComponent(soundId)}/audio`,
	);
	return await response.arrayBuffer();
}
