// SPDX-License-Identifier: AGPL-3.0-or-later

// Polls the music service for the sessions of one community so the sidebar can show
// them to people who are not in the call. Pure: the wiring lives in MusicSidebarPolling.

export const GUILD_SESSIONS_POLL_MS = 15_000;

export interface MusicGuildSessionsPollerDeps {
	refresh: (guildId: string) => Promise<void>;
	/** Resolves true when the music service is reachable. */
	ensureAvailable: () => Promise<boolean>;
	isVisible: () => boolean;
	intervalMs?: number;
}

export class MusicGuildSessionsPoller {
	private guildId: string | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private generation = 0;

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
		if (!(await this.deps.ensureAvailable())) return;
		// The guild may have changed while checking availability.
		if (generation !== this.generation || !this.deps.isVisible()) return;
		await this.deps.refresh(guildId);
	}
}
