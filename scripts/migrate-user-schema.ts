/**
 * One-time migration: flatten User fields → nested structure
 *
 * Run: npx ts-node scripts/migrate-user-schema.ts
 *
 * Safe to run multiple times — uses $rename which is a no-op if source field doesn't exist.
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

  // Step 1: Rename flat fields to stats.*
  const renameResult = await users.updateMany(
    { stats: { $exists: false } },
    {
      $rename: {
        channels: 'stats.channels',
        personalChats: 'stats.personalChats',
        totalChats: 'stats.totalChats',
        contacts: 'stats.contacts',
        msgs: 'stats.msgs',
        photoCount: 'stats.photoCount',
        videoCount: 'stats.videoCount',
        movieCount: 'stats.movieCount',
        ownPhotoCount: 'stats.ownPhotoCount',
        otherPhotoCount: 'stats.otherPhotoCount',
        ownVideoCount: 'stats.ownVideoCount',
        otherVideoCount: 'stats.otherVideoCount',
        lastActive: 'stats.lastActive',
      },
    },
  );
  console.log(`Renamed flat fields → stats.*: ${renameResult.modifiedCount} docs`);

  // Step 2: Remove calls.chats (moved to relationships.top)
  const unsetResult = await users.updateMany(
    { 'calls.chats': { $exists: true } },
    { $unset: { 'calls.chats': '' } },
  );
  console.log(`Removed calls.chats: ${unsetResult.modifiedCount} docs`);

  // Step 3: Remove old score field, init relationships block
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

  // Step 4: Create indexes
  await users.createIndex({ 'relationships.bestScore': -1 });
  console.log('Created index: relationships.bestScore');

  await users.createIndex({ 'stats.lastActive': -1 });
  console.log('Created index: stats.lastActive');

  console.log('Migration complete.');
  await client.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
