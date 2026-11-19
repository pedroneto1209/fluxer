// SPDX-License-Identifier: AGPL-3.0-or-later

// The call grid only renders `user_*` participants. While the Xbox participant shares a
// screen in the call it gets one extra grid entry (rendered as XboxTile), placed first
// like the music tile: the grid hides the last entries when they do not fit.

import type {VoiceGridEntry} from '@app/features/voice/components/VoiceParticipantConsolidation';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {isXboxIdentity, xboxIdentityForChannel} from '@app/features/xbox/XboxIdentity';
import {type Participant, Track} from 'livekit-client';
import {useMemo} from 'react';

const XBOX_GRID_KEY_PREFIX = 'xbox-tile:';

function sharesScreen(participant: Participant): boolean {
	for (const publication of participant.trackPublications.values()) {
		if (publication.source === Track.Source.ScreenShare) return true;
	}
	return false;
}

export function withXboxGridEntry(
	entries: Array<VoiceGridEntry>,
	participant: Participant | null | undefined,
): Array<VoiceGridEntry> {
	if (!participant || !sharesScreen(participant)) return entries;
	const entry: VoiceGridEntry = {
		kind: 'track',
		key: `${XBOX_GRID_KEY_PREFIX}${participant.identity}`,
		trackRef: {participant, source: Track.Source.ScreenShare},
		hiddenConnectionCount: 0,
		deviceConnectionCount: 1,
		isDeviceGroupExpanded: false,
		userId: null,
	};
	return [entry, ...entries];
}

/** The Xbox participant of an Xbox tile entry, or null for any other grid entry. */
export function xboxParticipantFromGridEntry(entry: VoiceGridEntry): Participant | null {
	if (!entry.key.startsWith(XBOX_GRID_KEY_PREFIX)) return null;
	const participant = entry.trackRef.participant;
	return isXboxIdentity(participant.identity) ? participant : null;
}

/**
 * Adds the Xbox tile to the call grid entries while the channel's Xbox participant shares
 * its screen. Call from an observer (the grid re-renders on LiveKit participant and track
 * events, which is when the Xbox shows up or leaves).
 */
export function useXboxGridEntries(entries: Array<VoiceGridEntry>, channelId: string): Array<VoiceGridEntry> {
	const participant = MediaEngine.room?.remoteParticipants.get(xboxIdentityForChannel(channelId));
	const live = participant ? sharesScreen(participant) : false;
	return useMemo(() => withXboxGridEntry(entries, participant), [entries, participant, live]);
}
