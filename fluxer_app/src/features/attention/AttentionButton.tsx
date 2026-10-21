// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/attention/AttentionButton.module.css';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import type {User} from '@app/features/user/models/User';
import {BellRingingIcon} from '@phosphor-icons/react';
import type React from 'react';
import {useCallback} from 'react';

// Shown inside rows that are themselves buttons (member list, DM list), so it is a
// span with button semantics rather than a nested <button>.
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
				onContextMenu={(event) => event.stopPropagation()}
				aria-label={`Chamar a atenção de ${user.displayName}`}
				data-flx="attention.button"
			>
				<BellRingingIcon weight="fill" size={16} />
			</span>
		</Tooltip>
	);
};
