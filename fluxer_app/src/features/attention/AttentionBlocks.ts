// SPDX-License-Identifier: AGPL-3.0-or-later

// People whose "chamar atenção" nudges we ignore. Kept on this device; the sender is
// told their wink was blocked (see AttentionStore).

import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import {initializeStore} from '@app/features/platform/utils/StoreInitialization';
import {makeAutoObservable} from 'mobx';

class AttentionBlocks {
	blockedUserIds: Array<string> = [];

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		initializeStore(this, () => makePersistent(this, 'AttentionBlocks', ['blockedUserIds']));
	}

	isBlocked(userId: string): boolean {
		return this.blockedUserIds.includes(userId);
	}

	setBlocked(userId: string, blocked: boolean): void {
		const without = this.blockedUserIds.filter((id) => id !== userId);
		this.blockedUserIds = blocked ? [...without, userId] : without;
	}
}

export default new AttentionBlocks();
