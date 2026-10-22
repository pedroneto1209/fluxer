// SPDX-License-Identifier: AGPL-3.0-or-later

import AttentionBlocks from '@app/features/attention/AttentionBlocks';
import Authentication from '@app/features/auth/state/Authentication';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import type {User} from '@app/features/user/models/User';
import {BellRingingIcon, BellSlashIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';

// Right-click toggle: stop (or allow again) someone's winks reaching you.
export const AttentionBlockMenuItem = observer(({user}: {user: User}) => {
	if (user.bot || user.system || user.id === Authentication.currentUserId) return null;
	const blocked = AttentionBlocks.isBlocked(user.id);
	return (
		<MenuItem
			icon={blocked ? <BellRingingIcon weight="fill" /> : <BellSlashIcon weight="fill" />}
			onClick={() => AttentionBlocks.setBlocked(user.id, !blocked)}
			data-flx="attention.block-menu-item"
		>
			{blocked ? 'Desbloquear winks' : 'Bloquear winks'}
		</MenuItem>
	);
});
