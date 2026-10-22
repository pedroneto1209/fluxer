// SPDX-License-Identifier: AGPL-3.0-or-later

// Presentational pieces shared by the music panel and its tabs.

import type {MusicSource} from '@app/features/music/MusicApi';
import styles from '@app/features/music/MusicParts.module.css';
import {Avatar} from '@app/features/ui/components/Avatar';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import Users from '@app/features/user/state/Users';
import {MusicNoteIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useState} from 'react';

const SOURCE_LABEL: Record<MusicSource, string> = {spotify: 'Spotify', youtube: 'YouTube'};

interface IconButtonProps {
	label: string;
	icon: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	primary?: boolean;
	'data-flx': string;
}

export function IconButton({label, icon, onClick, disabled, primary, 'data-flx': dataFlx}: IconButtonProps) {
	return (
		<Tooltip text={label} data-flx={`${dataFlx}.tooltip`}>
			<FocusRing offset={-2} data-flx={`${dataFlx}.focus-ring`}>
				<button
					type="button"
					className={clsx(styles.iconButton, primary && styles.iconButtonPrimary)}
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
					data-flx={dataFlx}
				>
					{icon}
				</button>
			</FocusRing>
		</Tooltip>
	);
}

export function Artwork({
	url,
	size,
	'data-flx': dataFlx,
}: {
	url: string | null;
	size: 'large' | 'small';
	'data-flx': string;
}) {
	const [failed, setFailed] = useState(false);
	useEffect(() => setFailed(false), [url]);
	const className = clsx(styles.artwork, size === 'large' ? styles.artworkLarge : styles.artworkSmall);
	if (!url || failed) {
		return (
			<div className={clsx(className, styles.artworkPlaceholder)} aria-hidden="true" data-flx={dataFlx}>
				<MusicNoteIcon weight="fill" data-flx={`${dataFlx}.icon`} />
			</div>
		);
	}
	return (
		<img
			className={className}
			src={url}
			alt=""
			loading="lazy"
			referrerPolicy="no-referrer"
			onError={() => setFailed(true)}
			data-flx={dataFlx}
		/>
	);
}

export function SourceTag({
	source,
	recommended,
	'data-flx': dataFlx,
}: {
	source: MusicSource;
	recommended?: boolean;
	'data-flx': string;
}) {
	return (
		<span
			className={clsx(
				styles.tag,
				recommended ? styles.tagRecommended : source === 'spotify' ? styles.tagSpotify : styles.tagYoutube,
			)}
			data-flx={dataFlx}
		>
			{recommended ? 'Recomendada' : SOURCE_LABEL[source]}
		</span>
	);
}

export const AddedBy = observer(function AddedBy({userId, 'data-flx': dataFlx}: {userId: string; 'data-flx': string}) {
	const user = Users.getUser(userId);
	if (!user) return null;
	return (
		<span className={styles.addedBy} data-flx={dataFlx}>
			<Avatar user={user} size={16} data-flx={`${dataFlx}.avatar`} />
			<span className={styles.addedByName} data-flx={`${dataFlx}.name`}>
				{user.displayName}
			</span>
		</span>
	);
});
