// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import * as Modal from '@app/features/app/components/dialogs/Modal';
import Guilds from '@app/features/guild/state/Guilds';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import type {SoundboardSound} from '@app/features/voice/soundboard/SoundboardApi';
import styles from '@app/features/voice/soundboard/SoundboardModal.module.css';
import SoundboardStore, {describeSoundboardError} from '@app/features/voice/soundboard/SoundboardStore';
import {SpeakerHighIcon, TrashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

const SEARCH_THRESHOLD = 12;

let soundboardModalKey: string | null = null;

function isSoundboardOnTop(): boolean {
	return soundboardModalKey != null && ModalCommands.getTopModalKey() === soundboardModalKey;
}

export function openSoundboard(): void {
	if (isSoundboardOnTop()) return;
	ModalCommands.push(modal(() => <SoundboardModal data-flx="voice.soundboard.modal" />));
	soundboardModalKey = ModalCommands.getTopModalKey();
}

export function toggleSoundboard(): void {
	if (isSoundboardOnTop() && soundboardModalKey != null) {
		ModalCommands.popWithKey(soundboardModalKey);
		soundboardModalKey = null;
		return;
	}
	openSoundboard();
}

function defaultNameFromFile(fileName: string): string {
	const base = fileName.replace(/\.[^.]+$/u, '').replace(/[_-]+/gu, ' ');
	return base.split(/\s+/u).filter(Boolean).join(' ').slice(0, 32);
}

async function measureDurationMs(file: Blob): Promise<number> {
	const context = new AudioContext();
	try {
		const buffer = await context.decodeAudioData(await file.arrayBuffer());
		return Math.round(buffer.duration * 1000);
	} finally {
		void context.close();
	}
}

const AddSoundForm = observer(({guildId, onDone}: {guildId: string; onDone: () => void}) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState('');
	const [emoji, setEmoji] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const limits = SoundboardStore.serviceInfo;
	const maxSeconds = ((limits?.maxClipMs ?? 5200) / 1000).toLocaleString(undefined, {maximumFractionDigits: 1});
	const maxKilobytes = Math.floor((limits?.maxClipBytes ?? 1024 * 1024) / 1024);

	const handleFile = useCallback(
		async (event: React.ChangeEvent<HTMLInputElement>) => {
			const picked = event.target.files?.[0] ?? null;
			event.target.value = '';
			setError(null);
			if (!picked) return;
			if (picked.size > (limits?.maxClipBytes ?? 1024 * 1024)) {
				setError(`That file is too big. Sounds can be at most ${maxKilobytes} KB.`);
				return;
			}
			try {
				const durationMs = await measureDurationMs(picked);
				if (durationMs > (limits?.maxClipMs ?? 5200)) {
					setError(
						`That clip is ${(durationMs / 1000).toFixed(1)} seconds. Sounds can be at most ${maxSeconds} seconds.`,
					);
					return;
				}
			} catch {
				setError('That file is not an audio format Fluxer can play.');
				return;
			}
			setFile(picked);
			if (!name) setName(defaultNameFromFile(picked.name));
		},
		[limits, maxKilobytes, maxSeconds, name],
	);

	const handlePreview = useCallback(() => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		const audio = new Audio(url);
		audio.volume = SoundboardStore.volume;
		audio.onended = () => URL.revokeObjectURL(url);
		void audio.play().catch(() => URL.revokeObjectURL(url));
	}, [file]);

	const handleSubmit = useCallback(async () => {
		if (!file) {
			setError('Pick an audio file first.');
			return;
		}
		const trimmedName = name.trim();
		if (!trimmedName) {
			setError('Give the sound a name.');
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			await SoundboardStore.upload(guildId, {name: trimmedName, emoji: emoji.trim() || null, file});
			onDone();
		} catch (uploadError) {
			setError(describeSoundboardError(uploadError));
		} finally {
			setSubmitting(false);
		}
	}, [file, name, emoji, guildId, onDone]);

	return (
		<div className={styles.addForm} data-flx="voice.soundboard.add-form">
			<input
				ref={fileInputRef}
				type="file"
				accept="audio/*,.mp3,.ogg,.wav,.m4a,.webm,.flac"
				className={styles.hiddenInput}
				onChange={handleFile}
				data-flx="voice.soundboard.add-form.file-input"
			/>
			<div className={styles.addRow} data-flx="voice.soundboard.add-form.file-row">
				<Button
					variant="secondary"
					onClick={() => fileInputRef.current?.click()}
					data-flx="voice.soundboard.add-form.button.pick-file"
				>
					{file ? 'Choose another file' : 'Choose audio file'}
				</Button>
				{file && (
					<Button variant="secondary" onClick={handlePreview} data-flx="voice.soundboard.add-form.button.preview">
						Preview
					</Button>
				)}
				{file && (
					<span className={styles.fileName} data-flx="voice.soundboard.add-form.file-name">
						{file.name}
					</span>
				)}
			</div>
			<div className={styles.addRow} data-flx="voice.soundboard.add-form.fields-row">
				<div className={styles.addName} data-flx="voice.soundboard.add-form.name">
					<Input
						label="Name"
						value={name}
						maxLength={32}
						placeholder="Airhorn"
						onChange={(event) => setName(event.target.value)}
						data-flx="voice.soundboard.add-form.input.name"
					/>
				</div>
				<div className={styles.addEmoji} data-flx="voice.soundboard.add-form.emoji">
					<Input
						label="Emoji"
						value={emoji}
						maxLength={16}
						placeholder="📯"
						onChange={(event) => setEmoji(event.target.value.replace(/\s+/gu, ''))}
						data-flx="voice.soundboard.add-form.input.emoji"
					/>
				</div>
			</div>
			<p className={styles.hint} data-flx="voice.soundboard.add-form.hint">
				MP3, OGG, WAV, M4A, WebM or FLAC, up to {maxSeconds} seconds and {maxKilobytes} KB. Everyone in this
				community can play it.
			</p>
			{error && (
				<p className={styles.error} role="alert" data-flx="voice.soundboard.add-form.error">
					{error}
				</p>
			)}
			<div className={styles.addRow} data-flx="voice.soundboard.add-form.actions-row">
				<Button variant="secondary" onClick={onDone} data-flx="voice.soundboard.add-form.button.cancel">
					Cancel
				</Button>
				<Button
					onClick={handleSubmit}
					submitting={submitting}
					disabled={!file}
					data-flx="voice.soundboard.add-form.button.upload"
				>
					Add sound
				</Button>
			</div>
		</div>
	);
});

