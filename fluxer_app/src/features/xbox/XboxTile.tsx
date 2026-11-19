// SPDX-License-Identifier: AGPL-3.0-or-later

// The Xbox as a tile in the call grid. Nothing is downloaded until you click "Assistir"
// (the stream is ~10 Mbit/s); then the tile subscribes to the Xbox participant's screen
// share and its sound, shows the picture, and offers volume and full screen. Leaving the
// call or clicking "Parar de assistir" unsubscribes again.

import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import XboxStore from '@app/features/xbox/XboxStore';
import styles from '@app/features/xbox/XboxTile.module.css';
import {ArrowsOutIcon, GameControllerIcon, SpeakerHighIcon, SpeakerSlashIcon, XIcon} from '@phosphor-icons/react';
import {
	type Participant,
	type RemoteAudioTrack,
	type RemoteTrackPublication,
	type RemoteVideoTrack,
	RoomEvent,
	Track,
} from 'livekit-client';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useRef, useState} from 'react';

const VOLUME_KEY = 'fluxer.xbox.volume';

function readVolume(): number {
	try {
		const v = Number(localStorage.getItem(VOLUME_KEY));
		return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null ? v : 1;
	} catch {
		return 1;
	}
}

function saveVolume(v: number): void {
	try {
		localStorage.setItem(VOLUME_KEY, String(v));
	} catch {}
}

function xboxPublications(participant: Participant): Array<RemoteTrackPublication> {
	return Array.from(participant.trackPublications.values()).filter(
		(p) => p.source === Track.Source.ScreenShare || p.source === Track.Source.ScreenShareAudio,
	) as Array<RemoteTrackPublication>;
}

/** Subscribes to the Xbox's screen share and sound while `watching`; returns its tracks. */
function useXboxTracks(participant: Participant, watching: boolean) {
	const [video, setVideo] = useState<RemoteVideoTrack | null>(null);
	const [audio, setAudio] = useState<RemoteAudioTrack | null>(null);
	useEffect(() => {
		const room = MediaEngine.room;
		if (!watching || !room) return;
		const sync = () => {
			let v: RemoteVideoTrack | null = null;
			let a: RemoteAudioTrack | null = null;
			for (const pub of xboxPublications(participant)) {
				// The call engine unsubscribes screen shares it did not ask for when they are
				// published; this listener runs after it, so asking again here wins.
				if (!pub.isSubscribed) pub.setSubscribed(true);
				if (pub.source === Track.Source.ScreenShare && pub.track) v = pub.track as RemoteVideoTrack;
				if (pub.source === Track.Source.ScreenShareAudio && pub.track) a = pub.track as RemoteAudioTrack;
			}
			setVideo(v);
			setAudio(a);
		};
		const onEvent = (...args: Array<unknown>) => {
			const who = args.find((x): x is Participant => !!x && typeof x === 'object' && 'identity' in x);
			if (who?.identity === participant.identity) sync();
		};
		const events = [
			RoomEvent.TrackPublished,
			RoomEvent.TrackSubscribed,
			RoomEvent.TrackUnsubscribed,
			RoomEvent.TrackUnpublished,
		];
		for (const e of events) room.on(e, onEvent);
		sync();
		return () => {
			for (const e of events) room.off(e, onEvent);
			for (const pub of xboxPublications(participant)) pub.setSubscribed(false);
			setVideo(null);
			setAudio(null);
		};
	}, [participant, watching]);
	return {video, audio};
}

export const XboxTile = observer(function XboxTile({participant}: {participant: Participant}) {
	const [watching, setWatching] = useState(false);
	const [volume, setVolume] = useState(readVolume);
	const [muted, setMuted] = useState(false);
	const tileRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const {video, audio} = useXboxTracks(participant, watching);

	useEffect(() => {
		const el = videoRef.current;
		if (!video || !el) return;
		video.attach(el);
		return () => {
			video.detach(el);
		};
	}, [video]);

	useEffect(() => {
		audio?.setVolume(muted ? 0 : volume);
	}, [audio, volume, muted]);

	const toggleFullscreen = useCallback(() => {
		const el = tileRef.current;
		if (!el) return;
		if (document.fullscreenElement) void document.exitFullscreen();
		else void el.requestFullscreen?.();
	}, []);

	const stream = XboxStore.status?.stream;
	const consoleName = stream && stream.state === 'live' ? stream.console : null;
	const label = consoleName ? `Xbox (${consoleName})` : 'Xbox';

	return (
		<div ref={tileRef} className={styles.tile} role="group" aria-label={label} data-flx="xbox.xbox-tile">
			{watching ? (
				<>
					<video
						ref={videoRef}
						className={styles.video}
						autoPlay
						playsInline
						muted
						onDoubleClick={toggleFullscreen}
						data-flx="xbox.xbox-tile.video"
					/>
					{!video && <div className={styles.loading}>Carregando o Xbox…</div>}
					<div className={styles.controls} data-flx="xbox.xbox-tile.controls">
						<span className={styles.name}>{label}</span>
						<button
							type="button"
							className={styles.iconButton}
							aria-label={muted ? 'Ligar o som do Xbox' : 'Silenciar o Xbox'}
							onClick={() => setMuted(!muted)}
						>
							{muted ? <SpeakerSlashIcon weight="fill" /> : <SpeakerHighIcon weight="fill" />}
						</button>
						<input
							type="range"
							className={styles.volume}
							min={0}
							max={1}
							step={0.05}
							value={muted ? 0 : volume}
							aria-label="Volume do Xbox"
							onChange={(e) => {
								const v = Number(e.target.value);
								setVolume(v);
								setMuted(false);
								saveVolume(v);
							}}
						/>
						<button type="button" className={styles.iconButton} aria-label="Tela cheia" onClick={toggleFullscreen}>
							<ArrowsOutIcon weight="bold" />
						</button>
						<button
							type="button"
							className={styles.iconButton}
							aria-label="Parar de assistir"
							onClick={() => setWatching(false)}
						>
							<XIcon weight="bold" />
						</button>
					</div>
				</>
			) : (
				<div className={styles.placeholder} data-flx="xbox.xbox-tile.placeholder">
					<GameControllerIcon weight="fill" className={styles.bigIcon} aria-hidden="true" />
					<div className={styles.title}>{label} ao vivo</div>
					<button type="button" className={styles.watch} onClick={() => setWatching(true)}>
						Assistir
					</button>
				</div>
			)}
		</div>
	);
});
