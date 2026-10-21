// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/attention/AttentionPanel.module.css';
import AttentionStore from '@app/features/attention/AttentionStore';
import Authentication from '@app/features/auth/state/Authentication';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {
	type AttentionWink,
	deleteWink,
	SoundboardApiError,
	uploadWink,
} from '@app/features/voice/soundboard/SoundboardApi';
import {BellRingingIcon, PlusIcon, TrashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useRef, useState} from 'react';

const MAX_UPLOAD_MB = 50;
const MAX_WINK_SECONDS = 20;

const WINK_ERRORS: Record<string, string> = {
	WINK_TOO_LONG: `O vídeo pode ter no máximo ${MAX_WINK_SECONDS} segundos.`,
	WINK_TOO_SHORT: 'O vídeo é curto demais.',
	INVALID_VIDEO: 'Esse arquivo não é um vídeo ou GIF que dê para usar.',
	VIDEO_TOO_LARGE: `O arquivo pode ter no máximo ${MAX_UPLOAD_MB} MB.`,
	CONVERSION_FAILED: 'Não deu para converter esse vídeo.',
	WINK_LIMIT: 'Você já tem o máximo de winks. Apague algum antes.',
	RATE_LIMITED: 'Muitos envios seguidos. Tente de novo mais tarde.',
	INVALID_NAME: 'Dê um nome de 1 a 32 caracteres.',
	INVALID_EMOJI: 'Use um único emoji.',
	NOT_ALLOWED: 'Só quem adicionou esse wink pode apagá-lo.',
	NETWORK: 'Não foi possível falar com o servidor.',
};

export function openAttentionPanel(user: {id: string; name: string}): void {
	ModalCommands.push(modal(() => <AttentionPanel userId={user.id} userName={user.name} />));
}

function describeError(error: unknown): string {
	if (error instanceof SoundboardApiError) return WINK_ERRORS[error.code] ?? error.message;
	return error instanceof Error && error.message ? error.message : 'Não foi possível chamar a atenção.';
}

const WinkUploadForm = ({onDone}: {onDone: (added: AttentionWink | null) => void}) => {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState('');
	const [emoji, setEmoji] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleFile = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const picked = event.target.files?.[0] ?? null;
			event.target.value = '';
			if (!picked) return;
			if (picked.size > MAX_UPLOAD_MB * 1024 * 1024) {
				setError(WINK_ERRORS.VIDEO_TOO_LARGE);
				return;
			}
			setError(null);
			setFile(picked);
			if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/u, '').slice(0, 32));
		},
		[name],
	);

	const handleSubmit = useCallback(async () => {
		if (!file) {
			setError('Escolha um vídeo ou GIF primeiro.');
			return;
		}
		const trimmedName = name.trim();
		if (!trimmedName) {
			setError(WINK_ERRORS.INVALID_NAME);
			return;
		}
		setSubmitting(true);
		setError(null);
		try {
			const added = await uploadWink({name: trimmedName, emoji: emoji.trim() || null, file});
			await AttentionStore.loadWinks(true);
			onDone(added);
		} catch (uploadError) {
			setError(describeError(uploadError));
		} finally {
			setSubmitting(false);
		}
	}, [file, name, emoji, onDone]);

	return (
		<div className={styles.addForm} data-flx="attention.panel.add-form">
			<input
				ref={fileInputRef}
				type="file"
				accept="video/*,image/gif,.gif,.mp4,.mov,.webm,.mkv"
				className={styles.hiddenInput}
				onChange={handleFile}
				data-flx="attention.panel.add-form.file-input"
			/>
			<div className={styles.addRow} data-flx="attention.panel.add-form.file-row">
				<Button
					variant="secondary"
					onClick={() => fileInputRef.current?.click()}
					data-flx="attention.panel.add-form.button.pick-file"
				>
					{file ? 'Escolher outro arquivo' : 'Escolher vídeo ou GIF'}
				</Button>
				{file && (
					<span className={styles.fileName} data-flx="attention.panel.add-form.file-name">
						{file.name}
					</span>
				)}
			</div>
			<div className={styles.addRow} data-flx="attention.panel.add-form.fields-row">
				<div className={styles.addName} data-flx="attention.panel.add-form.name">
					<Input
						label="Nome"
						value={name}
						maxLength={32}
						placeholder="Dancinha"
						onChange={(event) => setName(event.target.value)}
						data-flx="attention.panel.add-form.input.name"
					/>
				</div>
				<div className={styles.addEmoji} data-flx="attention.panel.add-form.emoji">
					<Input
						label="Emoji"
						value={emoji}
						maxLength={16}
						placeholder="🕺"
						onChange={(event) => setEmoji(event.target.value.replace(/\s+/gu, ''))}
						data-flx="attention.panel.add-form.input.emoji"
					/>
				</div>
			</div>
			<p className={styles.notice} data-flx="attention.panel.add-form.hint">
				Qualquer vídeo ou GIF de até {MAX_WINK_SECONDS} segundos e {MAX_UPLOAD_MB} MB. Todo mundo vai poder usar.
			</p>
			{error && (
				<p className={styles.error} role="alert" data-flx="attention.panel.add-form.error">
					{error}
				</p>
			)}
			<div className={styles.addRow} data-flx="attention.panel.add-form.actions-row">
				<Button variant="secondary" onClick={() => onDone(null)} data-flx="attention.panel.add-form.button.cancel">
					Cancelar
				</Button>
				<Button
					onClick={handleSubmit}
					submitting={submitting}
					disabled={!file}
					data-flx="attention.panel.add-form.button.upload"
				>
					{submitting ? 'Convertendo…' : 'Adicionar wink'}
				</Button>
			</div>
		</div>
	);
};

