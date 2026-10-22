// SPDX-License-Identifier: AGPL-3.0-or-later

// The channel music participant as a tile in the call grid: artwork (or a big note),
// title, artist and source, no controls. Clicking it opens the music panel.

import {isMusicUsableInCall} from '@app/features/music/MusicCall';
import {withMusicGridEntry} from '@app/features/music/MusicGridEntry';
import {musicIdentityForChannel} from '@app/features/music/MusicIdentity';
import MusicStore from '@app/features/music/MusicStore';
import styles from '@app/features/music/MusicTile.module.css';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import type {VoiceGridEntry} from '@app/features/voice/components/VoiceParticipantConsolidation';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {MusicNoteIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';

/**
 * Adds the music tile to the call grid entries while the channel has a music session and
 * its participant is in the room. Call from an observer.
 */
export function useMusicGridEntries(entries: Array<VoiceGridEntry>, channelId: string): Array<VoiceGridEntry> {
	const hasSession = MusicStore.sessionByChannel.has(channelId);
	const room = MediaEngine.room;
	// remoteParticipants is a plain LiveKit Map, not observable: a music participant joining or
	// leaving shows up here because the grid re-renders on LiveKit participant events (and the
	// session arriving over the data channel re-renders this observer).
	const participant = hasSession ? room?.remoteParticipants.get(musicIdentityForChannel(channelId)) : undefined;
	return useMemo(() => withMusicGridEntry(entries, participant), [entries, participant]);
}

const SOURCE_LABEL = {spotify: 'Spotify', youtube: 'YouTube'} as const;

export const MusicTile = observer(function MusicTile({channelId}: {channelId: string}) {
	const session = MusicStore.sessionByChannel.get(channelId);
	const track = session?.nowPlaying ?? null;
	const artworkUrl = track?.artworkUrl ?? null;
	const [artworkFailed, setArtworkFailed] = useState(false);
	useEffect(() => setArtworkFailed(false), [artworkUrl]);
	const canOpen = isMusicUsableInCall(channelId);
	const handleOpen = useCallback(() => {
		if (canOpen) MusicStore.openPanel();
	}, [canOpen]);
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			handleOpen();
		},
		[handleOpen],
	);
	const showArtwork = artworkUrl != null && !artworkFailed;
	const status = !track ? 'Nada tocando' : session?.paused ? 'Pausado' : null;
	const label = track ? `Música: ${track.title}${track.artist ? `, ${track.artist}` : ''}` : 'Música';
	return (
		<FocusRing offset={-2} data-flx="music.music-tile.focus-ring">
			<div
				className={clsx(styles.tile, canOpen && styles.clickable)}
				role="button"
				tabIndex={0}
				aria-label={canOpen ? `${label}. Abrir o painel de música` : label}
				aria-disabled={!canOpen}
				onClick={handleOpen}
				onKeyDown={handleKeyDown}
				data-paused={session?.paused ? 'true' : undefined}
				data-flx="music.music-tile"
			>
				{showArtwork && (
					<img
						className={styles.backdrop}
						src={artworkUrl}
						alt=""
						aria-hidden="true"
						referrerPolicy="no-referrer"
						data-flx="music.music-tile.backdrop"
					/>
				)}
				<div className={styles.content} data-flx="music.music-tile.content">
					{showArtwork ? (
						<img
							className={styles.artwork}
							src={artworkUrl}
							alt=""
							referrerPolicy="no-referrer"
							onError={() => setArtworkFailed(true)}
							data-flx="music.music-tile.artwork"
						/>
					) : (
						<div className={styles.placeholder} aria-hidden="true" data-flx="music.music-tile.placeholder">
							<MusicNoteIcon weight="fill" data-flx="music.music-tile.placeholder.icon" />
						</div>
					)}
					{track && (
						<div className={styles.text} data-flx="music.music-tile.text">
							<span className={styles.title} title={track.title} data-flx="music.music-tile.title">
								{track.title}
							</span>
							{track.artist && (
								<span className={styles.artist} title={track.artist} data-flx="music.music-tile.artist">
									{track.artist}
								</span>
							)}
						</div>
					)}
				</div>
				{track && (
					<span className={styles.source} data-flx="music.music-tile.source">
						{track.recommended ? 'Recomendada' : SOURCE_LABEL[track.source]}
					</span>
				)}
				<span className={styles.nameLabel} data-flx="music.music-tile.name-label">
					<MusicNoteIcon weight="fill" data-flx="music.music-tile.name-label.icon" />
					<span data-flx="music.music-tile.name-label.text">Música</span>
					{status && (
						<span className={styles.status} data-flx="music.music-tile.name-label.status">
							· {status}
						</span>
					)}
				</span>
			</div>
		</FocusRing>
	);
});
