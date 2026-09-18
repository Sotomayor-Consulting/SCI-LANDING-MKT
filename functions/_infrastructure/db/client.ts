import pg from "pg";

// ============================================================================
// Acceso a Postgres desde Cloudflare Pages Functions con `pg` (node-postgres).
// Requiere `nodejs_compat` (ver wrangler.toml). Se conecta con el connection
// string del POOLER de Supabase (Supavisor, modo transaction, puerto 6543):
// conexiones efímeras por invocación, ideal para serverless.
// Compartido entre landings/equipos: `functions/_infrastructure/db/`.
// ============================================================================

export interface DbEnv {
  DATABASE_URL?: string;
}

export function isDbConfigured(env: DbEnv): boolean {
  return Boolean(env.DATABASE_URL);
}

/**
 * Abre una conexión, ejecuta `fn` y la cierra siempre. Una conexión por
 * invocación (el pooler de Supabase gestiona la concurrencia).
 */
export async function withClient<T>(
  env: DbEnv,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    // El pooler de Supabase exige TLS; en el runtime de Workers no validamos la cadena.
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
