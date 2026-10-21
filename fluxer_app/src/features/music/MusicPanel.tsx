// SPDX-License-Identifier: AGPL-3.0-or-later

// Side panel of a voice call with the channel music: now playing, my volume, search or
// paste a link, the queue and "Encerrar música". It sits in the channel side panel slot
// (like the member list) or next to the call when the call fills the view.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import type {Channel} from '@app/features/channel/models/Channel';
import {
	addToQueue,
	type MusicQueueItem,
	type MusicSearchResult,
	type MusicSessionState,
	type MusicSource,
	type MusicTrack,
	moveInQueue,
	previous,
	removeFromQueue,
	searchTracks,
	setPaused,
	skip,
	stopSession,
} from '@app/features/music/MusicApi';
import styles from '@app/features/music/MusicPanel.module.css';
import {
	createMusicSearchInput,
	describeMusicProgress,
	formatMusicTime,
	queueMoveIndex,
} from '@app/features/music/MusicPanelStateMachine';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume from '@app/features/music/MusicVolume';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Avatar} from '@app/features/ui/components/Avatar';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Scroller} from '@app/features/ui/components/Scroller';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import Users from '@app/features/user/state/Users';
import {
	DotsSixVerticalIcon,
	MagnifyingGlassIcon,
	MusicNoteIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
	SkipBackIcon,
	SkipForwardIcon,
	SpeakerHighIcon,
	SpeakerSlashIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useDrag, useDrop} from 'react-dnd';

const QUEUE_DRAG_TYPE = 'fluxer.music.queue-item';

const SOURCE_LABEL: Record<MusicSource, string> = {spotify: 'Spotify', youtube: 'YouTube'};

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;

interface IconButtonProps {
	label: string;
	icon: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	primary?: boolean;
	'data-flx': string;
}

function IconButton({label, icon, onClick, disabled, primary, 'data-flx': dataFlx}: IconButtonProps) {
	return (
		<Tooltip text={label} data-flx={`${dataFlx}.tooltip`}>
			<FocusRing offset={-2} data-flx={`${dataFlx}.focus-ring`}>
				<button
					type="button"
					className={clsx(styles.iconButton, primary && styles.iconButtonPrimary)}
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
					data-flx={dataFlx}
				>
					{icon}
				</button>
			</FocusRing>
		</Tooltip>
	);
}

function Artwork({url, size, 'data-flx': dataFlx}: {url: string | null; size: 'large' | 'small'; 'data-flx': string}) {
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [url]);
	const className = clsx(styles.artwork, size === 'large' ? styles.artworkLarge : styles.artworkSmall);
	if (!url || failed) {
		return (
			<div className={clsx(className, styles.artworkPlaceholder)} aria-hidden="true" data-flx={dataFlx}>
				<MusicNoteIcon weight="fill" data-flx={`${dataFlx}.icon`} />
			</div>
		);
	}
	return (
		<img
			className={className}
			src={url}
			alt=""
			loading="lazy"
			referrerPolicy="no-referrer"
			onError={() => setFailed(true)}
			data-flx={dataFlx}
		/>
	);
}

function SourceTag({
	source,
	recommended,
	'data-flx': dataFlx,
}: {
	source: MusicSource;
	recommended?: boolean;
	'data-flx': string;
}) {
	return (
		<span
			className={clsx(
				styles.tag,
				recommended ? styles.tagRecommended : source === 'spotify' ? styles.tagSpotify : styles.tagYoutube,
			)}
			data-flx={dataFlx}
		>
			{recommended ? 'Recomendada' : SOURCE_LABEL[source]}
		</span>
	);
}

const AddedBy = observer(function AddedBy({userId}: {userId: string}) {
	const user = Users.getUser(userId);
	if (!user) return null;
	return (
		<span className={styles.addedBy} data-flx="music.music-panel.queue.added-by">
			<Avatar user={user} size={16} data-flx="music.music-panel.queue.added-by.avatar" />
			<span className={styles.addedByName} data-flx="music.music-panel.queue.added-by.name">
				{user.displayName}
			</span>
		</span>
	);
});

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

type SearchStatus =
	| {kind: 'idle'}
	| {kind: 'loading'}
	| {kind: 'done'; result: MusicSearchResult}
	| {kind: 'error'; message: string};

function ResultRow({track, onAdd, adding}: {track: MusicTrack; onAdd: (track: MusicTrack) => void; adding: boolean}) {
	return (
		<li className={styles.row} data-flx="music.music-panel.search.result">
			<Artwork url={track.artworkUrl} size="small" data-flx="music.music-panel.search.result.artwork" />
			<div className={styles.trackText} data-flx="music.music-panel.search.result.text">
				<span className={styles.rowTitle} title={track.title} data-flx="music.music-panel.search.result.title">
					{track.title}
				</span>
				<span className={styles.artist} title={track.artist} data-flx="music.music-panel.search.result.artist">
					{track.artist}
					{track.durationMs > 0 ? ` · ${formatMusicTime(track.durationMs)}` : ''}
				</span>
			</div>
			<IconButton
				label="Adicionar à fila"
				disabled={adding}
				icon={<PlusIcon weight="bold" data-flx="music.music-panel.button.add-result.icon" />}
				onClick={() => onAdd(track)}
				data-flx="music.music-panel.button.add-result"
			/>
		</li>
	);
}

