// SPDX-License-Identifier: AGPL-3.0-or-later

// Polls the music service for the sessions of one community so the sidebar can show
// them to people who are not in the call. Pure: the wiring lives in MusicSidebarPolling.

export const GUILD_SESSIONS_POLL_MS = 15_000;
/** A refocus landing this close to the last poll (or a tick close to a refocus poll) is skipped. */
export const GUILD_SESSIONS_MIN_GAP_MS = 2_000;
/** A poll still running after this long is treated as hung and no longer blocks the next one. */
export const GUILD_SESSIONS_STALE_POLL_MS = 30_000;

export interface MusicGuildSessionsPollerDeps {
	refresh: (guildId: string) => Promise<void>;
	/** Resolves true when the music service is reachable. */
	ensureAvailable: () => Promise<boolean>;
	isVisible: () => boolean;
	/** The service is not available (any more): drop what is shown for the guild. */
	onUnavailable?: (guildId: string) => void;
	intervalMs?: number;
}

export class MusicGuildSessionsPoller {
	private guildId: string | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private generation = 0;
	/** The poll in flight, if any; compared by identity so a hung one can be superseded. */
	private inFlight: {startedAt: number} | null = null;
	private lastPollAt = Number.NEGATIVE_INFINITY;

	constructor(private readonly deps: MusicGuildSessionsPollerDeps) {}

	start(guildId: string): void {
		this.stop();
		this.guildId = guildId;
		const generation = this.generation;
		this.timer = setInterval(() => void this.poll(generation), this.deps.intervalMs ?? GUILD_SESSIONS_POLL_MS);
		void this.poll(generation);
	}

	stop(): void {
		this.generation++;
		this.guildId = null;
		this.inFlight = null;
		this.lastPollAt = Number.NEGATIVE_INFINITY;
		if (this.timer != null) clearInterval(this.timer);
		this.timer = null;
	}

	/** Poll right away when the document becomes visible again. */
	handleVisibilityChange(): void {
		if (this.guildId == null) return;
		void this.poll(this.generation);
	}

	private async poll(generation: number): Promise<void> {
		const guildId = this.guildId;
		if (guildId == null || !this.deps.isVisible()) return;
		const now = Date.now();
		if (this.inFlight && now - this.inFlight.startedAt < GUILD_SESSIONS_STALE_POLL_MS) return;
		if (now - this.lastPollAt < GUILD_SESSIONS_MIN_GAP_MS) return;
		const current = {startedAt: now};
		this.inFlight = current;
		this.lastPollAt = now;
		try {
			const available = await this.deps.ensureAvailable();
			// The guild may have changed while checking availability.
			if (generation !== this.generation) return;
			if (!available) {
				this.deps.onUnavailable?.(guildId);
				return;
			}
			if (!this.deps.isVisible()) return;
			await this.deps.refresh(guildId);
		} finally {
			// stop()/start() or a newer poll after a hung one already replaced it.
			if (this.inFlight === current) this.inFlight = null;
		}
	}
}
