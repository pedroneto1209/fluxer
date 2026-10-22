// SPDX-License-Identifier: AGPL-3.0-or-later

// Always-visible mini player at the bottom of the channel column, above the voice
// connection panel: current track, progress, previous / play-pause / skip and my volume.
// Clicking the track opens the music balloon. Only shown where music works in the call.

import Channels from '@app/features/channel/state/Channels';
import {previous, setPaused, skip} from '@app/features/music/MusicApi';
import {MusicBalloonPopout} from '@app/features/music/MusicBalloon';
import {isMusicUsableInCall} from '@app/features/music/MusicCall';
import styles from '@app/features/music/MusicMiniPlayer.module.css';
import {miniPlayerView} from '@app/features/music/MusicMiniPlayerModel';
import {describeMusicProgress} from '@app/features/music/MusicPanelStateMachine';
import {Artwork, IconButton} from '@app/features/music/MusicParts';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume from '@app/features/music/MusicVolume';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
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

export const MusicMiniPlayer = observer(function MusicMiniPlayer() {
	const channelId = MediaEngine.channelId;
	const channel = channelId ? Channels.getChannel(channelId) : undefined;
	const usable = isMusicUsableInCall();
	const session = channelId ? (MusicStore.sessionByChannel.get(channelId) ?? null) : null;
	const [now, setNow] = useState(() => Date.now());
	const ticking = usable && session?.nowPlaying != null && !session.paused;
	useEffect(() => {
		if (!ticking) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [ticking]);
	if (!channel || !usable) return null;

	const view = miniPlayerView(session, now);
	if (view.kind === 'idle' || !session) {
		return (
			<div className={styles.miniPlayer} data-flx="music.mini-player">
				<MusicBalloonPopout
					channel={channel}
					position="right"
					initialTab="search"
					data-flx="music.mini-player.idle-popout"
				>
					<button type="button" className={styles.idleButton} data-flx="music.mini-player.idle">
						▶ Tocar música
					</button>
				</MusicBalloonPopout>
			</div>
		);
	}

	const {guildId} = session;
	const pending = MusicStore.commandPending;
	const run = MusicStore.runCommand;
	const {volume, muted} = MusicVolume;
	const progress = describeMusicProgress(view.positionMs, view.durationMs);
	return (
		<div className={styles.miniPlayer} data-flx="music.mini-player">
			<MusicBalloonPopout channel={channel} position="right" data-flx="music.mini-player.track-popout">
				<button type="button" className={styles.trackButton} data-flx="music.mini-player.track">
					<Artwork url={view.artworkUrl} size="small" data-flx="music.mini-player.artwork" />
					<span className={styles.trackText} data-flx="music.mini-player.text">
						<span className={styles.title} title={view.title} data-flx="music.mini-player.title">
							{view.title}
						</span>
						<span className={styles.artist} title={view.artist} data-flx="music.mini-player.artist">
							{view.artist}
						</span>
					</span>
				</button>
			</MusicBalloonPopout>
			<div
				className={clsx(styles.progressBar, progress.fraction == null && styles.progressIndeterminate)}
				role="progressbar"
				aria-label="Progresso da música"
				aria-valuemin={progress.fraction == null ? undefined : 0}
				aria-valuemax={progress.fraction == null ? undefined : 100}
				aria-valuenow={progress.fraction == null ? undefined : Math.round(progress.fraction * 100)}
				data-flx="music.mini-player.progress-bar"
			>
				{progress.fraction != null && (
					<div
						className={styles.progressFill}
						style={{width: `${progress.fraction * 100}%`}}
						data-flx="music.mini-player.progress-fill"
					/>
				)}
			</div>
			<div className={styles.controls} data-flx="music.mini-player.controls">
				<IconButton
					label="Voltar"
					disabled={pending}
					icon={<SkipBackIcon weight="fill" data-flx="music.mini-player.button.previous.icon" />}
					onClick={() => void run(() => previous(guildId, session.channelId))}
					data-flx="music.mini-player.button.previous"
				/>
				<IconButton
					label={view.paused ? 'Tocar' : 'Pausar'}
					disabled={pending}
					icon={
						view.paused ? (
							<PlayIcon weight="fill" data-flx="music.mini-player.button.play-pause.icon-play" />
						) : (
							<PauseIcon weight="fill" data-flx="music.mini-player.button.play-pause.icon-pause" />
						)
					}
					onClick={() => void run(() => setPaused(guildId, session.channelId, !view.paused))}
					data-flx="music.mini-player.button.play-pause"
				/>
				<IconButton
					label="Pular"
					disabled={pending}
					icon={<SkipForwardIcon weight="fill" data-flx="music.mini-player.button.skip.icon" />}
					onClick={() => void run(() => skip(guildId, session.channelId))}
					data-flx="music.mini-player.button.skip"
				/>
				<div className={styles.volume} data-flx="music.mini-player.volume">
					<IconButton
						label={muted ? 'Reativar o som da música' : 'Silenciar a música'}
						icon={
							muted ? (
								<SpeakerSlashIcon weight="fill" data-flx="music.mini-player.button.mute.icon-muted" />
							) : (
								<SpeakerHighIcon weight="fill" data-flx="music.mini-player.button.mute.icon" />
							)
						}
						onClick={MusicVolume.toggleMuted}
						data-flx="music.mini-player.button.mute"
					/>
					<input
						type="range"
						min={0}
						max={100}
						value={muted ? 0 : Math.round(volume * 100)}
						onChange={(event) => MusicVolume.setVolumeUnmuted(Number(event.target.value) / 100)}
						className={styles.volumeSlider}
						aria-label="Volume da música"
						aria-valuetext={muted ? 'Mudo' : `${Math.round(volume * 100)}%`}
						data-flx="music.mini-player.volume.slider"
					/>
				</div>
			</div>
		</div>
	);
});
