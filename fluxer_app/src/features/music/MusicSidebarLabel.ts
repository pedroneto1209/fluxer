// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SidebarMusic {
	title: string | null;
}

interface SessionLike {
	nowPlaying: {title: string} | null;
}

/**
 * Decides what the sidebar shows under a voice channel. `liveSession` is the state received
 * from the room (only present when you are in that channel) and is fresher than the polled list.
 * Nothing shows while the music service is not available: the polled list may be stale.
 */
export function pickSidebarMusic(args: {
	channelId: string;
	guildSessions: ReadonlyArray<SessionLike & {channelId: string}> | undefined;
	liveSession: SessionLike | undefined;
	available: boolean;
}): SidebarMusic | null {
	if (!args.available) return null;
	const session = args.liveSession ?? args.guildSessions?.find((entry) => entry.channelId === args.channelId);
	if (!session) return null;
	return {title: session.nowPlaying?.title ?? null};
}

export function musicRowLabel(title: string | null): string {
	return title ? `🎵 Música · ${title}` : '🎵 Música';
}
