// SPDX-License-Identifier: AGPL-3.0-or-later

// "Fila" tab of the music UI: the users' queue and the recommended items that follow it
// (dimmed). Every row drags by its whole body; the server clamps user items to the user
// section and promotes a dropped recommended item into it. The focusable ⠿ handle is the
// keyboard entry for the drag (Ctrl/Cmd+D). Below the lists: the Spotify radio notice and "Encerrar música".
// Only the lists scroll: "Encerrar música" stays pinned at the bottom of the balloon.

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {
	type MusicQueueItem,
	type MusicSessionState,
	moveInQueue,
	removeFromQueue,
	stopSession,
} from '@app/features/music/MusicApi';
import {queueMoveIndex, queueOverflowLabel} from '@app/features/music/MusicPanelStateMachine';
import {AddedBy, Artwork, IconButton, SourceTag} from '@app/features/music/MusicParts';
import {promoteIndex, queueIndexOf, showRadioNotice, splitQueue} from '@app/features/music/MusicQueueModel';
import styles from '@app/features/music/MusicQueueTab.module.css';
import MusicStore from '@app/features/music/MusicStore';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {modal} from '@app/features/ui/commands/ModalCommands';
import {Scroller} from '@app/features/ui/components/Scroller';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {DotsSixVerticalIcon, PlusIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useDrag, useDrop} from 'react-dnd';

const QUEUE_DRAG_TYPE = 'fluxer.music.queue-item';

type RunCommand = (command: () => Promise<MusicSessionState | null>) => Promise<boolean>;

interface QueueDragItem {
	id: string;
	index: number;
}

interface RowProps {
	item: MusicQueueItem;
	session: MusicSessionState;
	run: RunCommand;
	pending: boolean;
}

function RowBody({item, session, run, pending}: RowProps) {
	const {guildId, channelId} = session;
	return (
		<>
			<Artwork url={item.artworkUrl} size="small" data-flx="music.music-queue-tab.item.artwork" />
			<div className={styles.trackText} data-flx="music.music-queue-tab.item.text">
				<span className={styles.rowTitle} title={item.title} data-flx="music.music-queue-tab.item.title">
					{item.title}
				</span>
				<span className={styles.artist} title={item.artist} data-flx="music.music-queue-tab.item.artist">
					{item.artist}
				</span>
				<span className={styles.meta} data-flx="music.music-queue-tab.item.meta">
					<SourceTag source={item.source} recommended={item.recommended} data-flx="music.music-queue-tab.item.tag" />
					{!item.recommended && item.addedBy && (
						<AddedBy userId={item.addedBy} data-flx="music.music-queue-tab.item.added-by" />
					)}
				</span>
			</div>
			{item.recommended && (
				<IconButton
					label="Adicionar à fila"
					disabled={pending}
					icon={<PlusIcon weight="bold" data-flx="music.music-queue-tab.button.promote.icon" />}
					onClick={() => void run(() => moveInQueue(guildId, channelId, item.id, promoteIndex(session)))}
					data-flx="music.music-queue-tab.button.promote"
				/>
			)}
			<IconButton
				label="Remover da fila"
				disabled={pending}
				icon={<XIcon weight="bold" data-flx="music.music-queue-tab.button.remove.icon" />}
				onClick={() => void run(() => removeFromQueue(guildId, channelId, item.id))}
				data-flx="music.music-queue-tab.button.remove"
			/>
		</>
	);
}

/** Draggable and droppable row; `index` is the position in the server's whole queue, which is what `move` expects. */
function QueueRow({item, index, session, run, pending}: RowProps & {index: number}) {
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
			dragRef(node);
			dropRef(node);
		},
		[dragRef, dropRef],
	);

	return (
		<li
			ref={setRowNode}
			className={clsx(
				styles.row,
				item.recommended && styles.rowRecommended,
				isDragging && styles.rowDragging,
				dropPosition === 'before' && styles.dropBefore,
				dropPosition === 'after' && styles.dropAfter,
			)}
			data-flx={item.recommended ? 'music.music-queue-tab.recommended-item' : 'music.music-queue-tab.item'}
		>
			<FocusRing offset={-2} data-flx="music.music-queue-tab.item.drag-handle.focus-ring">
				<div
					className={styles.dragHandle}
					role="button"
					tabIndex={0}
					aria-label={`${item.title}: arraste para reordenar`}
					title="Arraste para reordenar"
					data-flx="music.music-queue-tab.item.drag-handle"
				>
					<DotsSixVerticalIcon weight="bold" data-flx="music.music-queue-tab.item.drag-handle.icon" />
				</div>
			</FocusRing>
			<RowBody item={item} session={session} run={run} pending={pending} />
		</li>
	);
}

export const MusicQueueTab = observer(function MusicQueueTab({
	session,
	run,
	pending,
}: {
	session: MusicSessionState;
	run: RunCommand;
	pending: boolean;
}) {
	const {guildId, channelId} = session;
	const {user, recommended} = splitQueue(session.queue);
	const overflow = queueOverflowLabel(session.queue.length, session.queueLength);

	const handleStop = useCallback(() => {
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
					data-flx="music.music-queue-tab.stop-confirm-modal"
				/>
			)),
		);
	}, [guildId, channelId, run]);

	return (
		<div className={styles.tab} data-flx="music.music-queue-tab">
			<Scroller className={styles.scroller} fade data-flx="music.music-queue-tab.scroller">
				<div className={styles.scrollContent} data-flx="music.music-queue-tab.scroll-content">
					<section className={styles.section} aria-label="Fila" data-flx="music.music-queue-tab.queue">
						{user.length === 0 ? (
							<p className={styles.muted} data-flx="music.music-queue-tab.empty">
								A fila está vazia.
							</p>
						) : (
							<ul className={styles.list} data-flx="music.music-queue-tab.list">
								{user.map((item) => (
									<QueueRow
										key={item.id}
										item={item}
										index={queueIndexOf(session, item.id)}
										session={session}
										run={run}
										pending={pending}
									/>
								))}
							</ul>
						)}
					</section>
					{recommended.length > 0 && (
						<section
							className={styles.section}
							aria-label="A seguir — recomendadas"
							data-flx="music.music-queue-tab.recommended"
						>
							<h3 className={styles.sectionTitle} data-flx="music.music-queue-tab.recommended.title">
								A seguir — recomendadas
							</h3>
							<ul className={styles.list} data-flx="music.music-queue-tab.recommended.list">
								{recommended.map((item) => (
									<QueueRow
										key={item.id}
										item={item}
										index={queueIndexOf(session, item.id)}
										session={session}
										run={run}
										pending={pending}
									/>
								))}
							</ul>
						</section>
					)}
					{showRadioNotice(session) && (
						<p className={styles.radioNotice} data-flx="music.music-queue-tab.radio-notice">
							Rádio do Spotify: as próximas aparecem quando tocarem
						</p>
					)}
					{overflow && (
						<p className={styles.muted} data-flx="music.music-queue-tab.overflow">
							{overflow}
						</p>
					)}
				</div>
			</Scroller>
			<footer className={styles.footer} data-flx="music.music-queue-tab.footer">
				<Button
					variant="danger"
					small
					fitContainer
					disabled={pending}
					onClick={handleStop}
					data-flx="music.music-queue-tab.button.stop"
				>
					Encerrar música
				</Button>
			</footer>
		</div>
	);
});
