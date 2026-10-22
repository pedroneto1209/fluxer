// SPDX-License-Identifier: AGPL-3.0-or-later

// Read-only "peek" at a call's music for people who are not in it: current track, progress,
// what comes next and a button to join the call. Opened from the "🎵 Música" row of the sidebar.

import type {Channel} from '@app/features/channel/models/Channel';
import {isOtherTriggerClick, moveFromOtherTrigger, TRIGGER_ATTRIBUTE} from '@app/features/music/MusicBalloon';
import {MUSIC_BALLOON_KEY} from '@app/features/music/MusicBalloonState';
import {describeMusicProgress} from '@app/features/music/MusicPanelStateMachine';
import {AddedBy, Artwork, SourceTag} from '@app/features/music/MusicParts';
import styles from '@app/features/music/MusicPeekBalloon.module.css';
import {joinToListenLabel, type PeekTrack, peekView} from '@app/features/music/MusicPeekModel';
import {startPeekPolling} from '@app/features/music/MusicPeekPolling';
import MusicStore from '@app/features/music/MusicStore';
import Permission from '@app/features/permissions/state/Permission';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import {usePendingVoiceConnection} from '@app/features/voice/hooks/usePendingVoiceConnection';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React, {useCallback, useEffect, useState} from 'react';

function PeekRow({track}: {track: PeekTrack}) {
	return (
		<li className={styles.upNextItem} data-flx="music.peek-balloon.up-next-item">
			<Artwork url={track.artworkUrl} size="small" data-flx="music.peek-balloon.up-next-artwork" />
			<span className={styles.text} data-flx="music.peek-balloon.up-next-text">
				<span className={styles.title} title={track.title} data-flx="music.peek-balloon.up-next-title">
					{track.title}
				</span>
				<span className={styles.artist} title={track.artist} data-flx="music.peek-balloon.up-next-artist">
					{track.artist}
				</span>
			</span>
			<SourceTag source={track.source} recommended={track.recommended} data-flx="music.peek-balloon.up-next-tag" />
		</li>
	);
}

export const MusicPeekBalloon = observer(function MusicPeekBalloon({
	guildId,
	channel,
}: {
	guildId: string;
	channel: Channel;
}) {
	const [now, setNow] = useState(() => Date.now());
	const session = MusicStore.guildSessions.get(guildId)?.find((entry) => entry.channelId === channel.id);
	const view = peekView(session, now);
	const ticking = view != null && !view.paused;
	const {startConnection} = usePendingVoiceConnection({guildId, channelId: channel.id});
	const canConnect = Permission.can(Permissions.CONNECT, channel);

	useEffect(() => startPeekPolling(() => MusicStore.refreshGuildSessions(guildId)), [guildId]);
	useEffect(() => {
		if (!ticking) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [ticking]);

	const progress = view ? describeMusicProgress(view.positionMs, view.durationMs) : null;
	return (
		<div className={styles.balloon} role="dialog" aria-label="Música" data-flx="music.peek-balloon">
			{view && progress ? (
				<>
					<div className={styles.current} data-flx="music.peek-balloon.current">
						<Artwork url={view.current.artworkUrl} size="large" data-flx="music.peek-balloon.artwork" />
						<span className={styles.text} data-flx="music.peek-balloon.text">
							<span className={styles.title} title={view.current.title} data-flx="music.peek-balloon.title">
								{view.current.title}
							</span>
							<span className={styles.artist} title={view.current.artist} data-flx="music.peek-balloon.artist">
								{view.current.artist}
							</span>
							{view.current.addedBy && <AddedBy userId={view.current.addedBy} data-flx="music.peek-balloon.added-by" />}
						</span>
					</div>
					<div className={styles.progress} data-flx="music.peek-balloon.progress">
						<span data-flx="music.peek-balloon.elapsed">{progress.elapsed}</span>
						<div
							className={clsx(styles.progressBar, progress.fraction == null && styles.progressIndeterminate)}
							role="progressbar"
							aria-label="Progresso da música"
							aria-valuemin={progress.fraction == null ? undefined : 0}
							aria-valuemax={progress.fraction == null ? undefined : 100}
							aria-valuenow={progress.fraction == null ? undefined : Math.round(progress.fraction * 100)}
							data-flx="music.peek-balloon.progress-bar"
						>
							{progress.fraction != null && (
								<div
									className={styles.progressFill}
									style={{width: `${progress.fraction * 100}%`}}
									data-flx="music.peek-balloon.progress-fill"
								/>
							)}
						</div>
						{progress.total && <span data-flx="music.peek-balloon.total">{progress.total}</span>}
					</div>
					{view.upNext.length > 0 && (
						<>
							<h3 className={styles.sectionTitle} data-flx="music.peek-balloon.up-next-title-heading">
								A seguir
							</h3>
							<ul className={styles.upNext} data-flx="music.peek-balloon.up-next">
								{view.upNext.map((track) => (
									<PeekRow key={track.id} track={track} />
								))}
							</ul>
						</>
					)}
				</>
			) : (
				<p className={styles.muted} data-flx="music.peek-balloon.idle">
					Nada tocando agora.
				</p>
			)}
			<button
				type="button"
				className={styles.join}
				disabled={!canConnect}
				onClick={() => startConnection()}
				data-flx="music.peek-balloon.join"
			>
				{joinToListenLabel(channel.name ?? '')}
			</button>
		</div>
	);
});

interface MusicPeekPopoutProps {
	guildId: string;
	channel: Channel;
	children: React.ReactElement<Record<string, unknown>>;
}

/** Makes `children` (a button) open the peek; shares the balloon's key so only one is ever open. */
export function MusicPeekPopout({guildId, channel, children}: MusicPeekPopoutProps) {
	const render = useCallback(
		() => <MusicPeekBalloon guildId={guildId} channel={channel} data-flx="music.peek-popout.balloon" />,
		[guildId, channel],
	);
	return (
		<Popout
			uniqueId={MUSIC_BALLOON_KEY}
			position="right"
			offsetMainAxis={8}
			render={render}
			onCloseRequest={(event) => !isOtherTriggerClick(event)}
			shouldOpenOnClick={moveFromOtherTrigger}
			data-flx="music.peek-popout.popout"
		>
			{React.cloneElement(children, {[TRIGGER_ATTRIBUTE]: 'true'})}
		</Popout>
	);
}
