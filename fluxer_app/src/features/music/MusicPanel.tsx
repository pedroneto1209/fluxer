// SPDX-License-Identifier: AGPL-3.0-or-later

// Side panel of a voice call with the channel music: now playing, my volume, search or
// paste a link, the queue and "Encerrar música". It sits in the channel side panel slot
// (like the member list) or next to the call when the call fills the view.

import type {Channel} from '@app/features/channel/models/Channel';
import {type MusicSessionState, previous, setPaused, skip} from '@app/features/music/MusicApi';
import styles from '@app/features/music/MusicPanel.module.css';
import {describeMusicProgress} from '@app/features/music/MusicPanelStateMachine';
import {Artwork, IconButton, SourceTag} from '@app/features/music/MusicParts';
import {MusicQueueTab} from '@app/features/music/MusicQueueTab';
import {MusicSearchTab} from '@app/features/music/MusicSearchTab';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume from '@app/features/music/MusicVolume';
import {Scroller} from '@app/features/ui/components/Scroller';
import {
	MusicNoteIcon,
	PauseIcon,
	PlayIcon,
	SkipBackIcon,
	SkipForwardIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;

const NowPlaying = observer(function NowPlaying({
	session,
	run,
	pending,
}: {
	session: MusicSessionState;
	run: RunCommand;
	pending: boolean;
}) {
	const {guildId, channelId, nowPlaying, paused} = session;
	const [now, setNow] = useState(() => Date.now());
	const ticking = nowPlaying != null && !paused;
	useEffect(() => {
		if (!ticking) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [ticking]);
	const progress = describeMusicProgress(MusicStore.currentPositionMs(channelId, now), nowPlaying?.durationMs ?? 0);
	return (
		<section className={styles.section} aria-label="Tocando agora" data-flx="music.music-panel.now-playing">
			{nowPlaying ? (
				<div className={styles.nowPlaying} data-flx="music.music-panel.now-playing.track">
					<Artwork url={nowPlaying.artworkUrl} size="large" data-flx="music.music-panel.now-playing.artwork" />
					<div className={styles.trackText} data-flx="music.music-panel.now-playing.text">
						<span className={styles.nowTitle} title={nowPlaying.title} data-flx="music.music-panel.now-playing.title">
							{nowPlaying.title}
						</span>
						<span className={styles.artist} title={nowPlaying.artist} data-flx="music.music-panel.now-playing.artist">
							{nowPlaying.artist}
						</span>
						<SourceTag
							source={nowPlaying.source}
							recommended={nowPlaying.recommended}
							data-flx="music.music-panel.now-playing.tag"
						/>
					</div>
				</div>
			) : (
				<p className={styles.muted} data-flx="music.music-panel.now-playing.idle">
					Nada tocando agora.
				</p>
			)}
			{nowPlaying && (
				<div className={styles.progress} data-flx="music.music-panel.now-playing.progress">
					<div
						className={clsx(styles.progressBar, progress.fraction == null && styles.progressIndeterminate)}
						role="progressbar"
						aria-label="Progresso da música"
						aria-valuemin={progress.fraction == null ? undefined : 0}
						aria-valuemax={progress.fraction == null ? undefined : 100}
						aria-valuenow={progress.fraction == null ? undefined : Math.round(progress.fraction * 100)}
						data-flx="music.music-panel.now-playing.progress-bar"
					>
						{progress.fraction != null && (
							<div
								className={styles.progressFill}
								style={{width: `${progress.fraction * 100}%`}}
								data-flx="music.music-panel.now-playing.progress-fill"
							/>
						)}
					</div>
					<div className={styles.progressTimes} data-flx="music.music-panel.now-playing.progress-times">
						<span data-flx="music.music-panel.now-playing.elapsed">{progress.elapsed}</span>
						{progress.total && <span data-flx="music.music-panel.now-playing.total">{progress.total}</span>}
					</div>
				</div>
			)}
			<div className={styles.controls} data-flx="music.music-panel.now-playing.controls">
				<IconButton
					label="Voltar"
					disabled={pending}
					icon={<SkipBackIcon weight="fill" data-flx="music.music-panel.button.previous.icon" />}
					onClick={() => void run(() => previous(guildId, channelId))}
					data-flx="music.music-panel.button.previous"
				/>
				<IconButton
					label={paused ? 'Tocar' : 'Pausar'}
					primary
					disabled={pending || !nowPlaying}
					icon={
						paused ? (
							<PlayIcon weight="fill" data-flx="music.music-panel.button.play-pause.icon-play" />
						) : (
							<PauseIcon weight="fill" data-flx="music.music-panel.button.play-pause.icon-pause" />
						)
					}
					onClick={() => void run(() => setPaused(guildId, channelId, !paused))}
					data-flx="music.music-panel.button.play-pause"
				/>
				<IconButton
					label="Pular"
					disabled={pending || (!nowPlaying && session.queue.length === 0)}
					icon={<SkipForwardIcon weight="fill" data-flx="music.music-panel.button.skip.icon" />}
					onClick={() => void run(() => skip(guildId, channelId))}
					data-flx="music.music-panel.button.skip"
				/>
			</div>
		</section>
	);
});

const MyVolume = observer(function MyVolume() {
	const {volume, muted} = MusicVolume;
	return (
		<section className={styles.volume} data-flx="music.music-panel.volume">
			<IconButton
				label={muted ? 'Ativar som da música' : 'Silenciar música'}
				icon={
					muted ? (
						<SpeakerSlashIcon weight="fill" data-flx="music.music-panel.button.mute.icon-muted" />
					) : (
						<SpeakerHighIcon weight="fill" data-flx="music.music-panel.button.mute.icon" />
					)
				}
				onClick={MusicVolume.toggleMuted}
				data-flx="music.music-panel.button.mute"
			/>
			<input
				type="range"
				min={0}
				max={100}
				value={Math.round(volume * 100)}
				onChange={(event) => MusicVolume.setVolume(Number(event.target.value) / 100)}
				className={styles.volumeSlider}
				aria-label="Volume da música só para mim"
				aria-valuetext={`${Math.round(volume * 100)}%`}
				data-flx="music.music-panel.volume.slider"
			/>
			<span className={styles.volumeValue} data-flx="music.music-panel.volume.value">
				{muted ? 'Mudo' : `${Math.round(volume * 100)}%`}
			</span>
		</section>
	);
});

export const MusicPanel = observer(function MusicPanel({channel}: {channel: Channel}) {
	const guildId = channel.guildId ?? null;
	const channelId = channel.id;
	const session = MusicStore.sessionByChannel.get(channelId) ?? null;
	const error = MusicStore.commandError;
	const pending = MusicStore.commandPending;
	const run = MusicStore.runCommand;

	return (
		<aside className={styles.panel} aria-label="Música" data-flx="music.music-panel">
			<header className={styles.header} data-flx="music.music-panel.header">
				<span className={styles.headerTitle} data-flx="music.music-panel.header.title">
					<MusicNoteIcon weight="fill" data-flx="music.music-panel.header.icon" />
					<span data-flx="music.music-panel.header.title.text">Música</span>
				</span>
				<IconButton
					label="Fechar"
					icon={<XIcon weight="bold" data-flx="music.music-panel.button.close.icon" />}
					onClick={MusicStore.closePanel}
					data-flx="music.music-panel.button.close"
				/>
			</header>
			<Scroller className={styles.body} fade data-flx="music.music-panel.scroller">
				<div className={styles.bodyContent} data-flx="music.music-panel.body">
					{session && (
						<NowPlaying session={session} run={run} pending={pending} data-flx="music.music-panel.now-playing" />
					)}
					{session && <MyVolume data-flx="music.music-panel.my-volume" />}
					{guildId && <MusicSearchTab session={session} channel={channel} run={run} pending={pending} />}
					{error && (
						<p className={styles.error} role="alert" data-flx="music.music-panel.error">
							{error}
						</p>
					)}
					{session?.notice && (
						<p className={styles.notice} data-flx="music.music-panel.notice">
							{session.notice}
						</p>
					)}
					{session && <MusicQueueTab session={session} run={run} pending={pending} />}
				</div>
			</Scroller>
		</aside>
	);
});
