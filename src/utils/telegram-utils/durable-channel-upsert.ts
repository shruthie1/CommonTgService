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
