/** Minimal in-memory stand-in for the three Mongoose models: supports exactly what the service uses. */
export function fakeModel(docs: any[]) {
  const matches = (d: any, f: any) =>
    Object.entries(f).every(([k, v]: [string, any]) => (v && v.$in ? v.$in.includes(d[k]) : d[k] === v));
  return {
    find: (filter: any) => ({
      sort: () => ({
        lean: () => ({
          exec: async () =>
            docs
              .filter((d) => matches(d, filter))
              .map(({ _id, expireAt, createdAt, ...rest }) => rest)
              .sort((a, b) => (a.date + a.clientId < b.date + b.clientId ? -1 : 1)),
        }),
      }),
    }),
    aggregate: (pipeline: any[]) => ({
      exec: async () => {
        const match = pipeline.find((p) => p.$match).$match;
        const group = pipeline.find((p) => p.$group).$group;
        const buckets = new Map<string, any>();
        for (const d of docs.filter((x) => matches(x, match))) {
          const idSpec = group._id;
          const id =
            typeof idSpec === 'string'
              ? d[idSpec.slice(1)]
              : Object.fromEntries(Object.entries(idSpec).map(([k, v]: [string, any]) => [k, d[v.slice(1)]]));
          const key = JSON.stringify(id);
          if (!buckets.has(key)) buckets.set(key, { _id: id });
          const b = buckets.get(key);
          for (const [f, spec] of Object.entries(group) as [string, any][]) {
            if (f === '_id') continue;
            b[f] = (b[f] || 0) + (Number(d[spec.$sum.slice(1)]) || 0);
          }
        }
        return [...buckets.values()].sort((a, b) =>
          JSON.stringify(a._id) < JSON.stringify(b._id) ? -1 : 1,
        );
      },
    }),
  };
}
