// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/attention/AttentionOverlay.module.css';
import AttentionStore, {type ActiveAttention} from '@app/features/attention/AttentionStore';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {fetchWinkVideo} from '@app/features/voice/soundboard/SoundboardApi';
import {BellRingingIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useRef, useState} from 'react';

const logger = new Logger('AttentionOverlay');

// A nudge without an animation stays up this long; a clip closes when it ends.
const NUDGE_ONLY_MS = 3500;
const MAX_CLIP_MS = 30_000;

const AttentionCard = ({attention}: {attention: ActiveAttention}) => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const close = useCallback(() => AttentionStore.dismiss(attention.key), [attention.key]);

	useEffect(() => {
		const wink = attention.wink;
		if (!wink) {
			const timer = setTimeout(close, NUDGE_ONLY_MS);
			return () => clearTimeout(timer);
		}
		let url: string | null = null;
		let canceled = false;
		const safety = setTimeout(close, MAX_CLIP_MS);
		fetchWinkVideo(wink.id)
			.then((blob) => {
				if (canceled) return;
				url = URL.createObjectURL(blob);
				setVideoUrl(url);
			})
			.catch((error: unknown) => {
				logger.warn('Could not load the attention animation', {error});
				setTimeout(close, NUDGE_ONLY_MS);
			});
		return () => {
			canceled = true;
			clearTimeout(safety);
			if (url) URL.revokeObjectURL(url);
		};
	}, [attention.wink, close]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !videoUrl) return;
		video.play().catch(() => {
			// Browsers refuse unmuted autoplay without a gesture; the desktop app allows it.
			video.muted = true;
			void video.play().catch(() => {});
		});
	}, [videoUrl]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [close]);

	return (
		<div
			className={styles.backdrop}
			onClick={close}
			role="alertdialog"
			aria-label={`${attention.senderName} chamou a sua atenção`}
			data-flx="attention.overlay.backdrop"
		>
			<div className={styles.card} data-flx="attention.overlay.card">
				<p className={styles.title} data-flx="attention.overlay.title">
					<BellRingingIcon weight="fill" className={styles.bell} /> {attention.senderName} chamou a sua atenção!
				</p>
				{videoUrl && (
					<video
						ref={videoRef}
						className={styles.video}
						src={videoUrl}
						playsInline
						onEnded={() => setTimeout(close, 400)}
						data-flx="attention.overlay.video"
					/>
				)}
				<p className={styles.hint} data-flx="attention.overlay.hint">
					Clique ou aperte Esc para fechar
				</p>
			</div>
		</div>
	);
};

export const AttentionOverlay = observer(() => {
	const attention = AttentionStore.active;
	if (!attention) return null;
	return <AttentionCard key={attention.key} attention={attention} />;
});
