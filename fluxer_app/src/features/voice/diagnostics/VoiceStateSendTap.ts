// SPDX-License-Identifier: AGPL-3.0-or-later

// Lets the voice drop recorder see every voice state update the gateway sends, so a
// leave can be traced back to the code that asked for it. Import-free on purpose: the
// gateway socket calls it and must not pull in voice code.

export interface SentVoiceState {
	guild_id: string | null;
	channel_id: string | null;
	connection_id?: string | null;
	self_mute: boolean;
	self_deaf: boolean;
}

type VoiceStateSendListener = (params: SentVoiceState) => void;

let listener: VoiceStateSendListener | null = null;

export function setVoiceStateSendListener(next: VoiceStateSendListener | null): void {
	listener = next;
}

export function notifyVoiceStateSend(params: SentVoiceState): void {
	try {
		listener?.(params);
	} catch {}
}
