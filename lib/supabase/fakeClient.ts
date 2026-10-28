// A Supabase client for tests: every query resolves to the rows given for its table, and the tables asked for are counted.
export function fakeClient(rows: Record<string, unknown[]> = {}) {
  const tables: string[] = []
  const query = (table: string): unknown => {
    const q: unknown = new Proxy(() => {}, {
      get: (_t, prop) => (prop === "then" ? (done: (v: unknown) => unknown) => done({ data: rows[table] ?? [] }) : prop === "maybeSingle" ? () => Promise.resolve({ data: null }) : () => q),
    })
    return q
  }
  return {
    tables,
    count: (table: string) => tables.filter((t) => t === table).length,
    client: {
      from: (table: string) => {
        tables.push(table)
        return query(table)
      },
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    },
  }
}
