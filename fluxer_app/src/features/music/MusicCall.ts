// SPDX-License-Identifier: AGPL-3.0-or-later

// Where music can be used: reads the current call from the media engine. Call from
// observers so the UI follows joins, leaves and mesh-to-SFU conversions.

import {installMusicPanelAutoClose} from '@app/features/music/MusicPanelAutoClose';
import {canUseMusicInCall} from '@app/features/music/MusicPanelStateMachine';
import MusicStore from '@app/features/music/MusicStore';
import MobileLayout from '@app/features/ui/state/MobileLayout';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {isVoiceMeshRoom} from '@app/features/voice/engine/mesh/VoiceMeshRoom';

/** True when the music button and panel may be shown (optionally: for this channel's call). */
export function isMusicUsableInCall(channelId?: string): boolean {
	const room = MediaEngine.room;
	const connectedChannelId = MediaEngine.channelId;
	return canUseMusicInCall({
		availability: MusicStore.availability,
		mobileLayout: MobileLayout.enabled,
		connected:
			room && connectedChannelId
				? {guildId: MediaEngine.guildId, channelId: connectedChannelId, mesh: isVoiceMeshRoom(room)}
				: null,
		channelId,
	});
}

export function isMusicPanelShown(channelId: string): boolean {
	return MusicStore.panelOpen && isMusicUsableInCall(channelId);
}

let autoCloseInstalled = false;

/** Closes the panel when the call ends or changes channel. Safe to call many times. */
export function ensureMusicPanelAutoClose(): void {
	if (autoCloseInstalled) return;
	autoCloseInstalled = true;
	installMusicPanelAutoClose(() => MediaEngine.channelId, MusicStore.closePanel);
}
