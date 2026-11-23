#!/usr/bin/env node
/**
 * Writes owner labels of UPI ids to the Mongo `upi-labels` collection ({ upiId, label, updatedAt }), read by
 * GET /monitor/upi-revenue (src/components/monitor/monitor-upi.ts) to roll ids up into one row per label.
 * The upi-ids doc is NOT touched (its GET is a vcui/payment-local contract).
 *
 * Usage (dry run by default; nothing is written without --apply):
 *   MONGO_URI=... node scripts/upi-labels-apply.js '****3302@fbpe=RL' '****vr3l@ptys=LS' ...
 *   MONGO_URI=... node scripts/upi-labels-apply.js --apply '****3302@fbpe=RL' ...
 *   MONGO_URI=... node scripts/upi-labels-apply.js --remove '****vr3l@ptys'          (dry run of a delete)
 *
 * Ids are given MASKED, as the revenue view shows them ("****" + last 4 of the local part + "@handle", with the
 * " (N ch)" suffix when two ids share a mask). Each mask is resolved against our configured ids (upi-ids doc + every
 * client's qrId/gpayId); a mask that fits no id or several ids is refused and nothing is written. --apply also makes
 * the unique index { upiId: 1 } (idempotent). The URI comes from
 * the env only and is never printed; a localhost URI is refused. Output prints masked ids only.
 */
const { MongoClient } = require('mongodb');

const LABEL = /^[A-Z0-9]{1,8}$/;
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '').split('&')[0];
const localOf = (id) => id.split('@')[0];
const mask = (id) => `****${localOf(id).slice(-4)}${id.includes('@') ? id.slice(id.indexOf('@')) : ''}`;

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const remove = argv.includes('--remove');
  const pairs = argv.filter((a) => !a.startsWith('--'));
  if (pairs.length === 0) throw new Error('give one or more "<masked id>=<LABEL>" (or "<masked id>" with --remove)');
  const items = pairs.map((p) => {
    const eq = p.lastIndexOf('=');
    const m = (remove || eq < 0 ? p : p.slice(0, eq)).trim();
    const label = remove ? null : p.slice(eq + 1).trim().toUpperCase();
    if (!remove && (eq < 0 || !LABEL.test(label))) throw new Error(`bad pair "${p}": label must be 1-8 letters or digits`);
    const sized = /^(.*?)\s*\((\d+) ch\)$/.exec(m);
    return { masked: m, base: norm(sized ? sized[1] : m), len: sized ? Number(sized[2]) : null, label };
  });
  return { apply, remove, items };
}

function knownIds(upiDocs, clients) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string' && v.includes('@')) out.add(norm(v)); };
  for (const d of upiDocs) for (const [k, v] of Object.entries(d || {})) if (k !== '_id') (Array.isArray(v) ? v : [v]).forEach(add);
  for (const c of clients) { add(c.qrId); add(c.gpayId); }
  return [...out];
}

async function main() {
  const { apply, remove, items } = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('set MONGO_URI in the env');
  if (/localhost|127\.0\.0\.1/.test(uri)) throw new Error('refusing a localhost Mongo URI');
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db('tgclients');
    const [upiDocs, clients, current] = await Promise.all([
      db.collection('upi-ids').find({}).toArray(),
      db.collection('clients').find({}, { projection: { qrId: 1, gpayId: 1 } }).toArray(),
      db.collection('upi-labels').find({}, { projection: { upiId: 1, label: 1 } }).toArray(),
    ]);
    const known = knownIds(upiDocs, clients);
    const now = new Map(current.map((r) => [norm(r.upiId), r.label]));
    const plan = [];
    const errors = [];
    for (const it of items) {
      const hits = known.filter((id) => mask(id) === it.base && (it.len === null || localOf(id).length === it.len));
      if (hits.length !== 1) { errors.push(`${it.masked}: fits ${hits.length} of our ids`); continue; }
      plan.push({ id: hits[0], masked: it.masked, from: now.get(hits[0]) ?? null, to: it.label });
    }
    for (const p of plan) console.log(`${p.masked}: ${p.from ?? '(none)'} -> ${p.to ?? '(removed)'}`);
    if (errors.length) { for (const e of errors) console.error(`REFUSED ${e}`); throw new Error('nothing written: fix the refused ids'); }
    if (!apply) { console.log(`dry run: ${plan.length} change(s); add --apply to write`); return; }
    const coll = db.collection('upi-labels');
    // One label per id. Idempotent: an existing identical index is a no-op.
    await coll.createIndex({ upiId: 1 }, { unique: true, name: 'upiId_unique' });
    let n = 0;
    for (const p of plan) {
      if (remove) n += (await coll.deleteOne({ upiId: p.id })).deletedCount;
      else { await coll.updateOne({ upiId: p.id }, { $set: { label: p.to, updatedAt: new Date() } }, { upsert: true }); n++; }
    }
    console.log(`applied: ${n} ${remove ? 'removed' : 'written'}`);
  } finally {
    await client.close();
  }
}

/** Error text with any Mongo URI cut out (a driver error can carry the connection string). */
const redact = (s) => String(s).replace(/mongodb(\+srv)?:\/\/\S+/gi, '<uri>');

main().catch((e) => { console.error(redact(e.message || e).slice(0, 300)); process.exit(1); });
