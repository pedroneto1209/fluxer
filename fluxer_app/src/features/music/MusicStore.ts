// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	fetchMusicServiceAvailable,
	listGuildSessions,
	MusicApiError,
	type MusicGuildSession,
	type MusicSessionState,
} from '@app/features/music/MusicApi';
import {createMusicCommandRunner} from '@app/features/music/MusicPanelStateMachine';
import {makeAutoObservable, runInAction} from 'mobx';

export type MusicAvailability = 'unknown' | 'checking' | 'available' | 'unavailable';

const SERVICE_RECHECK_MS = 5 * 60_000;

const ERROR_MESSAGES: Record<string, string> = {
	UNAUTHORIZED: 'Você precisa estar conectado para usar a música.',
	NOT_A_MEMBER: 'Você precisa ser membro desta comunidade.',
	NOT_IN_CHANNEL: 'Entre no canal de voz para controlar a música.',
	NO_SESSION: 'Não há música tocando neste canal.',
	SPOTIFY_NOT_CONNECTED: 'Conecte sua conta do Spotify para tocar músicas do Spotify.',
	SPOTIFY_ACCOUNT_BUSY: 'Esta conta do Spotify já está tocando em outro canal.',
	UNSUPPORTED_LINK: 'Este link não é suportado.',
	TRACK_UNAVAILABLE: 'Esta faixa não está disponível.',
	QUEUE_FULL: 'A fila está cheia.',
	INVALID_STATE: 'A autorização do Spotify expirou. Tente conectar novamente.',
	INVALID_REDIRECT_URL: 'O endereço de redirecionamento do Spotify é inválido.',
	BAD_REQUEST: 'Pedido inválido.',
	SPOTIFY_AUTH_FAILED: 'Não foi possível autorizar a conta do Spotify.',
	SPOTIFY_UNREACHABLE: 'Não foi possível falar com o Spotify.',
	LIVEKIT_UNREACHABLE: 'Não foi possível conectar ao canal de voz.',
	NOT_FOUND: 'Não encontrado.',
	NETWORK: 'Não foi possível falar com o serviço de música.',
};

class MusicStore {
	availability: MusicAvailability = 'unknown';
	sessionByChannel = new Map<string, MusicSessionState>();
	guildSessions = new Map<string, Array<MusicGuildSession>>();
	panelOpen = false;
	/** Text of the panel's search field, kept here so it survives the panel remounting. */
	searchText = '';
	/** A panel command (skip, pause, queue edits, stop) is in flight. */
	commandPending = false;
	/** Error of the last panel command, ready to show. */
	commandError: string | null = null;
	private lastCheckAt = 0;
	// Held here, not in the panel, so a panel remount mid-command still blocks a second one.
	private readonly commandRunner = createMusicCommandRunner<MusicSessionState>({
		apply: (state) => this.applyState(state),
		onError: (error) =>
			runInAction(() => {
				this.commandError = error == null ? null : this.describeMusicError(error);
			}),
		onPendingChange: (pending) =>
			runInAction(() => {
				this.commandPending = pending;
			}),
	});

	constructor() {
		makeAutoObservable<this, 'lastCheckAt' | 'commandRunner'>(
			this,
			{lastCheckAt: false, commandRunner: false, runCommand: false},
			{autoBind: true},
		);
	}

	async checkAvailability(force = false): Promise<void> {
		if (this.availability === 'checking') return;
		if (!force && this.availability !== 'unknown' && Date.now() - this.lastCheckAt < SERVICE_RECHECK_MS) return;
		this.availability = 'checking';
		const available = await fetchMusicServiceAvailable();
		runInAction(() => {
			this.availability = available ? 'available' : 'unavailable';
			this.lastCheckAt = Date.now();
		});
	}

	applyState(state: MusicSessionState): void {
		const current = this.sessionByChannel.get(state.channelId);
		if (current && state.revision < current.revision) return;
		this.sessionByChannel.set(state.channelId, state);
	}

	clearChannel(channelId: string): void {
		this.sessionByChannel.delete(channelId);
	}

	currentPositionMs(channelId: string, now: number = Date.now()): number {
		const state = this.sessionByChannel.get(channelId);
		if (!state) return 0;
		const base = Math.max(0, state.positionMs);
		const position = state.paused ? base : base + Math.max(0, now - state.positionAt);
		const duration = state.nowPlaying?.durationMs ?? 0;
		// duration 0 = unknown: extrapolate without clamping.
		return duration > 0 ? Math.min(position, duration) : position;
	}

	/** Runs one command at a time and applies the state it returns; false if ignored or failed. */
	runCommand(command: () => Promise<MusicSessionState | null>): Promise<boolean> {
		return this.commandRunner.run(command);
	}

	togglePanel(): void {
		this.panelOpen = !this.panelOpen;
	}

	openPanel(): void {
		this.panelOpen = true;
	}

	closePanel(): void {
		this.panelOpen = false;
	}

	setSearchText(text: string): void {
		this.searchText = text;
	}

	async refreshGuildSessions(guildId: string): Promise<void> {
		try {
			const sessions = await listGuildSessions(guildId);
			runInAction(() => {
				this.guildSessions.set(guildId, sessions);
			});
		} catch {
			runInAction(() => {
				this.guildSessions.delete(guildId);
			});
		}
	}

	describeMusicError(error: unknown): string {
		if (error instanceof MusicApiError) return ERROR_MESSAGES[error.code] ?? error.message;
		if (error instanceof Error && error.message) return error.message;
		return 'Algo deu errado.';
	}
}

export default new MusicStore();
