// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/attention/AttentionPanel.module.css';
import AttentionStore from '@app/features/attention/AttentionStore';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import type {AttentionWink} from '@app/features/voice/soundboard/SoundboardApi';
import {BellRingingIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useEffect, useState} from 'react';

export function openAttentionPanel(user: {id: string; name: string}): void {
	ModalCommands.push(modal(() => <AttentionPanel userId={user.id} userName={user.name} />));
}

function describeError(error: unknown): string {
	return error instanceof Error && error.message ? error.message : 'Não foi possível chamar a atenção.';
}

const AttentionPanel = observer(({userId, userName}: {userId: string; userName: string}) => {
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
						{winks.map((wink) => (
							<button
								key={wink.id}
								type="button"
								className={styles.option}
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
						))}
					</div>
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
