# Tasfiya local server release

This branch contains only the files needed by the local web server. It is not
the desktop-client release.

## One-time setup on the server PC

1. Install Git for Windows if `git --version` does not work.
2. Clone this branch into a new folder under `D:\TasfiyaServer`.
3. Run `npm install` inside the cloned folder.
4. Run `install-update-button.ps1` once. It switches the existing scheduled
   task to this folder and creates the desktop update button.

The `DATABASE_URL` remains in the Windows user environment and is never stored
in this repository. Double-click the desktop update button only after a new
version has been published to this branch.

## Restore reports on an existing local PostgreSQL server

For an active application at `C:\TasfiyaProServer` that already uses the local
database, run from this updated checkout in an Administrator PowerShell:

```powershell
.\scripts\update-active-web-features.ps1 -TargetPath 'C:\TasfiyaProServer'
```

The installer reads the existing protected PostgreSQL configuration from
`C:\ProgramData\TasfiyaPro\web-server.json`. It rejects remote databases and
does not request or print passwords. It installs the report runtime in an
isolated directory and checks four real PDF types over a read-only database
session **before** stopping any running server. Use `-CheckOnly` to stop after
these preflight checks.

On success it backs up the original web module and task definitions, redirects
only `src/local-server.js` to the isolated web release, disables matching legacy
Tasfiya startup tasks, and starts one `TasfiyaPro-WebFeatures` SYSTEM task on
port 4000. It preserves the target's startup/database/sync modules, node_modules,
and the original shared database config. The new task uses its own protected
config and log under `C:\ProgramData\TasfiyaPro\WebFeatures`.

Success requires the expected `/api/server-version` response on port 4000;
starting a task alone is not success. A failed switch attempts to restore the
previous module and task settings, and identifies the retained backup directory.
Tailscale is not changed; its existing target must be `127.0.0.1:4000`.
Actual device share sheets still require browser/phone validation after deployment.
