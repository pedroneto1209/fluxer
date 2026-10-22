// SPDX-License-Identifier: AGPL-3.0-or-later

// "Buscar" tab of the music UI: one field (search or paste a link), a Spotify | YouTube
// switch and a single list for the chosen source.

import {UserSettingsModal} from '@app/features/app/components/dialogs/LoadableSettingsModals';
import type {Channel} from '@app/features/channel/models/Channel';
import {
	addToQueue,
	type MusicSearchResult,
	type MusicSessionState,
	type MusicTrack,
	searchTracks,
} from '@app/features/music/MusicApi';
import {createMusicSearchInput, formatMusicTime} from '@app/features/music/MusicPanelStateMachine';
import {Artwork} from '@app/features/music/MusicParts';
import {
	loadSearchSource,
	type MusicSearchSourceChoice,
	saveSearchSource,
	visibleResults,
} from '@app/features/music/MusicSearchSource';
import styles from '@app/features/music/MusicSearchTab.module.css';
import MusicStore from '@app/features/music/MusicStore';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {MagnifyingGlassIcon, PlusIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;

type SearchStatus =
	| {kind: 'idle'}
	| {kind: 'loading'}
	| {kind: 'done'; result: MusicSearchResult}
	| {kind: 'error'; message: string};

const SOURCES: ReadonlyArray<{choice: MusicSearchSourceChoice; label: string}> = [
	{choice: 'spotify', label: 'Spotify'},
	{choice: 'youtube', label: 'YouTube'},
];

function openLinkedAccounts(): void {
	ModalCommands.push(
		modal(
			() => <UserSettingsModal initialTab="linked_accounts" data-flx="music.music-search-tab.settings-modal" />,
			'user-settings',
		),
	);
}

function ResultRow({track, onAdd, adding}: {track: MusicTrack; onAdd: (track: MusicTrack) => void; adding: boolean}) {
	return (
		<li className={styles.row} data-flx="music.music-search-tab.result">
			<Artwork url={track.artworkUrl} size="small" data-flx="music.music-search-tab.result.artwork" />
			<div className={styles.trackText} data-flx="music.music-search-tab.result.text">
				<span className={styles.title} title={track.title} data-flx="music.music-search-tab.result.title">
					{track.title}
				</span>
				<span className={styles.artist} title={track.artist} data-flx="music.music-search-tab.result.artist">
					{track.artist}
					{track.durationMs > 0 ? ` · ${formatMusicTime(track.durationMs)}` : ''}
				</span>
			</div>
			<Tooltip text="Adicionar à fila" data-flx="music.music-search-tab.result.add.tooltip">
				<FocusRing offset={-2} data-flx="music.music-search-tab.result.add.focus-ring">
					<button
						type="button"
						className={styles.addButton}
						onClick={() => onAdd(track)}
						disabled={adding}
						aria-label="Adicionar à fila"
						data-flx="music.music-search-tab.result.add"
					>
						<PlusIcon weight="bold" data-flx="music.music-search-tab.result.add.icon" />
					</button>
				</FocusRing>
			</Tooltip>
		</li>
	);
}

export const MusicSearchTab = observer(function MusicSearchTab({
	session,
	channel,
	run,
	pending,
}: {
	session: MusicSessionState | null;
	channel: Channel;
	run: RunCommand;
	pending: boolean;
}) {
	const guildId = channel.guildId ?? null;
	const channelId = channel.id;
	const text = MusicStore.searchText;
	const setText = MusicStore.setSearchText;
	const [status, setStatus] = useState<SearchStatus>({kind: 'idle'});
	const [choice, setChoice] = useState<MusicSearchSourceChoice>(loadSearchSource);
	const requestSeq = useRef(0);

	const search = useCallback(
		(query: string) => {
			if (!guildId) return;
			const seq = ++requestSeq.current;
			setStatus({kind: 'loading'});
			searchTracks(guildId, channelId, query).then(
				(result) => {
					if (seq === requestSeq.current) setStatus({kind: 'done', result});
				},
				(error: unknown) => {
					if (seq === requestSeq.current) setStatus({kind: 'error', message: MusicStore.describeMusicError(error)});
				},
			);
		},
		[guildId, channelId],
	);
	const clear = useCallback(() => {
		requestSeq.current++;
		setStatus({kind: 'idle'});
	}, []);
	const searchRef = useRef(search);
	searchRef.current = search;
	const input = useMemo(
		() => createMusicSearchInput({onSearch: (query) => searchRef.current(query), onClear: clear}),
		[clear],
	);
	useEffect(() => () => input.dispose(), [input]);
	// The tab remounts when the call is expanded or collapsed: redo the kept search.
	useEffect(() => {
		input.submit(MusicStore.searchText);
	}, [input]);

	const add = useCallback(
		(payload: Parameters<typeof addToQueue>[2]) => {
			if (!guildId) return Promise.resolve(false);
			return run(() => addToQueue(guildId, channelId, payload));
		},
		[guildId, channelId, run],
	);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
			event.preventDefault();
			if (pending || input.submit(text) !== 'link') return;
			void add({input: text.trim()}).then((ok) => {
				if (ok) {
					setText('');
					clear();
				}
			});
		},
		[add, pending, clear, input, text, setText],
	);

	const handleAddTrack = useCallback(
		(track: MusicTrack) => void add({track: {source: track.source, sourceId: track.sourceId}}),
		[add],
	);

	const handleChoice = useCallback((next: MusicSearchSourceChoice) => {
		setChoice(next);
		saveSearchSource(next);
	}, []);

	const visible = status.kind === 'done' ? visibleResults(status.result, choice) : null;

	return (
		<section className={styles.tab} data-flx="music.music-search-tab">
			<Input
				value={text}
				placeholder="Buscar ou colar link…"
				aria-label="Buscar ou colar link"
				leftIcon={<MagnifyingGlassIcon weight="bold" data-flx="music.music-search-tab.input.icon" />}
				onChange={(event) => {
					setText(event.target.value);
					input.change(event.target.value);
				}}
				onKeyDown={handleKeyDown}
				data-flx="music.music-search-tab.input"
			/>
			<div
				className={styles.switch}
				role="radiogroup"
				aria-label="Fonte da busca"
				data-flx="music.music-search-tab.switch"
			>
				{SOURCES.map(({choice: option, label}) => (
					<FocusRing key={option} offset={-2} data-flx={`music.music-search-tab.switch.${option}.focus-ring`}>
						<button
							type="button"
							role="radio"
							aria-checked={choice === option}
							className={clsx(styles.switchOption, choice === option && styles.switchOptionActive)}
							onClick={() => handleChoice(option)}
							data-flx={`music.music-search-tab.switch.${option}`}
						>
							{label}
						</button>
					</FocusRing>
				))}
			</div>
			{session == null && status.kind === 'idle' && (
				<p className={styles.muted} data-flx="music.music-search-tab.start-hint">
					Adicione uma música para começar
				</p>
			)}
			{status.kind === 'loading' && (
				<p className={styles.muted} data-flx="music.music-search-tab.loading">
					Buscando…
				</p>
			)}
			{status.kind === 'error' && (
				<p className={styles.error} role="alert" data-flx="music.music-search-tab.error">
					{status.message}
				</p>
			)}
			{visible?.spotifyUnavailable && (
				<div className={styles.notice} data-flx="music.music-search-tab.spotify-unavailable">
					<p className={styles.noticeText} data-flx="music.music-search-tab.spotify-unavailable.text">
						Conecte sua conta do Spotify para buscar músicas do Spotify.
					</p>
					<Button small onClick={openLinkedAccounts} data-flx="music.music-search-tab.spotify-unavailable.connect">
						Conectar Spotify
					</Button>
				</div>
			)}
			{visible &&
				!visible.spotifyUnavailable &&
				(visible.tracks.length === 0 ? (
					<p className={styles.muted} data-flx="music.music-search-tab.empty">
						Nada encontrado.
					</p>
				) : (
					<ul className={styles.list} data-flx="music.music-search-tab.list">
						{visible.tracks.map((track) => (
							<ResultRow
								key={`${track.source}:${track.sourceId}`}
								track={track}
								onAdd={handleAddTrack}
								adding={pending}
							/>
						))}
					</ul>
				))}
		</section>
	);
});
