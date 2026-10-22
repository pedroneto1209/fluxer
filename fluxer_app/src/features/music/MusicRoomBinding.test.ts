// SPDX-License-Identifier: AGPL-3.0-or-later

import {EventEmitter} from 'node:events';
import type {MusicSessionState} from '@app/features/music/MusicApi';
import {bindMusicRoom, MUSIC_DATA_TOPIC} from '@app/features/music/MusicRoomBinding';
import MusicStore from '@app/features/music/MusicStore';
import {MusicVolumeState} from '@app/features/music/MusicVolume';
import {ConnectionState, type Room, RoomEvent} from 'livekit-client';
import {observable, runInAction} from 'mobx';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/app/state/RuntimeConfig', () => ({default: {webAppEndpoint: 'http://localhost'}}));
vi.mock('@app/features/platform/state/AuthSession', () => ({default: {token: null}}));
vi.mock('@app/features/voice/state/VoiceSettings', () => ({default: {getOutputVolume: () => 100}}));

function wireState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		guild_id: 'g1',
		channel_id: '1',
		spotify_account: null,
		now_playing: null,
		paused: false,
		position_ms: 0,
		position_at: 0,
		queue: [],
		notice: null,
		revision: 3,
		...overrides,
	};
}

function encode(json: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(json));
}

class FakeRoom extends EventEmitter {
	state: ConnectionState = ConnectionState.Connected;
	remoteParticipants = new Map<string, unknown>();
}

