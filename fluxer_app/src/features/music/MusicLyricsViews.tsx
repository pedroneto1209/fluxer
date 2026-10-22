// SPDX-License-Identifier: AGPL-3.0-or-later

// Lyrics on screen: the "letreiro" over the blurred artwork of the call tile, the "Letra" tab
// of the balloon and the button that turns lyrics on and off for this user.

import type {MusicSessionState} from '@app/features/music/MusicApi';
import {currentLineIndex, lyricsWindow, type MusicLyrics} from '@app/features/music/MusicLyricsModel';
import musicLyrics from '@app/features/music/MusicLyricsStore';
import styles from '@app/features/music/MusicLyricsViews.module.css';
import {IconButton} from '@app/features/music/MusicParts';
import MusicStore from '@app/features/music/MusicStore';
import {Scroller} from '@app/features/ui/components/Scroller';
import {MicrophoneStageIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef, useState} from 'react';

const TICK_MS = 200;

function prefersReducedMotion(): boolean {
	return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** The lyrics of the session's current track (fetched once per track), or null when nothing plays. */
export function useCurrentLyrics(session: MusicSessionState | null | undefined): MusicLyrics | 'loading' | null {
	const track = session?.nowPlaying ?? null;
	const guildId = session?.guildId;
	const channelId = session?.channelId;
	const source = track?.source;
	const sourceId = track?.sourceId;
	useEffect(() => {
		if (guildId && channelId && source && sourceId) musicLyrics.ensure(guildId, channelId, source, sourceId);
	}, [guildId, channelId, source, sourceId]);
	if (!track) return null;
	return musicLyrics.lyricsOf(track.source, track.sourceId);
}

/** Index of the line being sung, re-evaluated a few times a second while the track plays. */
function useCurrentLineIndex(session: MusicSessionState, lyrics: MusicLyrics | 'loading' | null): number {
	const synced = lyrics !== null && lyrics !== 'loading' && lyrics.kind === 'synced' ? lyrics : null;
	// The tick only re-renders; the position is always read at render time, so the first render
	// after a resume or a new state is never computed from a stale clock.
	const [, setTick] = useState(0);
	const ticking = synced !== null && !session.paused;
	useEffect(() => {
		if (!ticking) return;
		const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
		return () => window.clearInterval(timer);
	}, [ticking]);
	if (!synced) return -1;
	return currentLineIndex(synced.lines, MusicStore.currentPositionMs(session.channelId, Date.now()));
}

export const MusicLyricsToggle = observer(function MusicLyricsToggle({'data-flx': dataFlx}: {'data-flx': string}) {
	const enabled = musicLyrics.enabled;
	return (
		<span className={clsx(styles.toggle, enabled && styles.toggleOn)} data-flx={`${dataFlx}.wrap`}>
			<IconButton
				label={enabled ? 'Ocultar letra' : 'Mostrar letra'}
				icon={<MicrophoneStageIcon weight={enabled ? 'fill' : 'regular'} data-flx={`${dataFlx}.icon`} />}
				onClick={musicLyrics.toggleEnabled}
				data-flx={dataFlx}
			/>
		</span>
	);
});

/**
 * The tile's letreiro, shown in place of the artwork while lyrics are on and synced. Null
 * otherwise (the tile keeps its normal look; `MusicTileLyricsNotice` covers "no lyrics").
 */
export const MusicTileLyrics = observer(function MusicTileLyrics({
	session,
	lyrics,
}: {
	session: MusicSessionState;
	lyrics: MusicLyrics | 'loading' | null;
}) {
	const index = useCurrentLineIndex(session, lyrics);
	if (!musicLyrics.enabled || lyrics === null || lyrics === 'loading' || lyrics.kind !== 'synced') return null;
	const track = session.nowPlaying;
	return (
		<div className={styles.letreiro} aria-live="off" data-flx="music.tile-lyrics">
			<div className={styles.lines} data-flx="music.tile-lyrics.lines">
				{lyricsWindow(lyrics.lines, index).map((line) => (
					<p
						key={line.key}
						className={clsx(styles.line, styles[line.role])}
						data-flx={`music.tile-lyrics.line.${line.role}`}
					>
						{line.text || '♪'}
					</p>
				))}
			</div>
			{track && (
				<p className={styles.caption} data-flx="music.tile-lyrics.caption">
					{track.title}
					{track.artist ? ` · ${track.artist}` : ''}
				</p>
			)}
		</div>
	);
});

/** True when the tile should show the letreiro instead of the artwork. */
export function tileShowsLyrics(lyrics: MusicLyrics | 'loading' | null): boolean {
	return musicLyrics.enabled && lyrics !== null && lyrics !== 'loading' && lyrics.kind === 'synced';
}

/** "Sem letra" chip of the tile: only once the lookup confirmed there is nothing to follow. */
export const MusicTileLyricsNotice = observer(function MusicTileLyricsNotice({
	lyrics,
}: {
	lyrics: MusicLyrics | 'loading' | null;
}) {
	if (!musicLyrics.enabled || lyrics === null || lyrics === 'loading' || lyrics.kind !== 'none') return null;
	return (
		<span className={styles.notice} data-flx="music.tile-lyrics.notice">
			Sem letra para esta música
		</span>
	);
});

/** The balloon's "Letra" tab: the whole lyrics, following the current line when synced. */
export const MusicLyricsTab = observer(function MusicLyricsTab({session}: {session: MusicSessionState | null}) {
	const lyrics = useCurrentLyrics(session);
	if (!session || lyrics === null) {
		return (
			<p className={styles.muted} data-flx="music.lyrics-tab.idle">
				Nada tocando agora.
			</p>
		);
	}
	if (lyrics === 'loading') {
		return (
			<p className={styles.muted} data-flx="music.lyrics-tab.loading">
				Carregando letra…
			</p>
		);
	}
	if (lyrics.kind === 'none') {
		return (
			<p className={styles.muted} data-flx="music.lyrics-tab.none">
				Sem letra para esta música.
			</p>
		);
	}
	return (
		<Scroller className={styles.tabScroller} fade data-flx="music.lyrics-tab.scroller">
			{lyrics.kind === 'plain' ? (
				<p className={styles.plain} data-flx="music.lyrics-tab.plain">
					{lyrics.text}
				</p>
			) : (
				<SyncedLyricsList session={session} lyrics={lyrics} />
			)}
		</Scroller>
	);
});

const SyncedLyricsList = observer(function SyncedLyricsList({
	session,
	lyrics,
}: {
	session: MusicSessionState;
	lyrics: Extract<MusicLyrics, {kind: 'synced'}>;
}) {
	const index = useCurrentLineIndex(session, lyrics);
	const currentRef = useRef<HTMLLIElement | null>(null);
	useEffect(() => {
		currentRef.current?.scrollIntoView({block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth'});
	}, [index]);
	return (
		<ol className={styles.tabLines} data-flx="music.lyrics-tab.lines">
			{lyrics.lines.map((line, i) => (
				<li
					key={i}
					ref={i === index ? currentRef : undefined}
					className={clsx(styles.tabLine, i === index && styles.tabLineCurrent, i < index && styles.tabLinePast)}
					data-flx="music.lyrics-tab.line"
				>
					{line.text || '♪'}
				</li>
			))}
		</ol>
	);
});