const SoundButton = observer(({sound, canPlay}: {sound: SoundboardSound; canPlay: boolean}) => {
	const [error, setError] = useState<string | null>(null);
	const playing = SoundboardStore.playingSoundIds.has(sound.id);
	const handlePlay = useCallback(() => {
		setError(null);
		SoundboardStore.play(sound).catch((playError: unknown) => setError(describeSoundboardError(playError)));
	}, [sound]);
	const handleDelete = useCallback(
		(event: React.MouseEvent) => {
			event.stopPropagation();
			ModalCommands.push(
				modal(() => (
					<ConfirmModal
						title="Delete sound"
						description={`Delete "${sound.name}" from this community's soundboard? Nobody will be able to play it anymore.`}
						primaryText="Delete"
						primaryVariant="danger"
						onPrimary={async () => {
							await SoundboardStore.remove(sound);
						}}
					/>
				)),
			);
		},
		[sound],
	);
	return (
		<div className={styles.soundWrapper} data-flx="voice.soundboard.sound-wrapper">
			<button
				type="button"
				className={clsx(styles.sound, playing && styles.soundPlaying)}
				onClick={handlePlay}
				disabled={!canPlay}
				title={error ?? `${sound.name} (${(sound.durationMs / 1000).toFixed(1)}s)`}
				aria-label={`Play ${sound.name}`}
				data-flx="voice.soundboard.button.play-sound"
			>
				<span className={styles.soundEmoji} aria-hidden="true" data-flx="voice.soundboard.sound-emoji">
					{sound.emoji ?? <SpeakerHighIcon weight="fill" />}
				</span>
				<span className={styles.soundName} data-flx="voice.soundboard.sound-name">
					{error ? `⚠ ${sound.name}` : sound.name}
				</span>
			</button>
			{SoundboardStore.canDelete(sound) && (
				<button
					type="button"
					className={styles.deleteButton}
					onClick={handleDelete}
					aria-label={`Delete ${sound.name}`}
					data-flx="voice.soundboard.button.delete-sound"
				>
					<TrashIcon size={12} weight="bold" />
				</button>
			)}
		</div>
	);
});

