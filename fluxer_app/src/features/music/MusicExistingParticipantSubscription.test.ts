// SPDX-License-Identifier: AGPL-3.0-or-later

// When we join a call where `music_<id>` is already publishing, LiveKit does not emit
// TrackPublished for it (the room is not connected yet). VoiceRoomEventBinder's
// RoomEvent.Connected handler calls permissions.applyDeafen(room, effectiveDeaf), which
// subscribes every remote Microphone publication regardless of identity. These tests pin
// that this path covers the music participant.

import {type Room, Track} from 'livekit-client';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@app/features/permissions/state/Permission', () => ({default: {}}));
vi.mock('@app/features/voice/engine/VoiceMediaEngineBridge', () => ({syncLocalVoiceStateWithServer: vi.fn()}));
vi.mock('@app/features/voice/utils/VideoBackgroundProcessor', () => ({clearCameraVideoProcessor: vi.fn()}));
vi.mock('@app/features/voice/utils/VoicePermissionUtils', () => ({getVoiceChannelPermissions: vi.fn()}));

const {default: voiceEngineV2AppPermissionAdapter} = await import(
	'@app/features/voice/engine/v2/VoiceEngineV2AppPermissionAdapter'
);

function roomWithMusic() {
	const publication = {
		source: Track.Source.Microphone,
		isDesired: false,
		setSubscribed: vi.fn(),
		setEnabled: vi.fn(),
	};
	const music = {
		identity: 'music_42',
		audioTrackPublications: new Map([['TR_1', publication]]),
		videoTrackPublications: new Map(),
	};
	const room = {remoteParticipants: new Map([[music.identity, music]])} as unknown as Room;
	return {room, publication};
}

describe('music participant already in the room on join', () => {
	it('subscribes its microphone publication when not deafened', () => {
		const {room, publication} = roomWithMusic();
		voiceEngineV2AppPermissionAdapter.applyDeafen(room, false);
		expect(publication.setSubscribed).toHaveBeenCalledWith(true);
	});

	it('keeps it unsubscribed while deafened', () => {
		const {room, publication} = roomWithMusic();
		voiceEngineV2AppPermissionAdapter.applyDeafen(room, true);
		expect(publication.setSubscribed).toHaveBeenCalledWith(false);
		expect(publication.setSubscribed).not.toHaveBeenCalledWith(true);
	});
});
