// SPDX-License-Identifier: AGPL-3.0-or-later

// What the Xbox service says (polled while a call view needs it) and the owner's
// start / stop / sign-in commands.

import * as ToastCommands from '@app/features/ui/commands/ToastCommands';
import {
	beginXboxLogin,
	fetchXboxStatus,
	startXboxStream,
	stopXboxStream,
	XboxApiError,
	type XboxStatus,
} from '@app/features/xbox/XboxApi';
import {makeAutoObservable, runInAction} from 'mobx';

const POLL_MS = 4000;

class XboxStore {
	status: XboxStatus | null = null;
	/** null until the first answer; false when the instance has no Xbox service. */
	available: boolean | null = null;
	busy = false;

	private pollers = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private refreshing = false;

	constructor() {
		makeAutoObservable<this, 'pollers' | 'timer' | 'refreshing'>(this, {
			pollers: false,
			timer: false,
			refreshing: false,
		});
	}

	async refresh(): Promise<void> {
		if (this.refreshing) return;
		this.refreshing = true;
		try {
			const next = await fetchXboxStatus();
			const previous = this.status?.stream;
			runInAction(() => {
				this.status = next;
				this.available = true;
			});
			// Tell the owner when a stream they started fails or ends by itself.
			if (next.canControl && previous && previous.state !== next.stream.state) {
				if (next.stream.state === 'error' && next.stream.error) {
					ToastCommands.error(`Xbox: ${next.stream.error}`);
				} else if (previous.state === 'live' && next.stream.state === 'idle' && next.stream.ended) {
					ToastCommands.success(`Xbox parou: ${next.stream.ended}`);
				}
			}
		} catch (error) {
			if (error instanceof XboxApiError && (error.code === 'UNAVAILABLE' || error.status === 404)) {
				runInAction(() => {
					this.available = false;
				});
			}
		} finally {
			this.refreshing = false;
		}
	}

	/** Keeps the status fresh while the returned function has not been called. */
	poll(): () => void {
		this.pollers += 1;
		if (this.pollers === 1) {
			const tick = () => {
				void this.refresh().finally(() => {
					if (this.pollers > 0) this.timer = setTimeout(tick, POLL_MS);
				});
			};
			tick();
		}
		let stopped = false;
		return () => {
			if (stopped) return;
			stopped = true;
			this.pollers -= 1;
			if (this.pollers === 0 && this.timer) {
				clearTimeout(this.timer);
				this.timer = null;
			}
		};
	}

	private async command(run: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			await run();
		} catch (error) {
			ToastCommands.error(error instanceof Error ? error.message : 'Algo deu errado com o Xbox.');
		} finally {
			runInAction(() => {
				this.busy = false;
			});
			await this.refresh();
		}
	}

	start(guildId: string, channelId: string): Promise<void> {
		return this.command(() => startXboxStream(guildId, channelId));
	}

	stop(): Promise<void> {
		return this.command(stopXboxStream);
	}

	signIn(): Promise<void> {
		return this.command(async () => {
			const login = await beginXboxLogin();
			ToastCommands.createToast({
				type: 'info',
				timeout: 120_000,
				children: `Abra ${login.verificationUri} e digite o código ${login.userCode} com a conta Microsoft do Xbox.`,
			});
		});
	}
}

export default new XboxStore();