const SoundboardModal = observer((_props: {'data-flx'?: string}) => {
	useMediaEngineVersion();
	const guildId = SoundboardStore.voiceGuildId;
	const guildName = guildId ? Guilds.getGuild(guildId)?.name : null;
	const [query, setQuery] = useState('');
	const [adding, setAdding] = useState(false);

	useEffect(() => {
		if (guildId) {
			void SoundboardStore.load(guildId);
		} else {
			void SoundboardStore.ensureService();
		}
	}, [guildId]);

	const sounds = guildId ? SoundboardStore.soundsFor(guildId) : [];
	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return sounds;
		return sounds.filter((sound) => sound.name.toLowerCase().includes(needle));
	}, [sounds, query]);

	const availability = SoundboardStore.availability;
	const loading =
		guildId != null &&
		sounds.length === 0 &&
		(SoundboardStore.loadingGuildId === guildId || availability === 'checking' || availability === 'unknown');

	let body: React.ReactNode;
	if (availability === 'unavailable') {
		body = (
			<p className={styles.notice} data-flx="voice.soundboard.notice.unavailable">
				This server doesn't have a soundboard set up.
			</p>
		);
	} else if (!guildId) {
		body = (
			<p className={styles.notice} data-flx="voice.soundboard.notice.not-in-voice">
				Join a voice channel in a community to use its soundboard.
			</p>
		);
	} else {
		body = (
			<>
				<div className={styles.toolbar} data-flx="voice.soundboard.toolbar">
					{sounds.length > SEARCH_THRESHOLD && (
						<div className={styles.search} data-flx="voice.soundboard.search">
							<Input
								value={query}
								placeholder="Search sounds"
								onChange={(event) => setQuery(event.target.value)}
								aria-label="Search sounds"
								data-flx="voice.soundboard.input.search"
							/>
						</div>
					)}
					<label className={styles.volume} data-flx="voice.soundboard.volume">
						Volume
						<input
							type="range"
							min={0}
							max={100}
							value={Math.round(SoundboardStore.volume * 100)}
							onChange={(event) => SoundboardStore.setVolume(Number(event.target.value) / 100)}
							aria-label="Soundboard volume"
							data-flx="voice.soundboard.volume.input"
						/>
					</label>
					{!adding && (
						<Button onClick={() => setAdding(true)} data-flx="voice.soundboard.button.add">
							Add sound
						</Button>
					)}
				</div>
				{adding && <AddSoundForm guildId={guildId} onDone={() => setAdding(false)} />}
				{SoundboardStore.loadError && (
					<p className={styles.error} role="alert" data-flx="voice.soundboard.load-error">
						{SoundboardStore.loadError}
					</p>
				)}
				{loading ? (
					<p className={styles.empty} data-flx="voice.soundboard.loading">
						Loading sounds…
					</p>
				) : filtered.length === 0 ? (
					<p className={styles.empty} data-flx="voice.soundboard.empty">
						{sounds.length === 0 ? 'No sounds yet. Add the first one!' : 'No sounds match your search.'}
					</p>
				) : (
					<div className={styles.grid} data-flx="voice.soundboard.grid">
						{filtered.map((sound) => (
							<SoundButton key={sound.id} sound={sound} canPlay={true} />
						))}
					</div>
				)}
			</>
		);
	}

	return (
		<Modal.Root size="medium" centered data-flx="voice.soundboard.modal-root">
			<Modal.Header
				title={guildName ? `Soundboard · ${guildName}` : 'Soundboard'}
				data-flx="voice.soundboard.modal-header"
			/>
			<Modal.Content data-flx="voice.soundboard.modal-content">
				<Modal.ContentLayout data-flx="voice.soundboard.modal-content-layout">{body}</Modal.ContentLayout>
			</Modal.Content>
		</Modal.Root>
	);
});