const AttentionPanel = observer(({userId, userName}: {userId: string; userName: string}) => {
	const [sending, setSending] = useState(false);
	const [adding, setAdding] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const currentUserId = Authentication.currentUserId;

	useEffect(() => {
		void AttentionStore.loadWinks();
	}, []);

	const send = async (wink: AttentionWink | null) => {
		setSending(true);
		setError(null);
		const selfKey = ModalCommands.getTopModalKey();
		try {
			await AttentionStore.send(userId, wink);
			if (selfKey != null) ModalCommands.popWithKey(selfKey);
			else ModalCommands.pop();
		} catch (sendError) {
			setError(describeError(sendError));
		} finally {
			setSending(false);
		}
	};

	const remove = async (wink: AttentionWink) => {
		if (confirmingDelete !== wink.id) {
			setConfirmingDelete(wink.id);
			return;
		}
		setConfirmingDelete(null);
		setError(null);
		try {
			await deleteWink(wink.id);
			await AttentionStore.loadWinks(true);
			setNotice(`"${wink.name}" foi apagado.`);
		} catch (deleteError) {
			setError(describeError(deleteError));
		}
	};

	const winks = AttentionStore.winks;
	return (
		<Modal.Root size="small" centered data-flx="attention.panel.modal-root">
			<Modal.Header title={`Chamar a atenção de ${userName}`} data-flx="attention.panel.modal-header" />
			<Modal.Content data-flx="attention.panel.modal-content">
				<Modal.ContentLayout data-flx="attention.panel.modal-content-layout">
					<div className={styles.grid} data-flx="attention.panel.grid">
						<button
							type="button"
							className={clsx(styles.option, styles.nudgeOption)}
							disabled={sending}
							onClick={() => void send(null)}
							data-flx="attention.panel.button.nudge-only"
						>
							<BellRingingIcon weight="fill" size={20} className={styles.bell} />
							<span className={styles.name}>Só chamar atenção</span>
						</button>
						{winks.map((wink) => {
							const canDelete = wink.custom && wink.uploaderId != null && wink.uploaderId === currentUserId;
							const confirming = confirmingDelete === wink.id;
							return (
								<div key={wink.id} className={styles.tile} data-flx="attention.panel.wink-tile">
									<button
										type="button"
										className={clsx(styles.option, canDelete && styles.optionWithDelete)}
										disabled={sending}
										onClick={() => void send(wink)}
										title={wink.name}
										data-flx="attention.panel.button.wink"
									>
										<span className={styles.emoji} aria-hidden="true">
											{wink.emoji ?? '🎬'}
										</span>
										<span className={styles.name}>{wink.name}</span>
									</button>
									{canDelete && (
										<button
											type="button"
											className={clsx(styles.deleteButton, confirming && styles.deleteButtonConfirming)}
											onClick={() => void remove(wink)}
											onBlur={() => confirming && setConfirmingDelete(null)}
											aria-label={confirming ? `Confirmar: apagar ${wink.name}` : `Apagar ${wink.name}`}
											title={confirming ? 'Clique de novo para apagar' : 'Apagar seu wink'}
											data-flx="attention.panel.button.delete-wink"
										>
											{confirming ? 'Apagar?' : <TrashIcon size={14} weight="bold" />}
										</button>
									)}
								</div>
							);
						})}
						{!adding && (
							<button
								type="button"
								className={clsx(styles.option, styles.addOption)}
								onClick={() => {
									setAdding(true);
									setNotice(null);
								}}
								data-flx="attention.panel.button.add-wink"
							>
								<PlusIcon size={18} weight="bold" />
								<span className={styles.name}>Novo wink</span>
							</button>
						)}
					</div>
					{adding && (
						<WinkUploadForm
							onDone={(added) => {
								setAdding(false);
								if (added) setNotice(`"${added.name}" foi adicionado. Já dá para usar!`);
							}}
						/>
					)}
					{AttentionStore.winksLoading && winks.length === 0 && (
						<p className={styles.notice} data-flx="attention.panel.loading">
							Carregando animações…
						</p>
					)}
					{AttentionStore.winksError && (
						<p className={styles.error} data-flx="attention.panel.load-error">
							{AttentionStore.winksError}
						</p>
					)}
					{notice && (
						<p className={styles.notice} role="status" data-flx="attention.panel.notice">
							{notice}
						</p>
					)}
					{error && (
						<p className={styles.error} role="alert" data-flx="attention.panel.error">
							{error}
						</p>
					)}
				</Modal.ContentLayout>
			</Modal.Content>
		</Modal.Root>
	);
});
