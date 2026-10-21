// SPDX-License-Identifier: AGPL-3.0-or-later

// The music service joins the call as the participant `music_<channelId>`.
const MUSIC_IDENTITY_PATTERN = /^music_\d+$/;

export function isMusicIdentity(identity: string): boolean {
	return MUSIC_IDENTITY_PATTERN.test(identity);
}

export function musicIdentityForChannel(channelId: string): string {
	return `music_${channelId}`;
}
