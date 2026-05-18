#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ALLOWED_COLLECTIONS = [
  'flags',
  'family_notes',
  'labor_flag_notes',
  'plan_concerns',
  'plan_requests',
];

const PLAN_ID = 'heavener-main';
const BATCH_LIMIT = 500;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');

function parseArgs(argv) {
  const args = { collection: null, dryRun: false, yes: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes') args.yes = true;
    else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else if (!args.collection) {
      args.collection = a;
    } else {
      console.error(`Unexpected positional argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function usage() {
  console.error(
    'Usage: node migrate-add-plan-id.js <collection> [--dry-run] [--yes]'
  );
  console.error(`Allowed collections: ${ALLOWED_COLLECTIONS.join(', ')}`);
}

function loadServiceAccount() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(
      `ERROR: service account JSON not found at ${SERVICE_ACCOUNT_PATH}`
    );
    console.error(
      'See scripts/README.md "Service Account Setup" for instructions on how to obtain it.'
    );
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  } catch (err) {
    console.error(`ERROR: failed to parse service-account.json: ${err.message}`);
    process.exit(1);
  }
}

function confirm(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.collection) {
    usage();
    process.exit(1);
  }

  if (!ALLOWED_COLLECTIONS.includes(args.collection)) {
    console.error(
      `ERROR: "${args.collection}" is not an allowed collection.`
    );
    console.error(`Allowed: ${ALLOWED_COLLECTIONS.join(', ')}`);
    process.exit(1);
  }

  const serviceAccount = loadServiceAccount();

  const admin = require('firebase-admin');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  console.log('---');
  console.log(`Collection:    ${args.collection}`);
  console.log(`Project:       ${serviceAccount.project_id || '(unknown)'}`);
  console.log(`Mode:          ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`planId value:  ${PLAN_ID}`);
  console.log('---');

  const snapshot = await db.collection(args.collection).get();
  const total = snapshot.size;
  console.log(`Total docs in ${args.collection}: ${total}`);

  const toUpdate = [];
  const skipped = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (Object.prototype.hasOwnProperty.call(data, 'planId')) {
      skipped.push(doc.id);
    } else {
      toUpdate.push(doc.ref);
    }
  });

  console.log(`Would update:  ${toUpdate.length}`);
  console.log(`Would skip:    ${skipped.length} (already have planId)`);

  const sample = (arr) => arr.slice(0, 3).map((x) => (x.id ? x.id : x));
  if (toUpdate.length > 0) {
    console.log(`Sample to-update IDs: ${JSON.stringify(sample(toUpdate))}`);
  }
  if (skipped.length > 0) {
    console.log(`Sample skipped IDs:   ${JSON.stringify(sample(skipped))}`);
  }

  if (args.dryRun) {
    console.log('Dry run complete. No writes performed.');
    process.exit(0);
  }

  if (toUpdate.length === 0) {
    console.log('Nothing to update. Exiting.');
    process.exit(0);
  }

  if (!args.yes) {
    const answer = await confirm(
      `About to update ${toUpdate.length} docs in "${args.collection}". Type CONFIRM to proceed: `
    );
    if (answer !== 'CONFIRM') {
      console.log('Aborted by user.');
      process.exit(0);
    }
  }

  let updated = 0;
  let errors = 0;
  const errorIds = [];

  for (let i = 0; i < toUpdate.length; i += BATCH_LIMIT) {
    const chunk = toUpdate.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.update(ref, { planId: PLAN_ID });
    }
    try {
      await batch.commit();
      updated += chunk.length;
      console.log(
        `Committed batch ${i / BATCH_LIMIT + 1}: ${chunk.length} docs (running total: ${updated}/${toUpdate.length})`
      );
    } catch (err) {
      errors += chunk.length;
      chunk.forEach((r) => errorIds.push(r.id));
      console.error(
        `Batch ${i / BATCH_LIMIT + 1} failed: ${err.message}`
      );
    }
  }

  console.log('---');
  console.log('Summary');
  console.log(`  Total:    ${total}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped.length}`);
  console.log(`  Errors:   ${errors}`);
  if (errorIds.length > 0) {
    console.log(`  Sample error IDs: ${JSON.stringify(errorIds.slice(0, 3))}`);
  }
  console.log('---');

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.stack || err.message || err}`);
  process.exit(1);
});
