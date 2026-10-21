// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção" travels as a LiveKit data message inside the call, addressed only to
// the person being nudged: {"v":1,"wink":"<wink id>"} or {"v":1,"wink":null}.

export const ATTENTION_DATA_TOPIC = 'fluxer.custom.attention.v1';
const MAX_PAYLOAD_BYTES = 256;
const WINK_ID_RE = /^[a-z0-9-]{1,40}$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeAttentionPayload(winkId: string | null): Uint8Array<ArrayBuffer> {
	return encoder.encode(JSON.stringify({v: 1, wink: winkId}));
}

export function decodeAttentionPayload(payload: Uint8Array): {winkId: string | null} | null {
	if (payload.byteLength > MAX_PAYLOAD_BYTES) return null;
	try {
		const message: unknown = JSON.parse(decoder.decode(payload));
		if (typeof message !== 'object' || message === null) return null;
		const {v, wink} = message as {v?: unknown; wink?: unknown};
		if (v !== 1) return null;
		if (wink === null || wink === undefined) return {winkId: null};
		return typeof wink === 'string' && WINK_ID_RE.test(wink) ? {winkId: wink} : null;
	} catch {
		return null;
	}
}
