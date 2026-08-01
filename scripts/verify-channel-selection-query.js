#!/usr/bin/env node
'use strict';

const { MongoClient } = require('mongodb');
const { ChannelIntelligenceReadService } = require('../dist/components/active-channels/channel-intelligence-read.service');

const API_KEY = process.env.API_KEY || process.env.X_API_KEY || 'santoor';
const REQUESTED_LIMIT = Number(process.env.LIMIT || 25);
const QUERY_LIMIT = Math.min(Math.max(REQUESTED_LIMIT * 3, REQUESTED_LIMIT), 100);
const SKIP = Number(process.env.SKIP || 0);
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE || 5);

const prior = {
  PRIOR_RATE: Number(process.env.PRIOR_RATE || 0.03),
  SQ_PRIOR_RATE: Number(process.env.SQ_PRIOR_RATE || 0.82),
};

const activeNegativeKeywords = [
  'online', 'realestat', 'propert', 'freefire', 'bgmi', 'promo', 'agent', 'board', 'design',
  'realt', 'clas', 'PROFIT', 'wholesale', 'retail', 'topper', 'exam', 'motivat', 'medico',
  'shop', 'follower', 'insta', 'traini', 'cms', 'cma', 'subject', 'currency', 'color', 'amity',
  'game', 'gamin', 'like', 'earn', 'popcorn', 'TANISHUV', 'bitcoin', 'crypto', 'mall', 'work',
  'folio', 'health', 'civil', 'win', 'casino', 'promot', 'english', 'invest', 'fix', 'money',
  'book', 'anim', 'angime', 'support', 'cinema', 'bet', 'predic', 'study', 'youtube', 'sub',
  'open', 'trad', 'cric', 'quot', 'exch', 'movie', 'search', 'film', 'offer', 'ott', 'deal',
  'quiz', 'academ', 'insti', 'talkies', 'screen', 'series', 'webser', 'business', 'market',
  'trade', 'news', 'tech', 'education', 'learn', 'course', 'job', 'career', 'finance', 'stock',
  'shopify', 'ecommerce', 'advert', 'marketing', 'blog', 'vlog', 'tutorial', 'fitness', 'gym',
  'diet', 'travel', 'tour', 'hotel', 'food', 'recipe', 'fashion', 'style', 'beauty', 'music',
  'art', 'craft', 'event', 'party', 'ticket',
];

const broadNegativeRegex = /online|freefire|bgmi|promo|agent|realestat|propert|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i;

function activeQuery(notIds) {
  const negativePattern = activeNegativeKeywords.join('|');
  return {
    $and: [
      { title: { $not: { $regex: negativePattern, $options: 'i' } } },
      { title: { $exists: true, $type: 'string' } },
      { username: { $exists: true, $type: 'string', $ne: '', $not: { $regex: negativePattern, $options: 'i' } } },
      {
        channelId: { $nin: notIds },
        participantsCount: { $gt: 600 },
        canSendMsgs: true,
        banned: { $ne: true },
        forbidden: { $ne: true },
        private: { $ne: true },
        broadcast: { $ne: true },
      },
    ],
  };
}

function broadQuery(notIds) {
  return {
    $and: [
      {
        $and: [
          { title: { $exists: true, $type: 'string', $ne: '', $not: { $regex: broadNegativeRegex } } },
          { username: { $exists: true, $type: 'string', $ne: '', $not: { $regex: broadNegativeRegex } } },
        ],
      },
      {
        channelId: { $nin: notIds },
        participantsCount: { $gt: 1000 },
        canSendMsgs: true,
        banned: { $ne: true },
        forbidden: { $ne: true },
        private: { $ne: true },
        broadcast: { $ne: true },
      },
    ],
  };
}

async function getMongoUri() {
  const response = await fetch(`https://ums.paidgirls.site/configuration?apiKey=${API_KEY}`);
  if (!response.ok) throw new Error(`UMS configuration failed: HTTP ${response.status}`);
  const config = await response.json();
  const uri = config.mongouri || config.mongodburi;
  if (!uri) throw new Error('UMS configuration did not return a Mongo URI');
  return uri;
}

