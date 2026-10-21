// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/attention/AttentionOverlay.module.css';
import AttentionStore, {type ActiveAttention, type SentAttention} from '@app/features/attention/AttentionStore';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {type AttentionWink, fetchWinkVideo} from '@app/features/voice/soundboard/SoundboardApi';
import {BellRingingIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useRef, useState} from 'react';

const logger = new Logger('AttentionOverlay');

// A nudge without an animation stays up this long; a clip closes when it ends.
const NUDGE_ONLY_MS = 3500;
const MAX_CLIP_MS = 30_000;
// The sender's corner card for anything that isn't a playing clip.
const SENT_NOTICE_MS = 4500;

// Fetch a wink's clip as an object URL; calls onFailed if it can't be loaded.
function useWinkVideoUrl(wink: AttentionWink | null, onFailed: () => void): string | null {
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	useEffect(() => {
		if (!wink) return;
		let url: string | null = null;
		let canceled = false;
		fetchWinkVideo(wink.id)
			.then((blob) => {
				if (canceled) return;
				url = URL.createObjectURL(blob);
				setVideoUrl(url);
			})
			.catch((error: unknown) => {
				logger.warn('Could not load the attention animation', {error});
				if (!canceled) onFailed();
			});
		return () => {
			canceled = true;
			if (url) URL.revokeObjectURL(url);
		};
	}, [wink, onFailed]);
	return videoUrl;
}

const AttentionCard = ({attention}: {attention: ActiveAttention}) => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const close = useCallback(() => AttentionStore.dismiss(attention.key), [attention.key]);
	const closeLater = useCallback(() => setTimeout(close, NUDGE_ONLY_MS), [close]);
	const videoUrl = useWinkVideoUrl(attention.wink, closeLater);

	useEffect(() => {
		const timer = setTimeout(close, attention.wink ? MAX_CLIP_MS : NUDGE_ONLY_MS);
		return () => clearTimeout(timer);
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

	const hasClip = attention.wink != null;
	return (
		<div
			className={styles.backdrop}
			onClick={close}
			role="alertdialog"
			aria-label={`${attention.senderName} chamou a sua atenção`}
			data-flx="attention.overlay.backdrop"
		>
			<div className={clsx(styles.stage, !hasClip && styles.card)} data-flx="attention.overlay.stage">
				<p className={clsx(styles.title, hasClip && styles.onBackdrop)} data-flx="attention.overlay.title">
					<BellRingingIcon weight="fill" className={styles.bell} /> {attention.senderName} chamou a sua atenção!
				</p>
				{hasClip && (
					<div className={styles.videoFrame} data-flx="attention.overlay.video-frame">
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
					</div>
				)}
				<p className={clsx(styles.hint, hasClip && styles.onBackdrop)} data-flx="attention.overlay.hint">
					Clique ou aperte Esc para fechar
				</p>
			</div>
		</div>
	);
};

function describeSent(sent: SentAttention): string {
	const name = sent.recipientName;
	switch (sent.status) {
		case 'shown':
			return sent.wink ? `${name} está vendo:` : `${name} recebeu seu chamado!`;
		case 'blocked':
			return `${name} bloqueou seus winks.`;
		case 'busy':
			return `${name} já está vendo outro wink. Tente de novo em instantes.`;
		case 'no-answer':
			return `${name} não confirmou. Talvez esteja com uma versão antiga do Fluxer.`;
	}
}

// Bottom-right confirmation for the sender: a small, muted copy of what the other
// person is seeing, or why they aren't.
const SentAttentionCard = ({sent}: {sent: SentAttention}) => {
	const close = useCallback(() => AttentionStore.dismissSent(sent.key), [sent.key]);
	const playing = sent.status === 'shown' && sent.wink != null;
	const videoUrl = useWinkVideoUrl(playing ? sent.wink : null, close);

	useEffect(() => {
		const timer = setTimeout(close, playing ? MAX_CLIP_MS : SENT_NOTICE_MS);
		return () => clearTimeout(timer);
	}, [playing, close]);

	return (
		<div
			className={clsx(styles.sent, sent.status !== 'shown' && styles.sentProblem)}
			role="status"
			data-flx="attention.sent"
		>
			<div className={styles.sentHeader} data-flx="attention.sent.header">
				<BellRingingIcon weight="fill" className={styles.bell} />
				<span className={styles.sentText} data-flx="attention.sent.text">
					{describeSent(sent)}
					{playing && sent.wink && (
						<strong className={styles.sentWinkName}>
							{' '}
							{sent.wink.emoji ?? '🎬'} {sent.wink.name}
						</strong>
					)}
				</span>
				<button
					type="button"
					className={styles.sentClose}
					onClick={close}
					aria-label="Fechar"
					data-flx="attention.sent.close"
				>
					<XIcon size={14} weight="bold" />
				</button>
			</div>
			{playing && (
				<div className={styles.sentVideoFrame} data-flx="attention.sent.video-frame">
					{videoUrl && (
						<video
							className={styles.sentVideo}
							src={videoUrl}
							autoPlay
							muted
							playsInline
							onEnded={() => setTimeout(close, 600)}
							data-flx="attention.sent.video"
						/>
					)}
				</div>
			)}
		</div>
	);
};

export const AttentionOverlay = observer(() => {
	const {active, sent} = AttentionStore;
	return (
		<>
			{sent && <SentAttentionCard key={sent.key} sent={sent} />}
			{active && <AttentionCard key={active.key} attention={active} />}
		</>
	);
});
