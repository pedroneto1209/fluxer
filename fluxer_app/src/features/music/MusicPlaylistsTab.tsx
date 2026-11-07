// SPDX-License-Identifier: AGPL-3.0-or-later

// "Playlists" tab of the music UI: paste a Spotify playlist or album, or a YouTube playlist,
// to play it. Every playlist played this way is kept in the community's list below, so the
// next time it starts with one click.

import type {Channel} from '@app/features/channel/models/Channel';
import {
	deleteSavedPlaylist,
	type MusicSavedPlaylist,
	type MusicSessionState,
	playPlaylist,
} from '@app/features/music/MusicApi';
import {Artwork, IconButton, SourceTag} from '@app/features/music/MusicParts';
import MusicPlaylists from '@app/features/music/MusicPlaylists';
import styles from '@app/features/music/MusicPlaylistsTab.module.css';
import searchStyles from '@app/features/music/MusicSearchTab.module.css';
import MusicStore from '@app/features/music/MusicStore';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Scroller} from '@app/features/ui/components/Scroller';
import {LinkIcon, PlayIcon, PlusIcon, TrashIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;
type PlayPayload = {input: string} | {playlistId: string};

// A remove click arms the button; a second one within this window removes.
const CONFIRM_REMOVE_MS = 4000;

function describePlaylist(playlist: MusicSavedPlaylist): string {
	const parts = [playlist.kind === 'album' ? 'Álbum' : 'Playlist'];
	if (playlist.owner) parts.push(playlist.owner);
	parts.push(playlist.trackCount === 1 ? '1 faixa' : `${playlist.trackCount} faixas`);
	return parts.join(' · ');
}

function PlaylistRow({
	playlist,
	pending,
	confirming,
	onPlay,
	onRemove,
}: {
	playlist: MusicSavedPlaylist;
	pending: boolean;
	confirming: boolean;
	onPlay: (payload: PlayPayload, playNow: boolean) => void;
	onRemove: (playlistId: string) => void;
}) {
	return (
		<li className={searchStyles.row} data-flx="music.music-playlists-tab.playlist">
			<Artwork url={playlist.artworkUrl} size="small" data-flx="music.music-playlists-tab.playlist.artwork" />
			<div className={searchStyles.trackText} data-flx="music.music-playlists-tab.playlist.text">
				<span className={searchStyles.title} title={playlist.name} data-flx="music.music-playlists-tab.playlist.name">
					{playlist.name}
				</span>
				<span className={styles.meta} data-flx="music.music-playlists-tab.playlist.meta">
					<SourceTag source={playlist.source} data-flx="music.music-playlists-tab.playlist.source" />
					<span
						className={searchStyles.artist}
						title={describePlaylist(playlist)}
						data-flx="music.music-playlists-tab.playlist.details"
					>
						{describePlaylist(playlist)}
					</span>
				</span>
			</div>
			<div className={styles.actions} data-flx="music.music-playlists-tab.playlist.actions">
				<IconButton
					label="Tocar agora"
					primary
					icon={<PlayIcon weight="fill" data-flx="music.music-playlists-tab.playlist.play.icon" />}
					onClick={() => onPlay({playlistId: playlist.id}, true)}
					disabled={pending}
					data-flx="music.music-playlists-tab.playlist.play"
				/>
				<IconButton
					label="Adicionar à fila"
					icon={<PlusIcon weight="bold" data-flx="music.music-playlists-tab.playlist.queue.icon" />}
					onClick={() => onPlay({playlistId: playlist.id}, false)}
					disabled={pending}
					data-flx="music.music-playlists-tab.playlist.queue"
				/>
				<IconButton
					label={confirming ? 'Clique de novo para remover' : 'Remover da lista'}
					icon={
						confirming ? (
							<TrashIcon
								weight="fill"
								className={styles.confirmRemove}
								data-flx="music.music-playlists-tab.playlist.remove.confirm-icon"
							/>
						) : (
							<XIcon weight="bold" data-flx="music.music-playlists-tab.playlist.remove.icon" />
						)
					}
					onClick={() => onRemove(playlist.id)}
					data-flx="music.music-playlists-tab.playlist.remove"
				/>
			</div>
		</li>
	);
}

export const MusicPlaylistsTab = observer(function MusicPlaylistsTab({
	channel,
	run,
	pending,
}: {
	channel: Channel;
	run: RunCommand;
	pending: boolean;
}) {
	const guildId = channel.guildId ?? null;
	const channelId = channel.id;
	const [link, setLink] = useState('');
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
	const [removeError, setRemoveError] = useState<string | null>(null);

	useEffect(() => {
		if (guildId) void MusicPlaylists.load(guildId);
	}, [guildId]);

	useEffect(() => {
		if (confirmingId == null) return;
		const timer = setTimeout(() => setConfirmingId(null), CONFIRM_REMOVE_MS);
		return () => clearTimeout(timer);
	}, [confirmingId]);

	const play = useCallback(
		(payload: PlayPayload, playNow: boolean): Promise<boolean> => {
			if (!guildId) return Promise.resolve(false);
			setConfirmingId(null);
			return run(async () => {
				const {session, playlist} = await playPlaylist(guildId, channelId, payload, playNow);
				if (playlist) MusicPlaylists.upsert(guildId, playlist);
				return session;
			});
		},
		[guildId, channelId, run],
	);

	const submitLink = useCallback(
		(playNow: boolean) => {
			const value = link.trim();
			if (!value || pending) return;
			void play({input: value}, playNow).then((ok) => {
				if (ok) setLink('');
			});
		},
		[link, pending, play],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
			event.preventDefault();
			submitLink(true);
		},
		[submitLink],
	);

	const remove = useCallback(
		(playlistId: string) => {
			if (!guildId) return;
			if (confirmingId !== playlistId) {
				setConfirmingId(playlistId);
				return;
			}
			setConfirmingId(null);
			deleteSavedPlaylist(guildId, playlistId).then(
				() => {
					MusicPlaylists.removeLocal(guildId, playlistId);
					setRemoveError(null);
				},
				(error: unknown) => setRemoveError(MusicStore.describeMusicError(error)),
			);
		},
		[guildId, confirmingId],
	);

	const playlists = guildId ? MusicPlaylists.playlistsOf(guildId) : [];
	const load = guildId ? MusicPlaylists.loadOf(guildId) : null;
	const hasLink = link.trim().length > 0;

	return (
		<section className={searchStyles.tab} data-flx="music.music-playlists-tab">
			<div className={styles.linkRow} data-flx="music.music-playlists-tab.link-row">
				<div className={styles.linkInput} data-flx="music.music-playlists-tab.link-input-wrapper">
					<Input
						value={link}
						placeholder="Colar link de playlist ou álbum…"
						aria-label="Link de playlist ou álbum"
						leftIcon={<LinkIcon weight="bold" data-flx="music.music-playlists-tab.input.icon" />}
						onChange={(event) => setLink(event.target.value)}
						onKeyDown={handleKeyDown}
						data-flx="music.music-playlists-tab.input"
					/>
				</div>
				<IconButton
					label="Tocar agora"
					primary
					icon={<PlayIcon weight="fill" data-flx="music.music-playlists-tab.link-play.icon" />}
					onClick={() => submitLink(true)}
					disabled={pending || !hasLink}
					data-flx="music.music-playlists-tab.link-play"
				/>
				<IconButton
					label="Adicionar à fila"
					icon={<PlusIcon weight="bold" data-flx="music.music-playlists-tab.link-queue.icon" />}
					onClick={() => submitLink(false)}
					disabled={pending || !hasLink}
					data-flx="music.music-playlists-tab.link-queue"
				/>
			</div>
			<Scroller className={searchStyles.scroller} fade data-flx="music.music-playlists-tab.scroller">
				<div className={searchStyles.scrollContent} data-flx="music.music-playlists-tab.scroll-content">
					{removeError && (
						<p className={searchStyles.error} role="alert" data-flx="music.music-playlists-tab.remove-error">
							{removeError}
						</p>
					)}
					{load?.kind === 'error' && (
						<p className={searchStyles.error} role="alert" data-flx="music.music-playlists-tab.load-error">
							{load.message}
						</p>
					)}
					{load?.kind === 'loading' && (
						<p className={searchStyles.muted} data-flx="music.music-playlists-tab.loading">
							Carregando…
						</p>
					)}
					{load?.kind === 'ready' && playlists.length === 0 && (
						<p className={searchStyles.muted} data-flx="music.music-playlists-tab.empty">
							Cole o link de uma playlist do Spotify ou do YouTube. Ela fica salva aqui para todos tocarem de novo com
							um clique.
						</p>
					)}
					{playlists.length > 0 && (
						<ul className={searchStyles.list} data-flx="music.music-playlists-tab.list">
							{playlists.map((playlist) => (
								<PlaylistRow
									key={playlist.id}
									playlist={playlist}
									pending={pending}
									confirming={confirmingId === playlist.id}
									onPlay={(payload, playNow) => void play(payload, playNow)}
									onRemove={remove}
								/>
							))}
						</ul>
					)}
				</div>
			</Scroller>
		</section>
	);
});
