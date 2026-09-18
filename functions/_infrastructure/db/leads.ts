import { isDbConfigured, withClient, type DbEnv } from "./client";

export interface LeadRecord {
  submissionId: string;
  name: string;
  email: string;
  countryCode: string;
  phone: string;
  phoneNormalized: string;
  activity: string;
  advice: string;
  question: string | null;
  platform: string;
  sourceDetail: string | null;
}

export interface InsertLeadResult {
  created: boolean;
  skipped?: boolean; // Postgres no configurado
  duplicate?: boolean; // ya existía por submission_id
  id?: number;
}

const INSERT_SQL = `
  insert into public.leads
    (submission_id, name, email, country_code, phone, phone_normalized,
     activity, advice, question, status, platform, source_detail, registered_at)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, now())
  on conflict (submission_id) do nothing
  returning id
`;

/**
 * Inserta un lead en `public.leads` de forma idempotente por `submission_id`
 * (índice único `leads_submission_id_key`). Si no hay DATABASE_URL, `skipped`.
 */
export async function insertLead(input: LeadRecord, env: DbEnv): Promise<InsertLeadResult> {
  if (!isDbConfigured(env)) return { created: false, skipped: true };

  return withClient(env, async (client) => {
    const result = await client.query<{ id: number }>(INSERT_SQL, [
      input.submissionId,
      input.name,
      input.email,
      input.countryCode,
      input.phone,
      input.phoneNormalized,
      input.activity,
      input.advice,
      input.question,
      input.platform,
      input.sourceDetail,
    ]);
    if (result.rows.length === 0) return { created: false, duplicate: true };
    return { created: true, id: result.rows[0].id };
  });
}
