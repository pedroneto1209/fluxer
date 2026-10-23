// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/voice/mic_flip/Away.module.css';
import {WarningCircleIcon} from '@phosphor-icons/react';

export const awayRowClassName = styles.awayRow;
export const awayNameClassName = styles.awayName;

// The alert icon in front of the name on a red sidebar row.
export const AwayRowIcon = () => (
	<WarningCircleIcon weight="bold" className={styles.awayIcon} aria-hidden="true" data-flx="voice.away.row-icon" />
);

// Covers a call tile while that person has their mic flipped up.
export const AwayTileOverlay = () => (
	<div className={styles.tileOverlay} role="img" aria-label="Temporariamente indisponível" data-flx="voice.away.tile">
		<div className={styles.sign} data-flx="voice.away.tile.sign" />
		<div className={styles.labels} data-flx="voice.away.tile.labels">
			<span className={`${styles.label} ${styles.labelSmall}`}>Temporariamente</span>
			<span className={`${styles.label} ${styles.labelBig}`}>Indisponível</span>
		</div>
	</div>
);
