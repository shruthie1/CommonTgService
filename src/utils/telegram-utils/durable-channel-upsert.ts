type ChannelStateInput = {
  banned?: boolean;
  forbidden?: boolean;
  private?: boolean;
  broadcast?: boolean;
  canSendMsgs?: boolean;
};

type AggregationExpression = Record<string, unknown>;

const literal = (value: unknown): AggregationExpression => ({ $literal: value });

/**
 * Mongo predicate: the persisted doc carries an OPERATOR ban (banned + bannedAt). Keep in lockstep
 * with OPERATOR_BAN_EXPR in tg-platform `@tg/core/types/activeChannel` (same vectors are tested).
 */
const OPERATOR_BAN = {
  $and: [{ $eq: [{ $ifNull: ['$banned', false] }, true] }, { $ne: [{ $ifNull: ['$bannedAt', null] }, null] }],
};

/** In-memory twin of OPERATOR_BAN for already-loaded docs (same rule as tg-platform `isOperatorBan`). */
export function isOperatorBan(doc: { banned?: unknown; bannedAt?: unknown } | null | undefined): boolean {
  return doc?.banned === true && doc?.bannedAt != null;
}

/**
 * Casts update values by the model's schema (a pipeline update skips Mongoose casting). Keys the
 * schema does not know are dropped, as strict mode drops them from a plain $set. Model.castObject
 * skips null values, so explicit nulls (bannedAt: null on an unban) are kept as null.
 */
export function castUpdateFields(
  model: { castObject: (obj: Record<string, unknown>) => unknown },
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const cast = { ...(model.castObject(raw) as Record<string, unknown>) };
  for (const [field, value] of Object.entries(raw)) if (value === null) cast[field] = null;
  return cast;
}

/** Fields a plain update() may not change on an operator-banned row. */
export const BAN_GUARDED_FIELDS = new Set(['banned', 'bannedAt', 'canSendMsgs']);

/**
 * Pipeline expression for one guarded field in update(): evaluated against the stored row inside
 * the write, so it is atomic. On an operator-banned row banned/bannedAt keep their stored value and
 * canSendMsgs stays false; otherwise the incoming value lands.
 */
export function keepOnOperatorBan(field: string, value: unknown): AggregationExpression {
  const kept = field === 'canSendMsgs' ? false : `$${field}`;
  return { $cond: [OPERATOR_BAN, kept, literal(value)] };
}

/** True when update() asked to change a guarded field and the operator ban kept it. */
export function guardedChangeRefused(
  requested: Record<string, unknown>,
  after: { banned?: unknown; bannedAt?: unknown; canSendMsgs?: unknown },
): boolean {
  return (requested.canSendMsgs === true && after.canSendMsgs !== true)
    || ('banned' in requested && requested.banned !== after.banned)
    || ('bannedAt' in requested && requested.bannedAt !== after.bannedAt);
}

/**
 * Builds a Mongo update pipeline for a Telegram live-state refresh.
 *
 * Flag rules (shared with tg-platform activeChannel.ts; root cause of the false shared flags):
 *  - `forbidden`/`banned` used to be sticky: written from ONE account's view (ChannelForbidden,
 *    legacy ban writes) they closed the channel for every account forever.
 *  - Only an operator ban (banned + bannedAt) is durable. A refresh may still ASSERT banned /
 *    forbidden, but a verified live "members can send" observation (incoming.canSendMsgs === true)
 *    clears a non-operator flag.
 * A pipeline evaluates the persisted document and the incoming observation atomically, avoiding a
 * stale read-before-write window during bulk discovery.
 */
export function buildDurableChannelUpsertPipeline(
  setFields: Record<string, unknown>,
  defaults: Record<string, unknown>,
  incoming: ChannelStateInput,
): Array<{ $set: Record<string, unknown> }> {
  const hasSetField = (field: string) =>
    Object.prototype.hasOwnProperty.call(setFields, field);
  const currentOrDefault = (field: string): unknown => {
    if (hasSetField(field)) return literal(setFields[field]);
    return { $ifNull: [`$${field}`, literal(defaults[field])] };
  };

  const fields: Record<string, unknown> = {};
  for (const field of new Set([...Object.keys(defaults), ...Object.keys(setFields)])) {
    fields[field] = currentOrDefault(field);
  }

  const liveSendable = incoming.canSendMsgs === true;
  const keepIfOperator = (field: string, cleared: unknown): unknown => ({
    $cond: [OPERATOR_BAN, `$${field}`, literal(cleared)],
  });

  if (incoming.banned === true) {
    fields.banned = literal(true);
  } else if (liveSendable) {
    fields.banned = keepIfOperator('banned', false);
    fields.bannedAt = keepIfOperator('bannedAt', null);
  } else {
    fields.banned = { $ifNull: ['$banned', literal(defaults.banned ?? false)] };
  }
  if (incoming.forbidden === true) {
    fields.forbidden = literal(true);
  } else if (liveSendable) {
    fields.forbidden = literal(false);
  } else {
    fields.forbidden = { $ifNull: ['$forbidden', literal(defaults.forbidden ?? false)] };
  }

  const effectivePrivate = { $eq: [currentOrDefault('private'), true] };
  const effectiveBroadcast = { $eq: [currentOrDefault('broadcast'), true] };

  fields.canSendMsgs = {
    $cond: [
      {
        $or: [
          OPERATOR_BAN,
          incoming.banned === true,
          incoming.forbidden === true,
          effectivePrivate,
          effectiveBroadcast,
        ],
      },
      false,
      currentOrDefault('canSendMsgs'),
    ],
  };

  return [{ $set: fields }];
}
