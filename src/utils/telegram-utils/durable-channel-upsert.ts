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
 * Builds a Mongo update pipeline for a Telegram live-state refresh.
 *
 * A refresh is allowed to update live facts, including `private`, but it must
 * never clear a durable operator/Telegram stop (`banned` or `forbidden`) or
 * make such a document sendable.  A pipeline evaluates the persisted document
 * and the incoming observation atomically, avoiding a stale read-before-write
 * window during bulk discovery.
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

  const persistedBanned = { $eq: [{ $ifNull: ['$banned', false] }, true] };
  const persistedForbidden = { $eq: [{ $ifNull: ['$forbidden', false] }, true] };
  const effectivePrivate = { $eq: [currentOrDefault('private'), true] };
  const effectiveBroadcast = { $eq: [currentOrDefault('broadcast'), true] };

  // Discovery can set durable stops, but only the explicit operator path may
  // clear them.  Preserve any existing value otherwise.
  fields.banned = incoming.banned === true
    ? literal(true)
    : { $ifNull: ['$banned', literal(defaults.banned ?? false)] };
  fields.forbidden = incoming.forbidden === true
    ? literal(true)
    : { $ifNull: ['$forbidden', literal(defaults.forbidden ?? false)] };

  fields.canSendMsgs = {
    $cond: [
      {
        $or: [
          persistedBanned,
          persistedForbidden,
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
