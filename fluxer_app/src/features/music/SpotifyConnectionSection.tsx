// SPDX-License-Identifier: AGPL-3.0-or-later

// "Spotify (música do canal)" in Settings > Linked accounts. Shown only on
// instances that run the music service.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {SettingsSection} from '@app/features/app/components/dialogs/shared/SettingsSection';
import {
	connectSpotify,
	disconnectSpotify,
	getSpotifyStatus,
	type SpotifyStatus,
	startSpotifyAuthorize,
} from '@app/features/music/MusicApi';
import MusicStore from '@app/features/music/MusicStore';
import {cleanPastedRedirect, runSpotifyConnect} from '@app/features/music/SpotifyConnectFlow';
import styles from '@app/features/music/SpotifyConnectionSection.module.css';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {getElectronAPI, openExternalUrl} from '@app/features/ui/utils/NativeUtils';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';

type Phase = 'idle' | 'starting' | 'waiting' | 'paste';

export const SpotifyConnectionSection: React.FC = observer(() => {
	const available = MusicStore.availability === 'available';
	const [status, setStatus] = useState<SpotifyStatus | null>(null);
	const [phase, setPhase] = useState<Phase>('idle');
	const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
	const [pasteText, setPasteText] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Each click on Conectar starts a new attempt; results of older ones are ignored.
	const attemptRef = useRef(0);

	useEffect(() => {
		void MusicStore.checkAvailability();
	}, []);

	const refreshStatus = useCallback(async () => {
		try {
			setStatus(await getSpotifyStatus());
		} catch (statusError) {
			setError(MusicStore.describeMusicError(statusError));
			// Without a first answer the section would say "Verificando…" forever with Conectar disabled.
			setStatus((current) => current ?? {connected: false, displayName: null});
		}
	}, []);

	useEffect(() => {
		if (available) void refreshStatus();
	}, [available, refreshStatus]);

	const finishConnected = useCallback((next: SpotifyStatus) => {
		setStatus(next);
		setPhase('idle');
		setAuthorizeUrl(null);
		setPasteText('');
		setError(null);
	}, []);

	const handleConnect = useCallback(async () => {
		const attempt = ++attemptRef.current;
		const isCurrent = () => attempt === attemptRef.current;
		const capture = getElectronAPI()?.captureSpotifyRedirect;
		setError(null);
		setPasteText('');
		setAuthorizeUrl(null);
		setPhase('starting');
		try {
			const outcome = await runSpotifyConnect({
				startAuthorize: startSpotifyAuthorize,
				capture: capture ? () => capture() : null,
				openUrl: (url) => openExternalUrl(url),
				connect: async (redirectUrl) => {
					if (!isCurrent()) throw new Error('stale');
					return connectSpotify({redirectUrl});
				},
				onAuthorizeUrl: (url) => {
					if (!isCurrent()) return;
					setAuthorizeUrl(url);
					setPhase(capture ? 'waiting' : 'paste');
				},
			});
			if (!isCurrent()) return;
			if (outcome.kind === 'connected') finishConnected(outcome.status);
			else setPhase('paste');
		} catch (connectError) {
			if (!isCurrent()) return;
			setError(MusicStore.describeMusicError(connectError));
			setPhase((current) => (current === 'starting' ? 'idle' : 'paste'));
		}
	}, [finishConnected]);

	const handlePasteSubmit = useCallback(async () => {
		const redirectUrl = cleanPastedRedirect(pasteText);
		if (!redirectUrl) {
			setError('Cole o endereço completo da página que abriu depois do login.');
			return;
		}
		const attempt = attemptRef.current;
		setSubmitting(true);
		setError(null);
		try {
			const next = await connectSpotify({redirectUrl});
			// A paste wins over a capture still waiting in the desktop app.
			attemptRef.current = attempt + 1;
			finishConnected(next);
		} catch (connectError) {
			setError(MusicStore.describeMusicError(connectError));
		} finally {
			setSubmitting(false);
		}
	}, [pasteText, finishConnected]);

	const handleDisconnect = useCallback(() => {
		ModalCommands.push(
			modal(() => (
				<ConfirmModal
					title="Desconectar Spotify"
					description="Desconectar sua conta do Spotify? Músicas do Spotify não vão mais tocar pela sua conta nos canais."
					primaryText="Desconectar"
					primaryVariant="danger"
					onPrimary={async () => {
						try {
							await disconnectSpotify();
							setError(null);
						} catch (disconnectError) {
							setError(MusicStore.describeMusicError(disconnectError));
						}
						await refreshStatus();
					}}
					data-flx="music.spotify-connection.disconnect-confirm-modal"
				/>
			)),
		);
	}, [refreshStatus]);

	if (!available) return null;

	const connected = status?.connected === true;
	const inProgress = phase !== 'idle';

	return (
		<SettingsSection
			id="spotify-music"
			linkable={false}
			title="Spotify (música do canal)"
			description="Conecte sua conta do Spotify para tocar músicas do Spotify nos canais de voz."
			data-flx="music.spotify-connection.section"
		>
			<div className={styles.body} data-flx="music.spotify-connection.body">
				<div className={styles.statusRow} data-flx="music.spotify-connection.status-row">
					<span className={connected ? styles.status : styles.statusMuted} data-flx="music.spotify-connection.status">
						{status == null
							? 'Verificando…'
							: connected
								? status.displayName
									? `Conectado como ${status.displayName}`
									: 'Conectado'
								: 'Não conectado'}
					</span>
					<div className={styles.actions} data-flx="music.spotify-connection.actions">
						{connected && (
							<Button
								variant="secondary"
								small
								onClick={handleDisconnect}
								data-flx="music.spotify-connection.button.disconnect"
							>
								Desconectar
							</Button>
						)}
						<Button
							small
							onClick={handleConnect}
							submitting={phase === 'starting'}
							disabled={status == null}
							data-flx="music.spotify-connection.button.connect"
						>
							{connected ? 'Conectar outra conta' : inProgress ? 'Tentar de novo' : 'Conectar'}
						</Button>
					</div>
				</div>
				{phase === 'waiting' && (
					<p className={styles.message} data-flx="music.spotify-connection.waiting">
						Faça login no Spotify no navegador. Quando terminar, volte aqui.
					</p>
				)}
				{authorizeUrl && (phase === 'waiting' || phase === 'paste') && (
					<p className={styles.message} data-flx="music.spotify-connection.open-link">
						<span data-flx="music.spotify-connection.open-link.prompt">O navegador não abriu? </span>
						<a
							href={authorizeUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={styles.link}
							onClick={(event) => {
								event.preventDefault();
								void openExternalUrl(authorizeUrl);
							}}
							data-flx="music.spotify-connection.open-link.anchor"
						>
							Abrir a página de login do Spotify
						</a>
					</p>
				)}
				{(phase === 'waiting' || phase === 'paste') && (
					<div className={styles.pasteRow} data-flx="music.spotify-connection.paste-row">
						<div className={styles.pasteInput} data-flx="music.spotify-connection.paste-input">
							<Input
								label="Cole aqui o endereço da página que abriu depois do login"
								value={pasteText}
								placeholder="http://127.0.0.1:36850/login?code=…"
								onChange={(event) => setPasteText(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') void handlePasteSubmit();
								}}
								data-flx="music.spotify-connection.input.paste"
							/>
						</div>
						<Button
							onClick={handlePasteSubmit}
							submitting={submitting}
							disabled={pasteText.trim() === ''}
							data-flx="music.spotify-connection.button.paste-submit"
						>
							Confirmar
						</Button>
					</div>
				)}
				{error && (
					<p className={styles.error} role="alert" data-flx="music.spotify-connection.error">
						{error}
					</p>
				)}
				<p className={styles.notes} data-flx="music.spotify-connection.notes">
					Requer Spotify Premium. Enquanto a música do canal toca pela sua conta, você não consegue ouvir em outro
					dispositivo. Músicas tocadas pelo canal não entram no seu histórico do Spotify.
				</p>
			</div>
		</SettingsSection>
	);
});
