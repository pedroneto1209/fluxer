// SPDX-License-Identifier: AGPL-3.0-or-later

// Now playing (artwork, title, progress, previous / play-pause / skip) and my music volume.
// They used to sit at the top of the side panel; the mini player (Task 7) shows them.

import {type MusicSessionState, previous, setPaused, skip} from '@app/features/music/MusicApi';
import styles from '@app/features/music/MusicNowPlayingParts.module.css';
import {describeMusicProgress} from '@app/features/music/MusicPanelStateMachine';
import {Artwork, IconButton, SourceTag} from '@app/features/music/MusicParts';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume from '@app/features/music/MusicVolume';
import {
	PauseIcon,
	PlayIcon,
	SkipBackIcon,
	SkipForwardIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;

export const NowPlaying = observer(function NowPlaying({
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
		<section className={styles.section} aria-label="Tocando agora" data-flx="music.now-playing-parts.now-playing">
			{nowPlaying ? (
				<div className={styles.nowPlaying} data-flx="music.now-playing-parts.now-playing.track">
					<Artwork url={nowPlaying.artworkUrl} size="large" data-flx="music.now-playing-parts.now-playing.artwork" />
					<div className={styles.trackText} data-flx="music.now-playing-parts.now-playing.text">
						<span
							className={styles.nowTitle}
							title={nowPlaying.title}
							data-flx="music.now-playing-parts.now-playing.title"
						>
							{nowPlaying.title}
						</span>
						<span
							className={styles.artist}
							title={nowPlaying.artist}
							data-flx="music.now-playing-parts.now-playing.artist"
						>
							{nowPlaying.artist}
						</span>
						<SourceTag
							source={nowPlaying.source}
							recommended={nowPlaying.recommended}
							data-flx="music.now-playing-parts.now-playing.tag"
						/>
					</div>
				</div>
			) : (
				<p className={styles.muted} data-flx="music.now-playing-parts.now-playing.idle">
					Nada tocando agora.
				</p>
			)}
			{nowPlaying && (
				<div className={styles.progress} data-flx="music.now-playing-parts.now-playing.progress">
					<div
						className={clsx(styles.progressBar, progress.fraction == null && styles.progressIndeterminate)}
						role="progressbar"
						aria-label="Progresso da música"
						aria-valuemin={progress.fraction == null ? undefined : 0}
						aria-valuemax={progress.fraction == null ? undefined : 100}
						aria-valuenow={progress.fraction == null ? undefined : Math.round(progress.fraction * 100)}
						data-flx="music.now-playing-parts.now-playing.progress-bar"
					>
						{progress.fraction != null && (
							<div
								className={styles.progressFill}
								style={{width: `${progress.fraction * 100}%`}}
								data-flx="music.now-playing-parts.now-playing.progress-fill"
							/>
						)}
					</div>
					<div className={styles.progressTimes} data-flx="music.now-playing-parts.now-playing.progress-times">
						<span data-flx="music.now-playing-parts.now-playing.elapsed">{progress.elapsed}</span>
						{progress.total && <span data-flx="music.now-playing-parts.now-playing.total">{progress.total}</span>}
					</div>
				</div>
			)}
			<div className={styles.controls} data-flx="music.now-playing-parts.now-playing.controls">
				<IconButton
					label="Voltar"
					disabled={pending}
					icon={<SkipBackIcon weight="fill" data-flx="music.now-playing-parts.button.previous.icon" />}
					onClick={() => void run(() => previous(guildId, channelId))}
					data-flx="music.now-playing-parts.button.previous"
				/>
				<IconButton
					label={paused ? 'Tocar' : 'Pausar'}
					primary
					disabled={pending || !nowPlaying}
					icon={
						paused ? (
							<PlayIcon weight="fill" data-flx="music.now-playing-parts.button.play-pause.icon-play" />
						) : (
							<PauseIcon weight="fill" data-flx="music.now-playing-parts.button.play-pause.icon-pause" />
						)
					}
					onClick={() => void run(() => setPaused(guildId, channelId, !paused))}
					data-flx="music.now-playing-parts.button.play-pause"
				/>
				<IconButton
					label="Pular"
					disabled={pending || (!nowPlaying && session.queue.length === 0)}
					icon={<SkipForwardIcon weight="fill" data-flx="music.now-playing-parts.button.skip.icon" />}
					onClick={() => void run(() => skip(guildId, channelId))}
					data-flx="music.now-playing-parts.button.skip"
				/>
			</div>
		</section>
	);
});

export const MyVolume = observer(function MyVolume() {
	const {volume, muted} = MusicVolume;
	return (
		<section className={styles.volume} data-flx="music.now-playing-parts.volume">
			<IconButton
				label={muted ? 'Ativar som da música' : 'Silenciar música'}
				icon={
					muted ? (
						<SpeakerSlashIcon weight="fill" data-flx="music.now-playing-parts.button.mute.icon-muted" />
					) : (
						<SpeakerHighIcon weight="fill" data-flx="music.now-playing-parts.button.mute.icon" />
					)
				}
				onClick={MusicVolume.toggleMuted}
				data-flx="music.now-playing-parts.button.mute"
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
				data-flx="music.now-playing-parts.volume.slider"
			/>
			<span className={styles.volumeValue} data-flx="music.now-playing-parts.volume.value">
				{muted ? 'Mudo' : `${Math.round(volume * 100)}%`}
			</span>
		</section>
	);
});
