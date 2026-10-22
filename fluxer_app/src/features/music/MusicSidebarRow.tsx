// SPDX-License-Identifier: AGPL-3.0-or-later

// "🎵 Música · <title>" under a voice channel in the sidebar, visible to the whole community.
// Inside that call the click opens the music balloon to its right and the context menu has
// the music volume and mute; elsewhere the click opens the read-only peek.

import type {Channel} from '@app/features/channel/models/Channel';
import {MusicBalloonPopout} from '@app/features/music/MusicBalloon';
import {isMusicUsableInCall} from '@app/features/music/MusicCall';
import {MusicPeekPopout} from '@app/features/music/MusicPeekBalloon';
import {musicRowLabel, pickSidebarMusic} from '@app/features/music/MusicSidebarLabel';
import {ensureMusicSidebarPolling} from '@app/features/music/MusicSidebarPolling';
import styles from '@app/features/music/MusicSidebarRow.module.css';
import MusicStore from '@app/features/music/MusicStore';
import MusicVolume from '@app/features/music/MusicVolume';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import {MenuItemSlider} from '@app/features/ui/action_menu/MenuItemSlider';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect} from 'react';

const MusicVolumeMenu = observer(function MusicVolumeMenu({'data-flx': dataFlx}: {'data-flx'?: string}) {
	return (
		<MenuGroup data-flx={dataFlx ?? 'music.sidebar-row.volume-menu.menu-group'}>
			<MenuItemSlider
				label="Volume da música"
				value={Math.round(MusicVolume.volume * 100)}
				minValue={0}
				maxValue={100}
				onChange={(value) => MusicVolume.setVolume(value / 100)}
				data-flx="music.sidebar-row.volume-slider"
			/>
			<MenuItem onClick={MusicVolume.toggleMuted} closeOnSelect={false} data-flx="music.sidebar-row.mute">
				{MusicVolume.muted ? 'Reativar o som da música' : 'Silenciar a música'}
			</MenuItem>
		</MenuGroup>
	);
});

export const MusicSidebarRow = observer(function MusicSidebarRow({
	guildId,
	channel,
}: {
	guildId: string;
	channel: Channel;
}) {
	useEffect(() => ensureMusicSidebarPolling(), []);
	const inCall = MediaEngine.channelId === channel.id;
	const music = pickSidebarMusic({
		channelId: channel.id,
		guildSessions: MusicStore.guildSessions.get(guildId),
		liveSession: inCall ? MusicStore.sessionByChannel.get(channel.id) : undefined,
		available: MusicStore.availability === 'available',
	});
	const handleContextMenu = useCallback(
		(event: React.MouseEvent) => {
			if (MediaEngine.channelId !== channel.id) return;
			event.preventDefault();
			event.stopPropagation();
			ContextMenuCommands.openFromEvent(event, () => <MusicVolumeMenu data-flx="music.sidebar-row.volume-menu" />);
		},
		[channel.id],
	);
	if (!music) return null;
	if (inCall && isMusicUsableInCall(channel.id)) {
		return (
			<MusicBalloonPopout channel={channel} position="right" data-flx="music.sidebar-row.balloon-popout">
				<button type="button" className={styles.row} onContextMenu={handleContextMenu} data-flx="music.sidebar-row.row">
					{musicRowLabel(music.title)}
				</button>
			</MusicBalloonPopout>
		);
	}
	return (
		<MusicPeekPopout guildId={guildId} channel={channel} data-flx="music.sidebar-row.peek-popout">
			<button type="button" className={styles.row} onContextMenu={handleContextMenu} data-flx="music.sidebar-row.row">
				{musicRowLabel(music.title)}
			</button>
		</MusicPeekPopout>
	);
});
