// SPDX-License-Identifier: AGPL-3.0-or-later

import {isMusicIdentity, musicIdentityForChannel} from '@app/features/music/MusicIdentity';
import {describe, expect, it} from 'vitest';

describe('isMusicIdentity', () => {
	it('isMusicIdentity accepts music_123 and rejects user_1_x, music_, music_abc', () => {
		expect(isMusicIdentity('music_123')).toBe(true);
		expect(isMusicIdentity('user_1_x')).toBe(false);
		expect(isMusicIdentity('music_')).toBe(false);
		expect(isMusicIdentity('music_abc')).toBe(false);
		expect(isMusicIdentity('music_123_x')).toBe(false);
		expect(isMusicIdentity('xmusic_123')).toBe(false);
	});

	it('builds the identity of a channel music participant', () => {
		expect(musicIdentityForChannel('987')).toBe('music_987');
		expect(isMusicIdentity(musicIdentityForChannel('987'))).toBe(true);
	});
});
