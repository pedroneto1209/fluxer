// SPDX-License-Identifier: AGPL-3.0-or-later

import {appendMusicGridEntry, musicChannelIdFromGridEntry} from '@app/features/music/MusicGridEntry';
import type {VoiceGridEntry} from '@app/features/voice/components/VoiceParticipantConsolidation';
import type {Participant} from 'livekit-client';
import {describe, expect, it} from 'vitest';

function userEntry(identity: string): VoiceGridEntry {
	return {
		kind: 'track',
		key: `${identity}-camera`,
		trackRef: {participant: {identity} as Participant, source: 'camera'} as VoiceGridEntry['trackRef'],
		hiddenConnectionCount: 0,
		deviceConnectionCount: 1,
		isDeviceGroupExpanded: false,
		userId: identity.split('_')[1] ?? null,
	};
}

describe('appendMusicGridEntry', () => {
	it('appends one tile for the music participant after the people', () => {
		const entries = [userEntry('user_1_a'), userEntry('user_2_b')];
		const result = appendMusicGridEntry(entries, {identity: 'music_42'} as Participant);
		expect(result).toHaveLength(3);
		expect(result.slice(0, 2)).toEqual(entries);
		expect(result[2]?.userId).toBeNull();
		expect(result[2]?.trackRef.participant.identity).toBe('music_42');
		expect(entries).toHaveLength(2);
	});

	it('returns the same entries when there is no music participant', () => {
		const entries = [userEntry('user_1_a')];
		expect(appendMusicGridEntry(entries, null)).toBe(entries);
		expect(appendMusicGridEntry(entries, undefined)).toBe(entries);
	});
});

describe('musicChannelIdFromGridEntry', () => {
	it('recognises only the music tile', () => {
		const [, music] = appendMusicGridEntry([userEntry('user_1_a')], {identity: 'music_42'} as Participant);
		expect(music && musicChannelIdFromGridEntry(music)).toBe('42');
		expect(musicChannelIdFromGridEntry(userEntry('user_1_a'))).toBeNull();
		expect(musicChannelIdFromGridEntry({...userEntry('music_42'), key: 'music_42-camera'})).toBeNull();
	});
});