function ResultSection({
	title,
	tracks,
	onAdd,
	adding,
	'data-flx': dataFlx,
}: {
	title: string;
	tracks: Array<MusicTrack>;
	onAdd: (track: MusicTrack) => void;
	adding: boolean;
	'data-flx': string;
}) {
	return (
		<div className={styles.resultSection} data-flx={dataFlx}>
			<h3 className={styles.sectionTitle} data-flx={`${dataFlx}.title`}>
				{title}
			</h3>
			{tracks.length === 0 ? (
				<p className={styles.muted} data-flx={`${dataFlx}.empty`}>
					Nada encontrado.
				</p>
			) : (
				<ul className={styles.list} data-flx={`${dataFlx}.list`}>
					{tracks.map((track) => (
						<ResultRow key={`${track.source}:${track.sourceId}`} track={track} onAdd={onAdd} adding={adding} />
					))}
				</ul>
			)}
		</div>
	);
}

const MusicSearch = observer(function MusicSearch({
	guildId,
	channelId,
	run,
	pending,
	hasSession,
}: {
	guildId: string;
	channelId: string;
	run: RunCommand;
	pending: boolean;
	hasSession: boolean;
}) {
	const text = MusicStore.searchText;
	const setText = MusicStore.setSearchText;
	const [status, setStatus] = useState<SearchStatus>({kind: 'idle'});
	const requestSeq = useRef(0);

	const search = useCallback(
		(query: string) => {
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
	// The panel remounts when the call is expanded or collapsed: redo the kept search.
	useEffect(() => {
		input.submit(MusicStore.searchText);
	}, [input]);

	const add = useCallback(
		(payload: Parameters<typeof addToQueue>[2]) => run(() => addToQueue(guildId, channelId, payload)),
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

	return (
		<section className={styles.section} data-flx="music.music-panel.search">
			<Input
				value={text}
				placeholder="Buscar ou colar link"
				aria-label="Buscar ou colar link"
				leftIcon={<MagnifyingGlassIcon weight="bold" data-flx="music.music-panel.search.icon" />}
				onChange={(event) => {
					setText(event.target.value);
					input.change(event.target.value);
				}}
				onKeyDown={handleKeyDown}
				data-flx="music.music-panel.search.input"
			/>
			{!hasSession && status.kind === 'idle' && (
				<p className={styles.muted} data-flx="music.music-panel.search.start-hint">
					Adicione uma música para começar
				</p>
			)}
			{status.kind === 'loading' && (
				<p className={styles.muted} data-flx="music.music-panel.search.loading">
					Buscando…
				</p>
			)}
			{status.kind === 'error' && (
				<p className={styles.error} role="alert" data-flx="music.music-panel.search.error">
					{status.message}
				</p>
			)}
			{status.kind === 'done' && (
				<div className={styles.results} data-flx="music.music-panel.search.results">
					<ResultSection
						title="YouTube"
						tracks={status.result.youtube}
						onAdd={handleAddTrack}
						adding={pending}
						data-flx="music.music-panel.search.results.youtube"
					/>
					{status.result.spotify && (
						<ResultSection
							title="Spotify"
							tracks={status.result.spotify}
							onAdd={handleAddTrack}
							adding={pending}
							data-flx="music.music-panel.search.results.spotify"
						/>
					)}
				</div>
			)}
		</section>
	);
});

interface QueueDragItem {
	id: string;
	index: number;
}

function QueueRow({
	item,
	index,
	session,
	run,
	pending,
}: {
	item: MusicQueueItem;
	index: number;
	session: MusicSessionState;
	run: RunCommand;
	pending: boolean;
}) {
	const rowRef = useRef<HTMLLIElement | null>(null);
	const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
	const {guildId, channelId} = session;

	const [{isDragging}, dragRef] = useDrag(
		() => ({
			type: QUEUE_DRAG_TYPE,
			item: (): QueueDragItem => ({id: item.id, index}),
			collect: (monitor) => ({isDragging: monitor.isDragging()}),
		}),
		[item.id, index],
	);
	const [{isOver}, dropRef] = useDrop(
		() => ({
			accept: QUEUE_DRAG_TYPE,
			hover: (dragged: QueueDragItem, monitor) => {
				const node = rowRef.current;
				const offset = monitor.getClientOffset();
				if (!node || !offset || dragged.id === item.id) {
					setDropPosition(null);
					return;
				}
				const rect = node.getBoundingClientRect();
				setDropPosition(offset.y < rect.top + rect.height / 2 ? 'before' : 'after');
			},
			drop: (dragged: QueueDragItem, monitor) => {
				const node = rowRef.current;
				const offset = monitor.getClientOffset();
				setDropPosition(null);
				if (!node || dragged.id === item.id) return;
				const rect = node.getBoundingClientRect();
				const position = offset && offset.y >= rect.top + rect.height / 2 ? 'after' : 'before';
				const target = queueMoveIndex(dragged.index, index, position);
				if (target != null) void run(() => moveInQueue(guildId, channelId, dragged.id, target));
			},
			collect: (monitor) => ({isOver: monitor.isOver({shallow: true})}),
		}),
		[item.id, index, guildId, channelId, run],
	);
	useEffect(() => {
		if (!isOver) setDropPosition(null);
	}, [isOver]);
	const setRowNode = useCallback(
		(node: HTMLLIElement | null) => {
			rowRef.current = node;
			dropRef(node);
		},
		[dropRef],
	);
	const setHandleNode = useCallback(
		(node: HTMLDivElement | null) => {
			dragRef(node);
		},
		[dragRef],
	);

	return (
		<li
			ref={setRowNode}
			className={clsx(
				styles.row,
				styles.queueRow,
				isDragging && styles.rowDragging,
				dropPosition === 'before' && styles.dropBefore,
				dropPosition === 'after' && styles.dropAfter,
			)}
			data-flx="music.music-panel.queue.item"
		>
			<div
				ref={setHandleNode}
				className={styles.dragHandle}
				role="button"
				tabIndex={0}
				aria-label="Arraste para reordenar"
				title="Arraste para reordenar"
				data-flx="music.music-panel.queue.item.drag-handle"
			>
				<DotsSixVerticalIcon weight="bold" data-flx="music.music-panel.queue.item.drag-handle.icon" />
			</div>
			<Artwork url={item.artworkUrl} size="small" data-flx="music.music-panel.queue.item.artwork" />
			<div className={styles.trackText} data-flx="music.music-panel.queue.item.text">
				<span className={styles.rowTitle} title={item.title} data-flx="music.music-panel.queue.item.title">
					{item.title}
				</span>
				<span className={styles.artist} title={item.artist} data-flx="music.music-panel.queue.item.artist">
					{item.artist}
				</span>
				<span className={styles.meta} data-flx="music.music-panel.queue.item.meta">
					<SourceTag source={item.source} recommended={item.recommended} data-flx="music.music-panel.queue.item.tag" />
					{!item.recommended && item.addedBy && <AddedBy userId={item.addedBy} />}
				</span>
			</div>
			<IconButton
				label="Remover da fila"
				disabled={pending}
				icon={<XIcon weight="bold" data-flx="music.music-panel.button.remove.icon" />}
				onClick={() => void run(() => removeFromQueue(guildId, channelId, item.id))}
				data-flx="music.music-panel.button.remove"
			/>
		</li>
	);
}

function MusicQueue({session, run, pending}: {session: MusicSessionState; run: RunCommand; pending: boolean}) {
	return (
		<section className={styles.section} aria-label="Fila" data-flx="music.music-panel.queue">
			<h3 className={styles.sectionTitle} data-flx="music.music-panel.queue.title">
				Fila
			</h3>
			{session.queue.length === 0 ? (
				<p className={styles.muted} data-flx="music.music-panel.queue.empty">
					A fila está vazia.
				</p>
			) : (
				<ul className={styles.list} data-flx="music.music-panel.queue.list">
					{session.queue.map((item, index) => (
						<QueueRow key={item.id} item={item} index={index} session={session} run={run} pending={pending} />
					))}
				</ul>
			)}
		</section>
	);
}

export const MusicPanel = observer(function MusicPanel({channel}: {channel: Channel}) {
	const guildId = channel.guildId ?? null;
	const channelId = channel.id;
	const session = MusicStore.sessionByChannel.get(channelId) ?? null;
	const error = MusicStore.commandError;
	const pending = MusicStore.commandPending;
	const run = MusicStore.runCommand;

	const handleStop = useCallback(() => {
		if (!guildId) return;
		ModalCommands.push(
			modal(() => (
				<ConfirmModal
					title="Encerrar música"
					description="A música para para todo mundo na chamada e a fila é apagada."
					primaryText="Encerrar"
					primaryVariant="danger"
					onPrimary={async () => {
						const ok = await run(async () => {
							await stopSession(guildId, channelId);
							return null;
						});
						if (ok) MusicStore.clearChannel(channelId);
					}}
					data-flx="music.music-panel.stop-confirm-modal"
				/>
			)),
		);
	}, [guildId, channelId, run]);

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
					{session && <NowPlaying session={session} run={run} pending={pending} />}
					{session && <MyVolume />}
					{guildId && (
						<MusicSearch
							guildId={guildId}
							channelId={channelId}
							run={run}
							pending={pending}
							hasSession={session != null}
						/>
					)}
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
					{session && <MusicQueue session={session} run={run} pending={pending} />}
				</div>
			</Scroller>
			{session && (
				<footer className={styles.footer} data-flx="music.music-panel.footer">
					<Button
						variant="danger"
						small
						fitContainer
						disabled={pending}
						onClick={handleStop}
						data-flx="music.music-panel.button.stop"
					>
						Encerrar música
					</Button>
				</footer>
			)}
		</aside>
	);
});
