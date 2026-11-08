# Windows portable beta

The current version is **1.1.0-beta.2** for Windows x64. It includes English and Chinese interface selection, English demos, and language-aware new matches.

[English distribution on GitHub](https://github.com/changge-ben/zhengming) · [Chinese distribution on Gitee](https://gitee.com/shi-blca/zhengming)

## Download and launch

1. Download `zhengming-1.1.0-beta.2-windows-x64.zip` from the [GitHub release page](https://github.com/changge-ben/zhengming/releases/tag/v1.1.0-beta.2).
2. Extract the complete ZIP into a stable folder. Folder names can include spaces and Chinese characters.
3. Double-click **启动争鸣.cmd**. The default browser opens the local app.
4. Select **EN**, then **Watch a demo**. Configure live providers under **Model connections**.
5. End the match before running **停止争鸣.cmd** to stop the service.
6. Run **环境诊断.cmd** for a local diagnostic report.

The package contains the official [Node.js 24.22.2 Windows x64 runtime](https://nodejs.org/dist/v24.22.2/), checked against its published SHA-256 list. It opens `http://127.0.0.1:5173/` and provides the runtime and dependencies needed to run the app. Live providers require network access and the user's API permissions.

## Data and updates

| Content | Location |
| --- | --- |
| Providers, model IDs, remembered encrypted keys | `%LOCALAPPDATA%\Zhengming\providers.json` |
| Service logs, process records, diagnostic reports | `%LOCALAPPDATA%\Zhengming` |
| Match archives and cumulative results | Local storage for the current browser and app origin |
| In-progress recovery snapshots | The current tab's session storage |

Finish the current match and stop the old service before updating. Extract the new version into a new folder, then launch it. The same Windows account, browser, and local address continue to use the fixed configuration directory and browser archives. Export important matches before changing devices, browsers, or browser storage.

Source installations use `.local/providers.json` in the project folder. To migrate, stop both services, back up the destination file, then copy that configuration into the fixed portable data directory. Windows DPAPI binds remembered keys to the original account and machine. Other devices require the key to be entered again.

## Startup, stop, and diagnostics

- The launcher checks the package file manifest and SHA-256 values before startup. Missing or changed files produce extraction guidance.
- An already-running matching version is reused. Different versions and occupied ports receive explicit conflict messages.
- A local mutex serializes startup to handle repeated clicks.
- Stop checks the process ID, executable, and start time, then asks the user to confirm.
- Diagnostics record the version, system, file integrity, service status, and log locations in a local report.
- Runtime and dependency license notices are included in `runtime/NODE-LICENSE.txt` and `THIRD-PARTY-NOTICES.txt`.

## Build and verify

Use Windows and Node 22.12 or later in the source folder.

```powershell
npm ci
npm run check
npm test
npm run package:windows
npm run test:portable
```

The runtime is pinned to `24.22.2`. The first build downloads and verifies it from the official Node.js distribution, and later builds reuse verified cached data. Packaging uses an explicit inclusion list for the frontend, bundled backend, runtime, launch tools, usage guide, integrity manifest, and licenses.

Artifacts are written to `.local/releases`, including the ZIP, its SHA-256 file, and the build manifest. Existing artifacts with the same version are preserved, and the packager requires a new output location or version for another build.

GitHub Actions runs type checks, automated tests, portable packaging, and extraction/startup checks on Windows. Artifacts are retained for 14 days. The workflow uses repository read permission and mock providers with fixture credentials.

## Verification scope

Eight portable-package checks cover Unicode and space-containing paths, launch with system Node removed from `PATH`, static assets, repeated startup, mock SSE, DPAPI recovery, moved application folders, diagnostics, stop, port conflicts, and damaged files.

Current checks run on the development Windows machine and GitHub Windows runners. Broader device feedback and real-provider compatibility checks remain part of beta evaluation.
