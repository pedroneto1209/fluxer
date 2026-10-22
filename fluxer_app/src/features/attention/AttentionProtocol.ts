// SPDX-License-Identifier: AGPL-3.0-or-later

// "Chamar atenção" travels as LiveKit data messages inside the call, addressed only to
// the people involved:
//   nudge  {"v":1,"wink":"<wink id>"|null,"nonce":"<id>"}   sender -> person nudged
//   ack    {"v":1,"ack":"<nonce>","status":"shown"|"blocked"|"busy"}   back to the sender
// Older clients send nudges without a nonce and never get an ack.

export const ATTENTION_DATA_TOPIC = 'fluxer.custom.attention.v1';
const MAX_PAYLOAD_BYTES = 256;
const WINK_ID_RE = /^[a-z0-9-]{1,40}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{6,40}$/;

export type AttentionAckStatus = 'shown' | 'blocked' | 'busy';
const ACK_STATUSES: ReadonlyArray<AttentionAckStatus> = ['shown', 'blocked', 'busy'];

export type AttentionMessage =
	| {type: 'nudge'; winkId: string | null; nonce: string | null}
	| {type: 'ack'; nonce: string; status: AttentionAckStatus};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeAttentionNudge(winkId: string | null, nonce: string): Uint8Array<ArrayBuffer> {
	return encoder.encode(JSON.stringify({v: 1, wink: winkId, nonce}));
}

export function encodeAttentionAck(nonce: string, status: AttentionAckStatus): Uint8Array<ArrayBuffer> {
	return encoder.encode(JSON.stringify({v: 1, ack: nonce, status}));
}

export function decodeAttentionMessage(payload: Uint8Array): AttentionMessage | null {
	if (payload.byteLength > MAX_PAYLOAD_BYTES) return null;
	try {
		const message: unknown = JSON.parse(decoder.decode(payload));
		if (typeof message !== 'object' || message === null) return null;
		const {v, wink, nonce, ack, status} = message as Record<string, unknown>;
		if (v !== 1) return null;
		if (ack !== undefined) {
			if (typeof ack !== 'string' || !NONCE_RE.test(ack)) return null;
			if (!ACK_STATUSES.includes(status as AttentionAckStatus)) return null;
			return {type: 'ack', nonce: ack, status: status as AttentionAckStatus};
		}
		const validNonce = typeof nonce === 'string' && NONCE_RE.test(nonce) ? nonce : null;
		if (wink === null || wink === undefined) return {type: 'nudge', winkId: null, nonce: validNonce};
		if (typeof wink !== 'string' || !WINK_ID_RE.test(wink)) return null;
		return {type: 'nudge', winkId: wink, nonce: validNonce};
	} catch {
		return null;
	}
}
