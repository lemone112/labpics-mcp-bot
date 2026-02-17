# Cursor Bugbot (setup and operations)

This repository is prepared for Cursor Bugbot with:

- `/.cursor/BUGBOT.md` (project-specific review rules)
- `/.cursor-bugbot.yaml` (review trigger/pattern preferences)

## Current status

At the time of this setup, no active Bugbot checks/comments were detected in recent PR activity for this repo.

## Enable Bugbot Pro

Bugbot Pro is enabled from Cursor dashboard (not from git alone).

1. Open **Cursor Dashboard**: <https://cursor.com/dashboard?tab=integrations>
2. Connect GitHub for your team/account (requires GitHub org/repo admin permissions).
3. In the Bugbot tab, enable repository:
   - `https://github.com/lemone112/labpics-dashboard`
4. Start Bugbot Pro (or trial) in billing settings if required.

## Trigger and verification

- Automatic: on PR events (`opened`, `ready_for_review`, `synchronize`, `reopened`)
- Manual: comment in PR
  - `cursor review`
  - `bugbot run`

Verify setup by opening/updating a PR and confirming Bugbot activity in checks/comments.

## Troubleshooting

If Bugbot does not run:

1. Confirm GitHub integration is connected in Cursor dashboard.
2. Confirm this repo is enabled in Bugbot tab.
3. Use verbose trigger:
   - `cursor review verbose=true`
4. Validate repo access permissions in GitHub app installation settings.