function setup(
	options: {state?: ConnectionState; session?: MusicSessionState | null; ensureAvailable?: () => Promise<boolean>} = {},
) {
	const room = new FakeRoom();
	if (options.state) room.state = options.state;
	const volume = new MusicVolumeState(() => null);
	const applyToRoom = vi.spyOn(volume, 'applyToRoom');
	const getSession = vi.fn(async () => options.session ?? null);
	const outputVolume = observable.box(100);
	const ensureAvailable = vi.fn(options.ensureAvailable ?? (async () => true));
	const dispose = bindMusicRoom(room as unknown as Room, 'g1', '1', {
		ensureAvailable,
		getSession,
		volume,
		getOutputVolume: () => outputVolume.get(),
	});
	return {room, volume, applyToRoom, getSession, ensureAvailable, outputVolume, dispose};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('bindMusicRoom', () => {
	beforeEach(() => {
		MusicStore.clearChannel('1');
	});

	it('applies state data messages from the music participant', () => {
		const {room} = setup();
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, MUSIC_DATA_TOPIC);
		expect(MusicStore.sessionByChannel.get('1')?.revision).toBe(3);
	});

	it('ignores other topics, non-music senders, other channels and garbage', () => {
		const {room} = setup();
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, 'other.topic');
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'user_1_x'}, undefined, MUSIC_DATA_TOPIC);
		room.emit(RoomEvent.DataReceived, encode(wireState()), undefined, undefined, MUSIC_DATA_TOPIC);
		// Another channel's music identity cannot push this channel's state.
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_2'}, undefined, MUSIC_DATA_TOPIC);
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_11'}, undefined, MUSIC_DATA_TOPIC);
		room.emit(
			RoomEvent.DataReceived,
			encode(wireState({channel_id: '2'})),
			{identity: 'music_2'},
			undefined,
			MUSIC_DATA_TOPIC,
		);
		room.emit(
			RoomEvent.DataReceived,
			new TextEncoder().encode('{nope'),
			{identity: 'music_1'},
			undefined,
			MUSIC_DATA_TOPIC,
		);
		expect(MusicStore.sessionByChannel.has('1')).toBe(false);
		expect(MusicStore.sessionByChannel.has('2')).toBe(false);
	});

	it('fetches the initial state when the room is already connected', async () => {
		const session = {guildId: 'g1', channelId: '1', revision: 9} as MusicSessionState;
		const {getSession} = setup({session});
		await flush();
		expect(getSession).toHaveBeenCalledWith('g1', '1');
		expect(MusicStore.sessionByChannel.get('1')?.revision).toBe(9);
	});

	it('does not request the session on instances without the music service', async () => {
		const {room, getSession, ensureAvailable} = setup({ensureAvailable: async () => false});
		await flush();
		room.emit(RoomEvent.Reconnected);
		room.emit(RoomEvent.ParticipantConnected, {identity: 'music_1'});
		await flush();
		expect(ensureAvailable).toHaveBeenCalledTimes(3);
		expect(getSession).not.toHaveBeenCalled();
	});

	it('waits for an in-flight availability check before fetching the session', async () => {
		let release!: (available: boolean) => void;
		const pending = new Promise<boolean>((resolve) => (release = resolve));
		const session = {guildId: 'g1', channelId: '1', revision: 7} as MusicSessionState;
		const {getSession} = setup({session, ensureAvailable: () => pending});
		await flush();
		expect(getSession).not.toHaveBeenCalled();
		release(true);
		await flush();
		expect(getSession).toHaveBeenCalledTimes(1);
		expect(MusicStore.sessionByChannel.get('1')?.revision).toBe(7);
	});

	it('does not fetch the session when left during the availability check', async () => {
		let release!: (available: boolean) => void;
		const pending = new Promise<boolean>((resolve) => (release = resolve));
		const {getSession, dispose} = setup({ensureAvailable: () => pending});
		dispose();
		release(true);
		await flush();
		expect(getSession).not.toHaveBeenCalled();
	});

	it('waits for the connection before fetching the initial state', async () => {
		const {room, getSession} = setup({state: ConnectionState.Connecting});
		await flush();
		expect(getSession).not.toHaveBeenCalled();
		room.emit(RoomEvent.Connected);
		await flush();
		expect(getSession).toHaveBeenCalledTimes(1);
	});

	it('refetches the state when the channel music participant (re)connects', async () => {
		const session = {guildId: 'g1', channelId: '1', revision: 2} as MusicSessionState;
		const {room, getSession} = setup({session});
		await flush();
		expect(getSession).toHaveBeenCalledTimes(1);
		room.emit(RoomEvent.ParticipantConnected, {identity: 'user_1_x'});
		room.emit(RoomEvent.ParticipantConnected, {identity: 'music_2'});
		await flush();
		expect(getSession).toHaveBeenCalledTimes(1);
		room.emit(RoomEvent.ParticipantConnected, {identity: 'music_1'});
		await flush();
		expect(getSession).toHaveBeenCalledTimes(2);
	});

	it('ignores another channel music participant leaving', () => {
		const {room} = setup();
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, MUSIC_DATA_TOPIC);
		room.emit(RoomEvent.ParticipantDisconnected, {identity: 'music_2'});
		expect(MusicStore.sessionByChannel.has('1')).toBe(true);
	});

	it('clears the channel state when the music participant leaves', () => {
		const {room} = setup();
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, MUSIC_DATA_TOPIC);
		room.emit(RoomEvent.ParticipantDisconnected, {identity: 'user_1_x'});
		expect(MusicStore.sessionByChannel.has('1')).toBe(true);
		room.emit(RoomEvent.ParticipantDisconnected, {identity: 'music_1'});
		expect(MusicStore.sessionByChannel.has('1')).toBe(false);
		// A new session restarting at a low revision is accepted again.
		room.emit(
			RoomEvent.DataReceived,
			encode(wireState({revision: 1})),
			{identity: 'music_1'},
			undefined,
			MUSIC_DATA_TOPIC,
		);
		expect(MusicStore.sessionByChannel.get('1')?.revision).toBe(1);
	});

	it('clears the channel state and stops listening when leaving the call', () => {
		const {room, dispose} = setup();
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, MUSIC_DATA_TOPIC);
		dispose();
		expect(MusicStore.sessionByChannel.has('1')).toBe(false);
		room.emit(RoomEvent.DataReceived, encode(wireState()), {identity: 'music_1'}, undefined, MUSIC_DATA_TOPIC);
		expect(MusicStore.sessionByChannel.has('1')).toBe(false);
	});

	it('does not apply a late initial fetch after leaving the call', async () => {
		const session = {guildId: 'g1', channelId: '1', revision: 9} as MusicSessionState;
		const {dispose} = setup({session});
		dispose();
		await flush();
		expect(MusicStore.sessionByChannel.has('1')).toBe(false);
	});

	it('applies the music volume on bind, on music track subscribe and on volume change', () => {
		const {room, volume, applyToRoom} = setup();
		expect(applyToRoom).toHaveBeenCalledTimes(1);
		room.emit(RoomEvent.TrackSubscribed, {}, {}, {identity: 'user_1_x'});
		expect(applyToRoom).toHaveBeenCalledTimes(1);
		// Another channel's music identity is not this call's music participant.
		room.emit(RoomEvent.TrackSubscribed, {}, {}, {identity: 'music_2'});
		expect(applyToRoom).toHaveBeenCalledTimes(1);
		room.emit(RoomEvent.TrackSubscribed, {}, {}, {identity: 'music_1'});
		expect(applyToRoom).toHaveBeenCalledTimes(2);
		volume.setVolume(0.9);
		expect(applyToRoom).toHaveBeenCalledTimes(3);
		volume.toggleMuted();
		expect(applyToRoom).toHaveBeenCalledTimes(4);
		expect(applyToRoom).toHaveBeenLastCalledWith(room, 100);
	});

	it('reapplies the music volume when the global output volume changes', () => {
		const {room, applyToRoom, outputVolume} = setup();
		expect(applyToRoom).toHaveBeenLastCalledWith(room, 100);
		runInAction(() => outputVolume.set(40));
		expect(applyToRoom).toHaveBeenCalledTimes(2);
		expect(applyToRoom).toHaveBeenLastCalledWith(room, 40);
	});

	it('stops reacting to volume changes after leaving', () => {
		const {volume, applyToRoom, dispose} = setup();
		dispose();
		volume.setVolume(0.1);
		expect(applyToRoom).toHaveBeenCalledTimes(1);
	});
});
