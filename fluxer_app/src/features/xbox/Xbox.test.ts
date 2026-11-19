// SPDX-License-Identifier: AGPL-3.0-or-later

import type {VoiceGridEntry} from '@app/features/voice/components/VoiceParticipantConsolidation';
import {parseXboxStatus, type XboxStatus} from '@app/features/xbox/XboxApi';
import {isXboxIdentity, xboxIdentityForChannel} from '@app/features/xbox/XboxIdentity';
import {type Participant, Track} from 'livekit-client';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/voice/engine/MediaEngineFacade', () => ({default: {room: null}}));
vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'https://chat.example'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: 'tok'}}));
vi.mock('@app/features/ui/state/MobileLayout', () => ({default: {enabled: false}}));
vi.mock('@app/features/voice/engine/mesh/VoiceMeshRoom', () => ({isVoiceMeshRoom: () => false}));
vi.mock('@app/features/ui/tooltip/Tooltip', () => ({Tooltip: () => null}));
vi.mock('@app/features/ui/components/FocusRingWrapper', () => ({FocusRingWrapper: () => null}));
vi.mock('@app/features/ui/commands/ToastCommands', () => ({error: vi.fn(), success: vi.fn(), createToast: vi.fn()}));

const {withXboxGridEntry, xboxParticipantFromGridEntry} = await import('@app/features/xbox/XboxGridEntry');
const {xboxButtonMode} = await import('@app/features/xbox/XboxControlBarButton');

function participant(identity: string, sources: Array<Track.Source>): Participant {
	const pubs = new Map(sources.map((source, i) => [`TR_${i}`, {source}]));
	return {identity, trackPublications: pubs} as unknown as Participant;
}

function userEntry(identity: string): VoiceGridEntry {
	return {
		kind: 'track',
		key: `${identity}-camera`,
		trackRef: {participant: {identity} as Participant, source: Track.Source.Camera},
		hiddenConnectionCount: 0,
		deviceConnectionCount: 1,
		isDeviceGroupExpanded: false,
		userId: '1',
	};
}

describe('Xbox identity', () => {
	it('matches only xbox_<channel id>', () => {
		expect(xboxIdentityForChannel('42')).toBe('xbox_42');
		expect(isXboxIdentity('xbox_42')).toBe(true);
		expect(isXboxIdentity('xbox_')).toBe(false);
		expect(isXboxIdentity('user_1_xbox_42')).toBe(false);
		expect(isXboxIdentity('music_42')).toBe(false);
	});
});

describe('Xbox grid entry', () => {
	it('is added first while the Xbox shares its screen', () => {
		const xbox = participant('xbox_42', [Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
		const entries = withXboxGridEntry([userEntry('user_1_a')], xbox);
		expect(entries).toHaveLength(2);
		expect(xboxParticipantFromGridEntry(entries[0]!)).toBe(xbox);
		expect(xboxParticipantFromGridEntry(entries[1]!)).toBeNull();
	});

	it('is not added before the screen share is published', () => {
		const entries = [userEntry('user_1_a')];
		expect(withXboxGridEntry(entries, participant('xbox_42', []))).toBe(entries);
		expect(withXboxGridEntry(entries, undefined)).toBe(entries);
	});
});

describe('parseXboxStatus', () => {
	it('reads what the service sends', () => {
		const status = parseXboxStatus({
			canControl: true,
			account: {signedIn: true, gamertag: 'PEPEOU8876', pendingLogin: {userCode: 'ABC', verificationUri: 'https://x'}},
			stream: {state: 'live', guildId: '1', channelId: '2', console: 'XBOX', startedAt: '2026-11-19T00:00:00Z'},
		});
		expect(status).toEqual<XboxStatus>({
			canControl: true,
			signedIn: true,
			gamertag: 'PEPEOU8876',
			pendingLogin: {userCode: 'ABC', verificationUri: 'https://x'},
			stream: {state: 'live', step: null, guildId: '1', channelId: '2', console: 'XBOX', error: null, ended: null},
		});
	});

	it('rejects anything else (e.g. the web app answering at /xbox)', () => {
		expect(parseXboxStatus('<html>')).toBeNull();
		expect(parseXboxStatus({account: {}, stream: {state: 'weird'}})).toBeNull();
		expect(parseXboxStatus({account: {signedIn: false}, stream: {state: 'idle'}})?.canControl).toBe(false);
	});
});

describe('xboxButtonMode', () => {
	const base = (stream: Partial<XboxStatus['stream']>, rest: Partial<XboxStatus> = {}): XboxStatus => ({
		canControl: true,
		signedIn: true,
		gamertag: null,
		pendingLogin: null,
		stream: {
			state: 'idle',
			step: null,
			guildId: null,
			channelId: null,
			console: null,
			error: null,
			ended: null,
			...stream,
		},
		...rest,
	});

	it('is hidden for everyone but the owner, and outside calls', () => {
		expect(xboxButtonMode(base({}, {canControl: false}), '1', '2')).toBe('hidden');
		expect(xboxButtonMode(base({}), null, null)).toBe('hidden');
		expect(xboxButtonMode(null, '1', '2')).toBe('hidden');
	});

	it('follows the stream', () => {
		expect(xboxButtonMode(base({}, {signedIn: false}), '1', '2')).toBe('signIn');
		expect(xboxButtonMode(base({}), '1', '2')).toBe('start');
		expect(xboxButtonMode(base({state: 'error', channelId: '2'}), '1', '2')).toBe('start');
		expect(xboxButtonMode(base({state: 'starting', channelId: '2'}), '1', '2')).toBe('starting');
		expect(xboxButtonMode(base({state: 'live', channelId: '2'}), '1', '2')).toBe('stop');
		expect(xboxButtonMode(base({state: 'live', channelId: '3'}), '1', '2')).toBe('elsewhere');
	});
});
