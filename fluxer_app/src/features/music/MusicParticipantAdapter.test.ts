// SPDX-License-Identifier: AGPL-3.0-or-later

// The voice engine's participant model assumes `user_*` identities; the channel music
// participant must stay out of it (its tile is drawn from MusicStore instead).

import {VoiceEngineV2AppParticipantAdapter} from '@app/features/voice/engine/v2/VoiceEngineV2AppParticipantAdapter';
import type {VoiceEngineV2Model} from '@fluxer/voice_engine_v2/src/protocol/types';
import type {VoiceEngineV2Controller} from '@fluxer/voice_engine_v2/src/runtime/VoiceEngineV2Controller';
import {type Participant, type Room, Track} from 'livekit-client';
import {describe, expect, it, vi} from 'vitest';

function fakeParticipant(identity: string, isLocal = false) {
	const publication = {
		source: Track.Source.Microphone,
		kind: Track.Kind.Audio,
		trackSid: `TR_${identity}`,
		trackName: 'microphone',
		isMuted: false,
	};
	return {
		identity,
		name: identity,
		sid: `PA_${identity}`,
		isLocal,
		isSpeaking: false,
		connectionQuality: 'good',
		metadata: undefined,
		attributes: {},
		audioTrackPublications: new Map([[publication.trackSid, publication]]),
		videoTrackPublications: new Map(),
		isMicrophoneEnabled: true,
		isCameraEnabled: false,
		isScreenShareEnabled: false,
		joinedAt: new Date(0),
	};
}

function createAdapter() {
	const ingest = vi.fn();
	const adapter = new VoiceEngineV2AppParticipantAdapter({
		controller: {} as VoiceEngineV2Controller,
		getModel: () => ({participants: []}) as unknown as VoiceEngineV2Model,
		ingest,
	});
	const joinedIdentities = () =>
		ingest.mock.calls
			.map(([event]) => event as {type: string; participant?: {identity: string}})
			.filter((event) => event.type === 'room.participantJoined')
			.map((event) => event.participant?.identity);
	return {adapter, ingest, joinedIdentities};
}

describe('music participant in the participant adapter', () => {
	it('upsertParticipant ignores music participants but keeps users', () => {
		const {adapter, ingest, joinedIdentities} = createAdapter();
		adapter.upsertParticipant(fakeParticipant('music_42') as unknown as Participant);
		expect(ingest).not.toHaveBeenCalled();
		adapter.upsertParticipant(fakeParticipant('user_1_conn') as unknown as Participant);
		expect(joinedIdentities()).toEqual(['user_1_conn']);
	});

	it('hydrateFromRoom skips a music participant already in the room', () => {
		const {adapter, joinedIdentities} = createAdapter();
		const music = fakeParticipant('music_42');
		const user = fakeParticipant('user_2_conn');
		adapter.hydrateFromRoom({
			localParticipant: fakeParticipant('user_9_me', true),
			remoteParticipants: new Map([
				[music.identity, music],
				[user.identity, user],
			]),
		} as unknown as Room);
		expect(joinedIdentities()).toEqual(['user_9_me', 'user_2_conn']);
	});
});