async function getExcludedIds(db, candidateIds) {
  if (!candidateIds.length) return new Set();
  const docs = await db.collection('channelIntelligence').find(
    { channelId: { $in: candidateIds } },
    { projection: { channelId: 1, safety: 1, outcomes: 1 } },
  ).toArray();
  return new Set(docs.filter(shouldExclude).map((doc) => String(doc.channelId)));
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function shouldExclude(doc) {
  if (!doc) return false;
  if (doc.safety?.status === 'blocked') return true;
  if (num(doc.safety?.consecutiveErrors) >= 3) return true;
  const attempted = num(doc.outcomes?.attempted);
  const deleted = num(doc.outcomes?.deleted);
  return attempted >= 10 && deleted / attempted > 0.5;
}

function badSafetyReasons(row) {
  const reasons = [];
  if (!row?.channelId) reasons.push('missing_channelId');
  if (!row?.username) reasons.push('missing_username');
  if (row?.canSendMsgs !== true) reasons.push('not_sendable');
  for (const flag of ['banned', 'forbidden', 'private', 'broadcast']) {
    if (row?.[flag] === true) reasons.push(flag);
  }
  return reasons;
}

async function verifyPool(db, { label, collection, makeQuery }) {
  const channelCollection = db.collection(collection);
  const unexcludedQuery = makeQuery([]);
  const joinedProbeIds = (await channelCollection
    .find(unexcludedQuery, { projection: { _id: 0, channelId: 1 } })
    .limit(REQUESTED_LIMIT)
    .toArray())
    .map((row) => String(row.channelId))
    .filter(Boolean);
  const query = makeQuery(joinedProbeIds);
  const baseCount = await channelCollection.countDocuments(query);
  const joinedProbeStillMatchedCount = joinedProbeIds.length
    ? await channelCollection.countDocuments({ $and: [query, { channelId: { $in: joinedProbeIds } }] })
    : 0;
  const readService = new ChannelIntelligenceReadService(null);
  const sortStages = readService.buildConversionAwareSortStages(prior);

  const oldWindow = await channelCollection.aggregate([
    { $match: query },
    ...sortStages.filter((stage) => !stage.$match?._ciExcluded),
    { $sort: { sortScore: -1 } },
    { $skip: SKIP },
    { $limit: REQUESTED_LIMIT },
    { $project: { sortScore: 0 } },
  ], { allowDiskUse: true }).toArray();
  const oldExcludedIds = await getExcludedIds(db, oldWindow.map((row) => String(row.channelId)).filter(Boolean));
  const oldFinalCount = oldWindow.filter((row) => !oldExcludedIds.has(String(row.channelId))).length;

  const selected = await channelCollection.aggregate([
    { $match: query },
    ...sortStages,
    { $sort: { sortScore: -1 } },
    { $skip: SKIP },
    { $limit: QUERY_LIMIT },
    { $project: { sortScore: 0 } },
  ], { allowDiskUse: true }).toArray();
  const finalRows = selected.slice(0, REQUESTED_LIMIT);
  const selectedIds = finalRows.map((row) => String(row.channelId)).filter(Boolean);
  const selectedJoinedProbeCount = selectedIds.filter((channelId) => joinedProbeIds.includes(channelId)).length;
  const selectedExcludedIds = await getExcludedIds(db, selectedIds);
  const unsafeRows = finalRows
    .map((row) => ({ channelId: row.channelId, reasons: badSafetyReasons(row) }))
    .filter((row) => row.reasons.length);

  const ciExcludedCount = await channelCollection.aggregate([
    { $match: query },
    { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
    ...sortStages.filter((stage) => stage.$addFields?._ciExcluded || stage.$match?._ciExcluded),
    { $count: 'count' },
  ], { allowDiskUse: true }).toArray();

  return {
    label,
    collection,
    baseCandidateCount: baseCount,
    ciExcludedBeforeLimitCount: ciExcludedCount[0]?.count || 0,
    joinedProbeIdsCount: joinedProbeIds.length,
    joinedProbeStillMatchedCount,
    requestedLimit: REQUESTED_LIMIT,
    queryLimit: QUERY_LIMIT,
    oldLimitThenFilterCount: oldFinalCount,
    newFilterThenLimitCount: finalRows.length,
    selectedJoinedProbeCount,
    selectedStillCiExcludedCount: selectedExcludedIds.size,
    selectedUnsafeCount: unsafeRows.length,
    selectedSample: finalRows.slice(0, SAMPLE_SIZE).map((row) => ({
      channelId: row.channelId,
      username: row.username,
      participantsCount: row.participantsCount,
      canSendMsgs: row.canSendMsgs,
    })),
    violations: {
      ciExcludedIds: [...selectedExcludedIds].slice(0, SAMPLE_SIZE),
      unsafeRows: unsafeRows.slice(0, SAMPLE_SIZE),
    },
  };
}

async function main() {
  if (REQUESTED_LIMIT <= 0) throw new Error('LIMIT must be positive');
  const uri = await getMongoUri();
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db('tgclients');
    const results = [
      await verifyPool(db, { label: 'under-220 activeChannels pool', collection: 'activeChannels', makeQuery: activeQuery }),
      await verifyPool(db, { label: '220+ broad channels pool', collection: 'channels', makeQuery: broadQuery }),
    ];
    const passed = results.every((result) =>
      result.joinedProbeStillMatchedCount === 0
      && result.selectedJoinedProbeCount === 0
      && result.selectedStillCiExcludedCount === 0
      && result.selectedUnsafeCount === 0
    );
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed, results }, null, 2));
    if (!passed) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
