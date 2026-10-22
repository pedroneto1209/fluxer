// SPDX-License-Identifier: AGPL-3.0-or-later

import {Switch} from '@app/features/ui/components/form/FormSwitch';
import styles from '@app/features/voice/mic_flip/MicFlipSettings.module.css';
import MicFlipStore from '@app/features/voice/mic_flip/MicFlipStore';
import type {SoundboardSound} from '@app/features/voice/soundboard/SoundboardApi';
import {HeadsetIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';

const POSITION_LABELS = {
	up: 'Microfone levantado',
	down: 'Microfone abaixado',
	unknown: 'Mexa o microfone uma vez para conferir',
} as const;

// Only shown to people whose headset reports the mic flip (see MicFlipStore).
export const MicFlipSettings = observer(({guildId, sounds}: {guildId: string; sounds: Array<SoundboardSound>}) => {
	if (!MicFlipStore.headsetFound) return null;
	const {enabled, soundId, soundGuildId, soundName, unmuteOnLower, position} = MicFlipStore;
	const savedElsewhere = soundId != null && !sounds.some((sound) => sound.id === soundId);
	return (
		<section className={styles.section} data-flx="voice.mic-flip.section">
			<div className={styles.header} data-flx="voice.mic-flip.header">
				<HeadsetIcon size={18} weight="fill" />
				<span className={styles.title}>Microfone levantado</span>
				<span className={clsx(styles.status, position === 'up' && styles.statusUp)} data-flx="voice.mic-flip.status">
					{MicFlipStore.headsetName} · {POSITION_LABELS[position]}
				</span>
			</div>
			<Switch
				label="Avisar a chamada quando eu levantar o microfone"
				description="Te silencia no Fluxer (todo mundo vê) e toca o som escolhido na chamada."
				value={enabled}
				onChange={MicFlipStore.setEnabled}
				data-flx="voice.mic-flip.switch.enabled"
			/>
			<label className={styles.soundRow} data-flx="voice.mic-flip.sound">
				<span>Som</span>
				<select
					className={styles.select}
					value={soundId ?? ''}
					disabled={!enabled}
					onChange={(event) => {
						const picked = sounds.find((sound) => sound.id === event.target.value);
						MicFlipStore.setSound(picked ? {id: picked.id, guildId, name: picked.name} : null);
					}}
					data-flx="voice.mic-flip.sound.select"
				>
					<option value="">Nenhum (só me silenciar)</option>
					{savedElsewhere && soundGuildId && <option value={soundId ?? ''}>{soundName ?? 'Som salvo'}</option>}
					{sounds.map((sound) => (
						<option key={sound.id} value={sound.id}>
							{sound.emoji ? `${sound.emoji} ` : ''}
							{sound.name}
						</option>
					))}
				</select>
			</label>
			<Switch
				label="Voltar a falar quando eu abaixar o microfone"
				description="Só desmuta se foi o microfone levantado que te silenciou."
				value={unmuteOnLower}
				disabled={!enabled}
				onChange={MicFlipStore.setUnmuteOnLower}
				data-flx="voice.mic-flip.switch.unmute"
			/>
		</section>
	);
});
