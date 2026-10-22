// SPDX-License-Identifier: AGPL-3.0-or-later

import {musicRowLabel, pickSidebarMusic} from '@app/features/music/MusicSidebarLabel';
import {describe, expect, it} from 'vitest';

describe('pickSidebarMusic', () => {
	const guildSessions = [{channelId: 'c1', nowPlaying: {title: 'Remote'}}];
	it('returns null when no session', () => {
		expect(pickSidebarMusic({channelId: 'c2', guildSessions, liveSession: undefined, available: true})).toBeNull();
	});
	it('uses the guild list', () => {
		expect(pickSidebarMusic({channelId: 'c1', guildSessions, liveSession: undefined, available: true})).toEqual({
			title: 'Remote',
		});
	});
	it('shows nothing while the music service is not available', () => {
		expect(pickSidebarMusic({channelId: 'c1', guildSessions, liveSession: undefined, available: false})).toBeNull();
		expect(
			pickSidebarMusic({channelId: 'c1', guildSessions, liveSession: {nowPlaying: null}, available: false}),
		).toBeNull();
	});
	it('prefers the live room state', () => {
		expect(
			pickSidebarMusic({channelId: 'c1', guildSessions, liveSession: {nowPlaying: {title: 'Live'}}, available: true}),
		).toEqual({
			title: 'Live',
		});
		expect(
			pickSidebarMusic({channelId: 'c2', guildSessions: [], liveSession: {nowPlaying: null}, available: true}),
		).toEqual({
			title: null,
		});
	});
});

describe('musicRowLabel', () => {
	it('formats with and without track', () => {
		expect(musicRowLabel('Song')).toBe('🎵 Música · Song');
		expect(musicRowLabel(null)).toBe('🎵 Música');
	});
});
