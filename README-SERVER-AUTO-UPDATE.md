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
