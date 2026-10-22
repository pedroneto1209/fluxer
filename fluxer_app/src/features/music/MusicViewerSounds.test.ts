// SPDX-License-Identifier: AGPL-3.0-or-later

// VoiceRoomEventBinder plays ViewerJoin/ViewerLeave for any non-`user_` identity; the
// channel music participant must not trigger them.

import {EventEmitter} from 'node:events';
import type {RoomEventDependencies} from '@app/features/voice/engine/VoiceRoomEventBinder';
import {ConnectionState, type Room, RoomEvent} from 'livekit-client';
import {describe, expect, it, vi} from 'vitest';

const playSound = vi.fn();

vi.mock('@app/features/notification/utils/SoundUtils', () => ({
	SoundType: {ViewerJoin: 'viewer-join', ViewerLeave: 'viewer-leave'},
}));
vi.mock('@app/features/ui/commands/SoundCommands', () => ({playSound}));
vi.mock('@app/features/voice/engine/mesh/VoiceMeshRoom', () => ({isVoiceMeshRoom: () => false}));
vi.mock('@app/features/voice/engine/ScreenShareCodecNegotiation', () => ({default: {}}));
vi.mock('@app/features/voice/engine/ScreenSharePublicationMigration', () => ({default: {}}));
vi.mock('@app/features/voice/engine/VoiceEffectiveAudioState', () => ({
	getEffectiveAudioState: () => ({effectiveDeaf: false}),
}));
vi.mock('@app/features/voice/engine/VoiceIdleActivityBridge', () => ({noteLocalVoiceActivity: vi.fn()}));
vi.mock('@app/features/voice/engine/VoiceMediaGraphStore', () => ({voiceMediaGraphStore: {}}));
vi.mock('@app/features/voice/engine/VoiceSelfJoinChime', () => ({
	playSelfJoinChimeOnce: vi.fn(),
	startVoiceJoinChimeSequence: vi.fn(),
}));
vi.mock('@app/features/voice/engine/VoiceStreamWatchState', () => ({
	cancelDeferredStopWatchingStreamKey: vi.fn(),
	deferStopWatchingStreamKey: vi.fn(),
	getStreamKeyForParticipantIdentity: () => null,
}));
vi.mock('@app/features/voice/state/ParticipantVolume', () => ({default: {}}));
vi.mock('@app/features/voice/state/ScreenShareWatchFailures', () => ({
	ScreenShareWatchErrorCode: {},
	ScreenShareWatchFailures: {},
}));
vi.mock('@app/features/voice/utils/ScreenShareCodecDiagnostics', () => ({monitorScreenShareDecodeHealth: vi.fn()}));
vi.mock('@app/features/voice/utils/VideoDecoderCapabilities', () => ({markScreenShareDecodeFailure: vi.fn()}));

const {bindRoomEvents} = await import('@app/features/voice/engine/VoiceRoomEventBinder');

// Every dependency is a no-op spy; only the participant join/leave wiring is exercised.
function stubDependencies(): RoomEventDependencies {
	const group = (): Record<string, unknown> =>
		new Proxy({} as Record<string, unknown>, {get: (target, key: string) => (target[key] ??= vi.fn())});
	const connection = group();
	connection.createGuardedHandler =
		(_attemptId: number, handler: (...args: Array<unknown>) => unknown) =>
		(...args: Array<unknown>) =>
			void handler(...args);
	connection.isDisconnecting = () => false;
	return new Proxy({connection} as Record<string, unknown>, {
		get: (target, key: string) => (target[key] ??= group()),
	}) as unknown as RoomEventDependencies;
}

function bindFakeRoom() {
	const room = Object.assign(new EventEmitter(), {
		state: ConnectionState.Disconnected,
		localParticipant: Object.assign(new EventEmitter(), {identity: 'user_9_me'}),
		remoteParticipants: new Map(),
	});
	bindRoomEvents(room as unknown as Room, 1, 'g1', 'c1', {} as never, stubDependencies());
	return room;
}

describe('viewer sounds', () => {
	it('does not play viewer join/leave sounds for the music participant', () => {
		const room = bindFakeRoom();
		playSound.mockClear();
		const music = Object.assign(new EventEmitter(), {identity: 'music_42'});
		room.emit(RoomEvent.ParticipantConnected, music);
		room.emit(RoomEvent.ParticipantDisconnected, music);
		expect(playSound).not.toHaveBeenCalled();
	});

	it('still plays them for other non-user participants', () => {
		const room = bindFakeRoom();
		playSound.mockClear();
		const viewer = Object.assign(new EventEmitter(), {identity: 'viewer_1'});
		room.emit(RoomEvent.ParticipantConnected, viewer);
		room.emit(RoomEvent.ParticipantDisconnected, viewer);
		expect(playSound).toHaveBeenNthCalledWith(1, 'viewer-join');
		expect(playSound).toHaveBeenNthCalledWith(2, 'viewer-leave');
	});
});
