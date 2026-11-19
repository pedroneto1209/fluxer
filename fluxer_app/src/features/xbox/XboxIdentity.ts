// SPDX-License-Identifier: AGPL-3.0-or-later

// The Xbox service joins the call as the participant `xbox_<channelId>` and shares the
// console's picture and sound as a screen share.
const XBOX_IDENTITY_PATTERN = /^xbox_\d+$/;

export function isXboxIdentity(identity: string): boolean {
	return XBOX_IDENTITY_PATTERN.test(identity);
}

export function xboxIdentityForChannel(channelId: string): string {
	return `xbox_${channelId}`;
}
