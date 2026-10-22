// SPDX-License-Identifier: AGPL-3.0-or-later

import {cleanPastedRedirect, runSpotifyConnect} from '@app/features/music/SpotifyConnectFlow';
import {describe, expect, it, vi} from 'vitest';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize?client_id=x&state=s';
const REDIRECT_URL = 'http://127.0.0.1:36850/login?code=a&state=s';

describe('runSpotifyConnect', () => {
	it('starts the capture before opening the browser and connects with the captured URL', async () => {
		const order: Array<string> = [];
		const status = {connected: true, displayName: 'rafael'};
		const connect = vi.fn(async () => status);
		const onAuthorizeUrl = vi.fn();
		const outcome = await runSpotifyConnect({
			startAuthorize: async () => ({url: AUTHORIZE_URL}),
			capture: async () => {
				order.push('capture');
				return REDIRECT_URL;
			},
			openUrl: (url) => {
				order.push(`open ${url}`);
			},
			connect,
			onAuthorizeUrl,
		});
		expect(order).toEqual(['capture', `open ${AUTHORIZE_URL}`]);
		expect(onAuthorizeUrl).toHaveBeenCalledWith(AUTHORIZE_URL);
		expect(connect).toHaveBeenCalledWith(REDIRECT_URL);
		expect(outcome).toEqual({kind: 'connected', status});
	});

	it('asks for the pasted address outside the desktop app', async () => {
		const connect = vi.fn();
		const openUrl = vi.fn();
		const outcome = await runSpotifyConnect({
			startAuthorize: async () => ({url: AUTHORIZE_URL}),
			capture: null,
			openUrl,
			connect,
		});
		expect(openUrl).toHaveBeenCalledWith(AUTHORIZE_URL);
		expect(connect).not.toHaveBeenCalled();
		expect(outcome).toEqual({kind: 'paste', authorizeUrl: AUTHORIZE_URL});
	});

	it('asks for the pasted address when the capture gives nothing or fails', async () => {
		for (const capture of [async () => null, async () => Promise.reject(new Error('ipc'))]) {
			const connect = vi.fn();
			const outcome = await runSpotifyConnect({
				startAuthorize: async () => ({url: AUTHORIZE_URL}),
				capture,
				openUrl: () => {},
				connect,
			});
			expect(connect).not.toHaveBeenCalled();
			expect(outcome).toEqual({kind: 'paste', authorizeUrl: AUTHORIZE_URL});
		}
	});

	it('propagates authorize and connect errors', async () => {
		await expect(
			runSpotifyConnect({
				startAuthorize: async () => Promise.reject(new Error('down')),
				capture: null,
				openUrl: () => {},
				connect: vi.fn(),
			}),
		).rejects.toThrow('down');
		await expect(
			runSpotifyConnect({
				startAuthorize: async () => ({url: AUTHORIZE_URL}),
				capture: async () => REDIRECT_URL,
				openUrl: () => {},
				connect: async () => Promise.reject(new Error('INVALID_STATE')),
			}),
		).rejects.toThrow('INVALID_STATE');
	});

	it('still waits for the capture when opening the browser fails', async () => {
		const connect = vi.fn(async () => ({connected: true, displayName: 'x'}));
		const outcome = await runSpotifyConnect({
			startAuthorize: async () => ({url: AUTHORIZE_URL}),
			capture: async () => REDIRECT_URL,
			openUrl: async () => Promise.reject(new Error('no browser')),
			connect,
		});
		expect(outcome.kind).toBe('connected');
	});
});

describe('cleanPastedRedirect', () => {
	it('trims the pasted address and rejects empty input', () => {
		expect(cleanPastedRedirect(`  ${REDIRECT_URL}\n`)).toBe(REDIRECT_URL);
		expect(cleanPastedRedirect('   ')).toBeNull();
		expect(cleanPastedRedirect('')).toBeNull();
	});
});
