// SPDX-License-Identifier: AGPL-3.0-or-later

// One-shot loopback server that catches the Spotify OAuth redirect for the
// channel-music feature. The redirect URI registered with Spotify is fixed at
// http://127.0.0.1:36850/login, so the server listens only there, hands back the
// full URL of the first GET on that path and closes. The music service validates
// the URL (state, code), so nothing here interprets it.

import http from 'node:http';

export const SPOTIFY_REDIRECT_HOST = '127.0.0.1';
export const SPOTIFY_REDIRECT_PORT = 36850;
export const SPOTIFY_REDIRECT_PATH = '/login';
export const SPOTIFY_REDIRECT_TIMEOUT_MS = 5 * 60_000;

const DONE_PAGE = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Fluxer</title></head>
<body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 20vh;">
<p style="font-size: 1.4em;">Pronto! Pode voltar ao Fluxer.</p>
</body>
</html>
`;

/** Full redirect URL when the request is a GET on the redirect path, else null. */
export function matchRedirectRequest(
	method: string | undefined,
	requestUrl: string | undefined,
	port: number,
	expectedPath: string,
): string | null {
	if (method !== 'GET' || typeof requestUrl !== 'string') return null;
	if (!requestUrl.startsWith('/') || requestUrl.startsWith('//')) return null;
	const queryStart = requestUrl.indexOf('?');
	const pathname = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);
	if (pathname !== expectedPath) return null;
	return `http://${SPOTIFY_REDIRECT_HOST}:${port}${requestUrl}`;
}

export interface RedirectCapture {
	/** The full redirect URL, or null on a busy port, timeout or cancel. */
	result: Promise<string | null>;
	/** Settles once the server is listening (or failed to). */
	listening: Promise<void>;
	/** Stops waiting (result becomes null) and resolves once the port is free. */
	cancel: () => Promise<void>;
}

export function captureRedirect(options: {port?: number; path?: string; timeoutMs?: number} = {}): RedirectCapture {
	const port = options.port ?? SPOTIFY_REDIRECT_PORT;
	const path = options.path ?? SPOTIFY_REDIRECT_PATH;
	const timeoutMs = options.timeoutMs ?? SPOTIFY_REDIRECT_TIMEOUT_MS;

	let settle: (value: string | null) => void = () => {};
	const result = new Promise<string | null>((resolve) => {
		settle = resolve;
	});
	let markListening: () => void = () => {};
	const listening = new Promise<void>((resolve) => {
		markListening = resolve;
	});

	let finished = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let closed: Promise<void> | null = null;

	const server = http.createServer((request, response) => {
		const url = finished ? null : matchRedirectRequest(request.method, request.url, port, path);
		if (url === null) {
			response.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8', Connection: 'close'});
			response.end('Not found');
			return;
		}
		response.writeHead(200, {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			Connection: 'close',
		});
		response.end(DONE_PAGE, () => {
			void finish(url);
		});
	});

	function close(): Promise<void> {
		// Waits for listen() to settle so a cancel during startup still frees the port.
		closed ??= listening.then(
			() =>
				new Promise<void>((resolve) => {
					if (!server.listening) {
						resolve();
						return;
					}
					server.close(() => resolve());
					server.closeAllConnections();
				}),
		);
		return closed;
	}

	function finish(value: string | null): Promise<void> {
		if (!finished) {
			finished = true;
			if (timer) clearTimeout(timer);
			settle(value);
		}
		return close();
	}

	// 'on', not 'once': a later error (e.g. while closing) must not go unhandled; finish is idempotent.
	server.on('error', () => {
		markListening();
		void finish(null);
	});
	server.listen({port, host: SPOTIFY_REDIRECT_HOST, exclusive: true}, () => {
		markListening();
		if (finished) return;
		timer = setTimeout(() => {
			void finish(null);
		}, timeoutMs);
	});

	return {result, listening, cancel: () => finish(null)};
}
