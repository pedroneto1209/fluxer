// SPDX-License-Identifier: AGPL-3.0-or-later

// Client for the instance's Xbox service (fluxer-server xbox/), served under
// <web app origin>/xbox. The service checks every request against the Fluxer API with
// the caller's own token; only the console's owner may start, stop or sign in.

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import SessionManager from '@app/features/platform/state/AuthSession';

export type XboxStreamState = 'idle' | 'starting' | 'live' | 'stopping' | 'error';

export interface XboxStream {
	state: XboxStreamState;
	/** What it is doing while starting ("Procurando o Xbox"...). */
	step: string | null;
	guildId: string | null;
	channelId: string | null;
	console: string | null;
	error: string | null;
	/** Why the last stream ended. */
	ended: string | null;
}

export interface XboxPendingLogin {
	userCode: string;
	verificationUri: string;
}

export interface XboxStatus {
	canControl: boolean;
	signedIn: boolean;
	gamertag: string | null;
	pendingLogin: XboxPendingLogin | null;
	stream: XboxStream;
}

export class XboxApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'XboxApiError';
	}
}

export function getXboxBaseUrl(): string {
	return `${RuntimeConfig.webAppEndpoint.replace(/\/+$/u, '')}/xbox`;
}

const STREAM_STATES: ReadonlyArray<XboxStreamState> = ['idle', 'starting', 'live', 'stopping', 'error'];

function str(value: unknown): string | null {
	return typeof value === 'string' && value !== '' ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseXboxStream(raw: unknown): XboxStream | null {
	const s = record(raw);
	if (!s || !STREAM_STATES.includes(s.state as XboxStreamState)) return null;
	return {
		state: s.state as XboxStreamState,
		step: str(s.step),
		guildId: str(s.guildId),
		channelId: str(s.channelId),
		console: str(s.console),
		error: str(s.error),
		ended: str(s.ended),
	};
}

function parsePendingLogin(raw: unknown): XboxPendingLogin | null {
	const p = record(raw);
	const userCode = str(p?.userCode);
	const verificationUri = str(p?.verificationUri);
	return userCode && verificationUri ? {userCode, verificationUri} : null;
}

export function parseXboxStatus(raw: unknown): XboxStatus | null {
	const body = record(raw);
	const account = record(body?.account);
	const stream = parseXboxStream(body?.stream);
	if (!body || !account || !stream) return null;
	return {
		canControl: body.canControl === true,
		signedIn: account.signedIn === true,
		gamertag: str(account.gamertag),
		pendingLogin: parsePendingLogin(account.pendingLogin),
		stream,
	};
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
	const token = SessionManager.token;
	if (!token) throw new XboxApiError(401, 'UNAUTHORIZED', 'Você não está conectado.');
	const headers = new Headers(init.headers);
	headers.set('Authorization', token);
	let response: Response;
	try {
		response = await fetch(`${getXboxBaseUrl()}${path}`, {...init, headers, credentials: 'omit', cache: 'no-store'});
	} catch {
		throw new XboxApiError(0, 'NETWORK', 'Não foi possível falar com o serviço do Xbox.');
	}
	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// Not JSON: the instance has no Xbox service at /xbox (the web app answered).
		throw new XboxApiError(response.status, 'UNAVAILABLE', 'Este servidor não tem o serviço do Xbox.');
	}
	if (!response.ok) {
		const error = record(record(body)?.error);
		throw new XboxApiError(
			response.status,
			str(error?.code) ?? 'HTTP_ERROR',
			str(error?.message) ?? `O serviço do Xbox respondeu ${response.status}.`,
		);
	}
	return body;
}

function postJson(body?: unknown): RequestInit {
	return body === undefined
		? {method: 'POST'}
		: {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)};
}

export async function fetchXboxStatus(): Promise<XboxStatus> {
	const status = parseXboxStatus(await request('/api/status'));
	if (!status) throw new XboxApiError(200, 'UNAVAILABLE', 'Resposta inválida do serviço do Xbox.');
	return status;
}

export async function startXboxStream(guildId: string, channelId: string): Promise<void> {
	await request('/api/stream', postJson({guildId, channelId}));
}

export async function stopXboxStream(): Promise<void> {
	await request('/api/stream', {method: 'DELETE'});
}

export async function beginXboxLogin(): Promise<XboxPendingLogin> {
	const login = parsePendingLogin(record(await request('/api/login', postJson()))?.pendingLogin);
	if (!login) throw new XboxApiError(200, 'BAD_RESPONSE', 'Resposta inválida do serviço do Xbox.');
	return login;
}
