// SPDX-License-Identifier: AGPL-3.0-or-later

// The call grid only renders `user_*` participants. The channel music participant gets
// one extra grid entry (rendered as MusicTile) so the grid sizes its tiles for it too.
// It goes first: the grid hides the last entries when they do not fit.

import {isMusicIdentity} from '@app/features/music/MusicIdentity';
import type {VoiceGridEntry} from '@app/features/voice/components/VoiceParticipantConsolidation';
import {type Participant, Track} from 'livekit-client';

const MUSIC_GRID_KEY_PREFIX = 'music-tile:';
const MUSIC_IDENTITY_PREFIX = 'music_';

export function withMusicGridEntry(
	entries: Array<VoiceGridEntry>,
	participant: Participant | null | undefined,
): Array<VoiceGridEntry> {
	if (!participant) return entries;
	const entry: VoiceGridEntry = {
		kind: 'track',
		key: `${MUSIC_GRID_KEY_PREFIX}${participant.identity}`,
		trackRef: {participant, source: Track.Source.Unknown},
		hiddenConnectionCount: 0,
		deviceConnectionCount: 1,
		isDeviceGroupExpanded: false,
		userId: null,
	};
	return [entry, ...entries];
}

/** The channel id of a music tile entry, or null for any other grid entry. */
export function musicChannelIdFromGridEntry(entry: VoiceGridEntry): string | null {
	if (!entry.key.startsWith(MUSIC_GRID_KEY_PREFIX)) return null;
	const identity = entry.trackRef.participant.identity;
	return isMusicIdentity(identity) ? identity.slice(MUSIC_IDENTITY_PREFIX.length) : null;
}
