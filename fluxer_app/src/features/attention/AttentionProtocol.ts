// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção" travels as an ordinary DM, so every client shows a readable line
// and this fork's client recognises it and plays the chosen animation:
//   "🔔 chamou a sua atenção!"              nudge only
//   "🔔 chamou a sua atenção! · <wink name>" nudge with an animation
// Kept free of app imports so the gateway router can check messages cheaply.

export const ATTENTION_MESSAGE_PREFIX = '🔔 chamou a sua atenção!';
const WINK_SEPARATOR = '·';

export function formatAttentionMessage(winkName: string | null): string {
	return winkName ? `${ATTENTION_MESSAGE_PREFIX} ${WINK_SEPARATOR} ${winkName}` : ATTENTION_MESSAGE_PREFIX;
}

export function parseAttentionMessage(content: unknown): {winkName: string | null} | null {
	if (typeof content !== 'string' || !content.startsWith(ATTENTION_MESSAGE_PREFIX)) return null;
	const rest = content.slice(ATTENTION_MESSAGE_PREFIX.length).trim();
	if (!rest) return {winkName: null};
	if (!rest.startsWith(WINK_SEPARATOR)) return null;
	const winkName = rest.slice(WINK_SEPARATOR.length).trim();
	return {winkName: winkName || null};
}
