# Heavener Migrations

## Overview

This directory holds one-shot Firestore migration scripts for the Heavener Property Tool. Each script targets a specific schema change and is intended to be run manually, once per environment, by an operator with admin credentials.

The current migration, `migrate-add-plan-id.js`, backfills a `planId` field (value: `heavener-main`) onto documents in plan-scoped collections so that future per-plan querying and security rules can rely on the field being present.

Each script is idempotent: re-running it skips any document that already has the target field, so partial runs are safe to resume.

## Prerequisites

- Node.js 18 or newer
- A Firebase service account JSON with Firestore write access, saved at `scripts/service-account.json`

## Service Account Setup

1. Open the [Firebase Console](https://console.firebase.google.com/) and select the Heavener project.
2. Go to **Project Settings → Service Accounts**.
3. Click **Generate New Private Key**, confirm, and download the JSON file.
4. Move the downloaded file to `scripts/service-account.json` (exact filename).

This file is gitignored (see repo-root `.gitignore` patterns for `service-account*.json`) because it grants admin-level access to the Firebase project. Never commit it or share it outside the operator running the migration.

## Install

```sh
cd scripts
npm install
```

This installs `firebase-admin` locally. `scripts/node_modules/` is gitignored.

## Usage

The script signature is:

```sh
node migrate-add-plan-id.js <collection> [--dry-run] [--yes]
```

`<collection>` must be one of the allowlisted collections (see Roadmap).

### Dry run (always do this first)

```sh
node migrate-add-plan-id.js flags --dry-run
```

Expected output sample:

```
---
Collection:    flags
Project:       heavener-property-tool
Mode:          DRY RUN
planId value:  heavener-main
---
Total docs in flags: 142
Would update:  138
Would skip:    4 (already have planId)
Sample to-update IDs: ["abc123","def456","ghi789"]
Sample skipped IDs:   ["xyz001","xyz002","xyz003"]
Dry run complete. No writes performed.
```

### Live run

After reviewing the dry-run output, run the live migration. Use `--yes` to skip the interactive confirmation prompt (useful for non-interactive shells):

```sh
node migrate-add-plan-id.js flags --yes
```

Without `--yes`, the script prints the summary and waits for you to type `CONFIRM` on stdin before proceeding.

## Safety

- **Idempotent.** Documents that already carry a `planId` field are skipped, so re-running the script after a partial run will only touch the remaining docs.
- **Dry-run first.** Always run with `--dry-run` and inspect the counts and sample IDs before doing a live run.
- **Batched writes.** Firestore caps batched writes at 500 ops. The script chunks updates accordingly and logs progress per batch.
- **Interruption is safe.** If the process is killed mid-run, any committed batches stay committed and a subsequent run will simply pick up the remaining un-migrated docs (because of the idempotent skip).
- **No rollback needed.** Because re-runs skip already-migrated docs, there is no destructive operation to undo. If a wrong value were ever written, a separate corrective script would be required.

## Roadmap

The allowlisted collections, in the order each round will migrate them:

| Round | Collection          |
| ----- | ------------------- |
| 7H    | `flags`             |
| 7I    | `family_notes`      |
| 7J    | `labor_flag_notes`  |
| 7K    | `plan_concerns`     |
| 7L    | `plan_requests`     |

Round numbers are tentative and may shift as the broader project plan evolves.
