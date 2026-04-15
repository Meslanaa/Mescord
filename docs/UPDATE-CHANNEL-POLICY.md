# Update Channel Policy

This public repository is updates-only.

Rules:
1. Never publish application source code to main.
2. Publish only updater artifacts for each release version.
3. Keep release assets compatible with electron-updater (latest.yml + setup exe + blockmap).

Release process reminder:
1. Build from private source code.
2. Publish binaries and latest.yml to GitHub Releases.
3. Verify latest.yml version matches the installer version.
