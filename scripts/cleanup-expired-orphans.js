/**
 * One-time cleanup: deactivate pool records orphaned under expired users.
 *
 * Background: before the expireAccount() cascade was introduced, a user could
 * be marked `expired: true` (account permanently lost) while the SAME mobile
 * remained an `active` bufferClient / promoteClient. Those orphaned pool docs
 * kept being selected for warmup / swaps / promotion, and user APIs returned
 * [] for the mobile because expired users are filtered out by default.
 *
 * This script finds every expired user whose mobile still has a non-inactive
 * buffer/promote record and deactivates those records (status: 'inactive',
 * inUse: false) to bring the DB in line with the new invariant:
 *   expired user  <=>  no active pool record for that mobile.
 *
 * Usage:
 *   node scripts/cleanup-expired-orphans.js          # dry run (default)
 *   node scripts/cleanup-expired-orphans.js --apply  # actually update
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.mongouri || process.env.MONGO_URI;
const APPLY = process.argv.includes('--apply');

function canonicalMobile(m) {
  if (!m) return m;
  return String(m).replace(/[^0-9]/g, '');
}

async function main() {
  if (!MONGO_URI) {
    console.error('Missing mongouri / MONGO_URI env var');
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('tgclients');

  const users = db.collection('users');
  const bufferClients = db.collection('bufferClients');
  const promoteClients = db.collection('promoteClients');

  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);

  // 1. All expired user mobiles (canonicalized into a set).
  const expiredUsers = await users
    .find({ expired: true }, { projection: { mobile: 1, tgId: 1 } })
    .toArray();
  const expiredMobiles = new Set(expiredUsers.map((u) => canonicalMobile(u.mobile)).filter(Boolean));
  console.log(`Expired users: ${expiredUsers.length} (${expiredMobiles.size} distinct mobiles)`);

  // 2. For each pool, find docs that are NOT inactive whose mobile is expired.
  async function findOrphans(coll, label) {
    const liveDocs = await coll
      .find({ status: { $ne: 'inactive' } }, { projection: { mobile: 1, status: 1, channels: 1, clientId: 1 } })
      .toArray();
    const orphans = liveDocs.filter((d) => expiredMobiles.has(canonicalMobile(d.mobile)));
    console.log(`\n[${label}] non-inactive docs: ${liveDocs.length}, orphaned under expired users: ${orphans.length}`);
    orphans.slice(0, 50).forEach((d) => {
      console.log(`  - ${d.mobile} | status=${d.status} | channels=${d.channels} | clientId=${d.clientId}`);
    });
    if (orphans.length > 50) console.log(`  ... and ${orphans.length - 50} more`);
    return orphans;
  }

  const bufferOrphans = await findOrphans(bufferClients, 'bufferClients');
  const promoteOrphans = await findOrphans(promoteClients, 'promoteClients');

  if (APPLY) {
    const reason = 'Cleanup: account expired (session revoked / banned / deactivated)';
    if (bufferOrphans.length) {
      const mobiles = bufferOrphans.map((d) => d.mobile);
      const res = await bufferClients.updateMany(
        { mobile: { $in: mobiles } },
        { $set: { status: 'inactive', inUse: false, message: reason } },
      );
      console.log(`\n[bufferClients] updated ${res.modifiedCount} docs to inactive`);
    }
    if (promoteOrphans.length) {
      const mobiles = promoteOrphans.map((d) => d.mobile);
      const res = await promoteClients.updateMany(
        { mobile: { $in: mobiles } },
        { $set: { status: 'inactive', inUse: false, message: reason } },
      );
      console.log(`[promoteClients] updated ${res.modifiedCount} docs to inactive`);
    }
    if (!bufferOrphans.length && !promoteOrphans.length) {
      console.log('\nNothing to update — DB already consistent.');
    }
  } else {
    console.log(`\nDRY RUN complete. Re-run with --apply to deactivate ${bufferOrphans.length + promoteOrphans.length} orphaned pool docs.`);
  }

  await client.close();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
