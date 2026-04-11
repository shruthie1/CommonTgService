/**
 * One-time migration: clean up User schema
 * - Remove calls.chats[] (per-chat data now lives in relationships.top)
 * - Initialize relationships block
 * - Remove old top-level score field
 * - Create indexes
 *
 * Run: npx ts-node scripts/migrate-user-schema.ts
 *
 * Safe to run multiple times — guards with $exists checks.
 */
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI || process.env.DB_URI;

async function migrate() {
  if (!MONGO_URI) {
    console.error('Set MONGO_URI or DB_URI environment variable');
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const users = db.collection('users');

  console.log('Starting user schema migration...');

  // Step 1: Remove calls.chats (per-chat data now in relationships.top)
  const unsetResult = await users.updateMany(
    { 'calls.chats': { $exists: true } },
    { $unset: { 'calls.chats': '' } },
  );
  console.log(`Removed calls.chats: ${unsetResult.modifiedCount} docs`);

  // Step 2: Remove old score field, init relationships block
  const relResult = await users.updateMany(
    { relationships: { $exists: false } },
    {
      $set: {
        relationships: { score: 0, bestScore: 0, computedAt: null, top: [] },
      },
      $unset: { score: '' },
    },
  );
  console.log(`Initialized relationships block: ${relResult.modifiedCount} docs`);

  // Step 3: Create indexes
  await users.createIndex({ 'relationships.bestScore': -1 });
  console.log('Created index: relationships.bestScore');

  await users.createIndex({ lastActive: -1 });
  console.log('Created index: lastActive');

  console.log('Migration complete.');
  await client.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
