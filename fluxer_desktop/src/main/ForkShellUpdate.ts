// SPDX-License-Identifier: AGPL-3.0-or-later

// Shell self-updates for builds that run the bundled renderer (module system off).
//
// The module bootstrap is what normally arms the desktop update gate and its poll,
// so a build without the module system never checks for a newer shell. This arms
// the same gate with a shell-only controller: it compares the feed's `latest`
// version with the running shell, and installs through the regular self-update
// path (Velopack on Windows). The renderer's existing update UI drives it.

import {createChildLogger} from '@electron/common/Logger';
import {resolveModulePollPlan} from '@electron/common/ModulePollPlan';
import {armDesktopUpdate, checkDesktopUpdateNow} from '@electron/main/DesktopUpdateGate';
import {armDesktopUpdatePoll} from '@electron/main/DesktopUpdatePoll';
import {compareShellVersions} from '@electron/main/ModuleVersion';
import {getUpdateBaseUrl} from '@electron/main/ShellDownloadFormats';
import {resolveShellUpdatePlan, ShellUpdateCapability} from '@electron/main/ShellUpdateCapability';
import {app, net} from 'electron';

const logger = createChildLogger('ForkShellUpdate');

async function fetchLatestShellVersion(): Promise<string> {
	const response = await net.fetch(`${getUpdateBaseUrl()}/latest`, {
		cache: 'no-store',
		headers: {Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache'},
	});
	if (!response.ok) {
		throw new Error(`Latest version request failed: ${response.status}`);
	}
	const payload = (await response.json()) as {version?: unknown};
	if (typeof payload.version !== 'string' || payload.version.length === 0) {
		throw new Error('Latest version response missing version string');
	}
	return payload.version;
}

export async function armBundledRendererShellUpdates(): Promise<void> {
	await app.whenReady();
	const plan = resolveShellUpdatePlan();
	if (plan.capability !== ShellUpdateCapability.SELF_UPDATE) {
		logger.info('Shell self-updates are not available for this install', plan);
		return;
	}

	armDesktopUpdate({
		check: async () => {
			const latest = await fetchLatestShellVersion();
			const shellNewer = compareShellVersions(latest, app.getVersion()) > 0;
			logger.info('Checked for a newer shell', {current: app.getVersion(), latest, shellNewer});
			return {shellNewer, modulesChanged: false};
		},
		start: async () => {
			// Show the same update splash the module bootstrap uses, so the download and the
			// restart are visible instead of the app sitting still until it relaunches.
			const splash = await import('@electron/main/SplashWindow');
			// The app is already running; closing this splash must not quit it.
			splash.markSplashLaunching();
			splash.openSplashWindow();
			splash.setSplashState({status: splash.SplashStatus.SHELL_UPDATE_DOWNLOADING, progress: null});
			const {runShellSelfUpdate} = await import('@electron/main/ShellSelfUpdate');
			const result = await runShellSelfUpdate(plan, {
				onDownloading: (progress) => {
					splash.setSplashState({status: splash.SplashStatus.SHELL_UPDATE_DOWNLOADING, progress});
				},
				onRestarting: () => {
					logger.info('Restarting to apply the shell update');
					splash.setSplashState({status: splash.SplashStatus.SHELL_UPDATE_RESTARTING});
				},
			});
			splash.closeSplashWindow();
			logger.warn('The shell self update did not restart the app', result);
			if (result.reason !== 'no-update') {
				const {reportDesktopUpdateFailure} = await import('@electron/main/DesktopUpdatePrompt');
				await reportDesktopUpdateFailure(result);
			}
		},
	});

	armDesktopUpdatePoll(
		{
			plan: resolveModulePollPlan(null),
			check: () => checkDesktopUpdateNow(),
			logger,
		},
		true,
	);
}
