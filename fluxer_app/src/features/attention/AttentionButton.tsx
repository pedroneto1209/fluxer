// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/attention/AttentionButton.module.css';
import Authentication from '@app/features/auth/state/Authentication';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type {User} from '@app/features/user/models/User';
import MediaEngine, {useMediaEngineVersion} from '@app/features/voice/engine/MediaEngineFacade';
import {BellRingingIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

// Shown inside voice participant rows, which are themselves clickable, so it is a span
// with button semantics rather than a nested <button>.
export const AttentionButton = ({user}: {user: User}) => {
	const open = useCallback(
		(event: React.SyntheticEvent) => {
			event.preventDefault();
			event.stopPropagation();
			void import('@app/features/attention/AttentionPanel').then(({openAttentionPanel}) =>
				openAttentionPanel({id: user.id, name: user.displayName}),
			);
		},
		[user],
	);
	const onKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') open(event);
		},
		[open],
	);
	return (
		<Tooltip text="Chamar atenção" data-flx="attention.button.tooltip">
			<span
				role="button"
				tabIndex={0}
				className={styles.button}
				onClick={open}
				onKeyDown={onKeyDown}
				onDoubleClick={(event) => event.stopPropagation()}
				onContextMenu={(event) => event.stopPropagation()}
				aria-label={`Chamar a atenção de ${user.displayName}`}
				data-flx="attention.button"
			>
				<BellRingingIcon weight="fill" size={12} />
			</span>
		</Tooltip>
	);
};

// The bell at the right end of a voice channel participant row: only for other people
// in the call we are connected to, since nudges travel through that call.
export const VoiceRowAttentionButton = observer(({user, channelId}: {user: User; channelId: string | null}) => {
	useMediaEngineVersion();
	const inSameCall = channelId != null && MediaEngine.connected && MediaEngine.channelId === channelId;
	if (!inSameCall || user.bot || user.id === Authentication.currentUserId) return null;
	return (
		<span className={styles.rowSlot} data-flx="attention.voice-row-slot">
			<AttentionButton user={user} />
		</span>
	);
});
