// SPDX-License-Identifier: AGPL-3.0-or-later

// The music balloon: a popout with the "Fila" and "Buscar" tabs. It opens above the 🎵 button
// of the call control bar, to the right of the "🎵 Música" row of the channel sidebar and
// from the mini player. All of them share MUSIC_BALLOON_KEY, so there is only one balloon:
// clicking the trigger it hangs from closes it, clicking another trigger moves it there.

import type {Channel} from '@app/features/channel/models/Channel';
import styles from '@app/features/music/MusicBalloon.module.css';
import MusicBalloonState, {
	initialTabFor,
	MUSIC_BALLOON_KEY,
	type MusicBalloonTab,
} from '@app/features/music/MusicBalloonState';
import {MusicLyricsTab} from '@app/features/music/MusicLyricsViews';
import {IconButton} from '@app/features/music/MusicParts';
import {queueTabLabel} from '@app/features/music/MusicQueueModel';
import {MusicQueueTab} from '@app/features/music/MusicQueueTab';
import {MusicSearchTab} from '@app/features/music/MusicSearchTab';
import MusicStore from '@app/features/music/MusicStore';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import type {PopoutPosition} from '@app/features/ui/popover';
import {Popout} from '@app/features/ui/popover/PopoverPopout';
import PopoutState from '@app/features/ui/state/Popout';
import {XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React, {useCallback} from 'react';

export const TRIGGER_ATTRIBUTE = 'data-music-balloon-trigger';

export const MusicBalloon = observer(function MusicBalloon({channel}: {channel: Channel}) {
	const session = MusicStore.sessionByChannel.get(channel.id) ?? null;
	const pending = MusicStore.commandPending;
	const run = MusicStore.runCommand;
	const error = MusicStore.commandError;
	const tab = MusicBalloonState.tab;
	const tabs: Array<{id: MusicBalloonTab; label: string}> = [
		{id: 'queue', label: queueTabLabel(session)},
		{id: 'search', label: 'Buscar'},
		{id: 'lyrics', label: 'Letra'},
	];

	return (
		<div className={styles.balloon} role="dialog" aria-label="Música" data-flx="music.music-balloon">
			<header className={styles.header} data-flx="music.music-balloon.header">
				<div className={styles.tabs} role="tablist" aria-label="Música" data-flx="music.music-balloon.tabs">
					{tabs.map(({id, label}) => (
						<FocusRing key={id} offset={-2} data-flx={`music.music-balloon.tab.${id}.focus-ring`}>
							<button
								type="button"
								role="tab"
								aria-selected={tab === id}
								className={clsx(styles.tab, tab === id && styles.tabActive)}
								onClick={() => MusicBalloonState.setTab(id)}
								data-flx={`music.music-balloon.tab.${id}`}
							>
								{label}
							</button>
						</FocusRing>
					))}
				</div>
				<IconButton
					label="Fechar"
					icon={<XIcon weight="bold" data-flx="music.music-balloon.button.close.icon" />}
					onClick={MusicBalloonState.close}
					data-flx="music.music-balloon.button.close"
				/>
			</header>
			{(error || session?.notice) && (
				<div className={styles.messages} data-flx="music.music-balloon.messages">
					{error && (
						<p className={styles.error} role="alert" data-flx="music.music-balloon.error">
							{error}
						</p>
					)}
					{session?.notice && (
						<p className={styles.notice} data-flx="music.music-balloon.notice">
							{session.notice}
						</p>
					)}
				</div>
			)}
			<div className={styles.body} role="tabpanel" data-flx="music.music-balloon.body">
				{tab === 'queue' ? (
					session ? (
						<MusicQueueTab session={session} run={run} pending={pending} />
					) : (
						<p className={styles.muted} data-flx="music.music-balloon.queue-idle">
							Nada tocando agora.
						</p>
					)
				) : tab === 'lyrics' ? (
					<MusicLyricsTab session={session} />
				) : (
					<MusicSearchTab session={session} channel={channel} run={run} pending={pending} />
				)}
			</div>
		</div>
	);
});

export function isOtherTriggerClick(event: Event | undefined): boolean {
	const target = event?.target;
	return event instanceof MouseEvent && target instanceof Element && target.closest(`[${TRIGGER_ATTRIBUTE}]`) != null;
}

/** Clicking another trigger closes the balloon here so the click reopens it at that trigger. */
export function moveFromOtherTrigger(event: React.MouseEvent<HTMLElement>): boolean {
	const open = PopoutState.popouts[MUSIC_BALLOON_KEY];
	if (open && open.target !== event.currentTarget) PopoutCommands.finishClose(MUSIC_BALLOON_KEY);
	return true;
}

interface MusicBalloonPopoutProps {
	channel: Channel;
	position: PopoutPosition;
	/** Tab to open on; by default the queue while music plays, otherwise search. */
	initialTab?: MusicBalloonTab;
	/** Tooltip of the trigger (Popout's own, since a Tooltip around the Popout loses its events). */
	tooltip?: string;
	children: React.ReactElement<Record<string, unknown>>;
}

/** Makes `children` (a button) open the music balloon. */
export function MusicBalloonPopout({channel, position, initialTab, tooltip, children}: MusicBalloonPopoutProps) {
	const handleOpen = useCallback(() => {
		MusicBalloonState.openAt(initialTab ?? initialTabFor(MusicStore.sessionByChannel.get(channel.id) ?? null));
	}, [channel.id, initialTab]);
	const renderBalloon = useCallback(
		() => <MusicBalloon channel={channel} data-flx="music.music-balloon-popout.balloon" />,
		[channel],
	);
	return (
		<Popout
			uniqueId={MUSIC_BALLOON_KEY}
			position={position}
			tooltip={tooltip}
			offsetMainAxis={8}
			render={renderBalloon}
			onOpen={handleOpen}
			onClose={MusicStore.clearCommandError}
			// The outside click of another trigger must not close the balloon first: that
			// trigger's own click moves it (moveFromOtherTrigger).
			onCloseRequest={(event) => !isOtherTriggerClick(event)}
			shouldOpenOnClick={moveFromOtherTrigger}
			data-flx="music.music-balloon-popout.popout"
		>
			{React.cloneElement(children, {[TRIGGER_ATTRIBUTE]: 'true'})}
		</Popout>
	);
}
