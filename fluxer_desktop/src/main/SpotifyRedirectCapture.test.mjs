// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {describe, test} from 'node:test';

const {SPOTIFY_REDIRECT_PORT, SPOTIFY_REDIRECT_PATH, captureRedirect, matchRedirectRequest} = await import(
	'./SpotifyRedirectCapture.ts'
);

async function freePort() {
	const server = net.createServer();
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const {port} = server.address();
	await new Promise((resolve) => server.close(resolve));
	return port;
}

function get(port, path, method = 'GET') {
	return new Promise((resolve, reject) => {
		const req = http.request({host: '127.0.0.1', port, path, method, agent: false}, (res) => {
			let body = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				body += chunk;
			});
			res.on('end', () => resolve({status: res.statusCode, body, type: res.headers['content-type']}));
		});
		req.on('error', reject);
		req.end();
	});
}

describe('matchRedirectRequest', () => {
	test('returns the full redirect URL for a GET on the redirect path', () => {
		assert.equal(
			matchRedirectRequest('GET', '/login?code=a&state=b', 36850, '/login'),
			'http://127.0.0.1:36850/login?code=a&state=b',
		);
		assert.equal(matchRedirectRequest('GET', '/login', 36850, '/login'), 'http://127.0.0.1:36850/login');
		assert.equal(
			matchRedirectRequest('GET', '/login?error=access_denied&state=b', 36850, '/login'),
			'http://127.0.0.1:36850/login?error=access_denied&state=b',
		);
	});

	test('ignores other paths and methods', () => {
		assert.equal(matchRedirectRequest('GET', '/favicon.ico', 36850, '/login'), null);
		assert.equal(matchRedirectRequest('GET', '/login/extra?code=a', 36850, '/login'), null);
		assert.equal(matchRedirectRequest('GET', '/loginx?code=a', 36850, '/login'), null);
		assert.equal(matchRedirectRequest('POST', '/login?code=a', 36850, '/login'), null);
		assert.equal(matchRedirectRequest(undefined, '/login?code=a', 36850, '/login'), null);
		assert.equal(matchRedirectRequest('GET', undefined, 36850, '/login'), null);
		assert.equal(matchRedirectRequest('GET', '//evil.example/login', 36850, '/login'), null);
	});

	test('with an expected state, only accepts the redirect carrying that state', () => {
		assert.equal(
			matchRedirectRequest('GET', '/login?code=a&state=s1', 36850, '/login', 's1'),
			'http://127.0.0.1:36850/login?code=a&state=s1',
		);
		assert.equal(
			matchRedirectRequest('GET', '/login?error=access_denied&state=s1', 36850, '/login', 's1'),
			'http://127.0.0.1:36850/login?error=access_denied&state=s1',
		);
		assert.equal(matchRedirectRequest('GET', '/login?code=a&state=other', 36850, '/login', 's1'), null);
		assert.equal(matchRedirectRequest('GET', '/login?code=a', 36850, '/login', 's1'), null);
		assert.equal(matchRedirectRequest('GET', '/login', 36850, '/login', 's1'), null);
		assert.equal(matchRedirectRequest('GET', '/login?code=a&state=s1&state=s2', 36850, '/login', 's1'), null);
	});

	test('is bound to the registered Spotify redirect', () => {
		assert.equal(SPOTIFY_REDIRECT_PORT, 36850);
		assert.equal(SPOTIFY_REDIRECT_PATH, '/login');
	});
});

describe('captureRedirect', () => {
	test('captures the first redirect and closes', async () => {
		const port = await freePort();
		const capture = captureRedirect({port, path: '/login', timeoutMs: 10_000});
		await capture.listening;
		const favicon = await get(port, '/favicon.ico');
		assert.equal(favicon.status, 404);
		const response = await get(port, '/login?code=a&state=b');
		assert.equal(response.status, 200);
		assert.match(response.type, /text\/html/);
		assert.match(response.body, /Pronto! Pode voltar ao Fluxer\./);
		assert.equal(await capture.result, `http://127.0.0.1:${port}/login?code=a&state=b`);
		await assert.rejects(get(port, '/login?code=c&state=d'));
	});

	test('ignores a redirect with another state and keeps waiting', async () => {
		const port = await freePort();
		const capture = captureRedirect({port, path: '/login', timeoutMs: 10_000, expectedState: 's1'});
		await capture.listening;
		const stray = await get(port, '/login?code=x&state=forged');
		assert.equal(stray.status, 404);
		const response = await get(port, '/login?code=a&state=s1');
		assert.equal(response.status, 200);
		assert.equal(await capture.result, `http://127.0.0.1:${port}/login?code=a&state=s1`);
	});

	test('resolves null when the port is busy', async () => {
		const blocker = net.createServer();
		await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
		const {port} = blocker.address();
		try {
			const capture = captureRedirect({port, path: '/login', timeoutMs: 10_000});
			assert.equal(await capture.result, null);
		} finally {
			await new Promise((resolve) => blocker.close(resolve));
		}
	});

	test('resolves null after the timeout and frees the port', async () => {
		const port = await freePort();
		const capture = captureRedirect({port, path: '/login', timeoutMs: 50});
		assert.equal(await capture.result, null);
		await assert.rejects(get(port, '/login?code=a&state=b'));
	});

	test('cancel resolves null and frees the port for a new capture', async () => {
		const port = await freePort();
		const first = captureRedirect({port, path: '/login', timeoutMs: 10_000});
		await first.listening;
		await first.cancel();
		assert.equal(await first.result, null);
		const second = captureRedirect({port, path: '/login', timeoutMs: 10_000});
		await second.listening;
		await get(port, '/login?code=z&state=y');
		assert.equal(await second.result, `http://127.0.0.1:${port}/login?code=z&state=y`);
	});
});
