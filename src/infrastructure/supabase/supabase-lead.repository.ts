import type {
  LeadRepository,
  PersistedLead,
  PersistLeadInput,
} from "@/application/leads/ports/lead.repository";
import { supabaseServerClient } from "./supabase.client";

type SupabaseLeadRow = {
  id: number;
  submission_id: string;
  email: string;
  status: PersistedLead["status"];
};

const leadSelect = "id, submission_id, email, status";

function mapRowToPersistedLead(row: SupabaseLeadRow): PersistedLead {
  return {
    id: row.id,
    submissionId: row.submission_id,
    email: row.email,
    status: row.status,
  };
}

export class SupabaseLeadRepository implements LeadRepository {
  async upsert(input: PersistLeadInput): Promise<PersistedLead> {
    const { submission } = input;
    const { data, error } = await supabaseServerClient
      .from("leads")
      .upsert(
        {
          submission_id: submission.submissionId,
          name: submission.name,
          email: submission.email,
          country_code: submission.countryCode,
          phone: submission.phone,
          phone_normalized: normalizePhone(
            submission.countryCode,
            submission.phone,
          ),
          activity: submission.activity,
          advice: submission.adviceIntent,
          question: submission.question ?? null,
          status: input.status,
          platform: submission.source,
          registered_at: input.registeredAt,
        },
        { onConflict: "submission_id" },
      )
      .select(leadSelect)
      .single();

    if (error) {
      throw new Error(`Error upserting lead: ${error.message}`);
    }

    return mapRowToPersistedLead(data as SupabaseLeadRow);
  }

  async findBySubmissionId(
    submissionId: string,
  ): Promise<PersistedLead | null> {
    const { data, error } = await supabaseServerClient
      .from("leads")
      .select(leadSelect)
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error fetching lead by submission: ${error.message}`);
    }

    return data ? mapRowToPersistedLead(data as SupabaseLeadRow) : null;
  }

  async updateStatusById(
    id: number,
    status: PersistedLead["status"],
  ): Promise<PersistedLead> {
    const { data, error } = await supabaseServerClient
      .from("leads")
      .update({ status })
      .eq("id", id)
      .select(leadSelect)
      .single();

    if (error) {
      throw new Error(`Error updating lead status: ${error.message}`);
    }

    return mapRowToPersistedLead(data as SupabaseLeadRow);
  }

  async create(input: PersistLeadInput): Promise<PersistedLead> {
    const { submission } = input;
    const { data, error } = await supabaseServerClient
      .from("leads")
      .insert({
        submission_id: submission.submissionId,
        name: submission.name,
        email: submission.email,
        country_code: submission.countryCode,
        phone: submission.phone,
        phone_normalized: normalizePhone(
          submission.countryCode,
          submission.phone,
        ),
        activity: submission.activity,
        advice: submission.adviceIntent,
        question: submission.question ?? null,
        status: input.status,
        platform: submission.source,
        registered_at: input.registeredAt,
      })
      .select(leadSelect)
      .single();

    if (error) {
      throw new Error(`Error creating lead: ${error.message}`);
    }

    return mapRowToPersistedLead(data as SupabaseLeadRow);
  }

  async updateBySubmissionId(
    submissionId: string,
    input: { status: PersistedLead["status"] },
  ): Promise<PersistedLead> {
    const { data, error } = await supabaseServerClient
      .from("leads")
      .update({ status: input.status })
      .eq("submission_id", submissionId)
      .select(leadSelect)
      .single();

    if (error) {
      throw new Error(`Error updating lead: ${error.message}`);
    }

    return mapRowToPersistedLead(data as SupabaseLeadRow);
  }
}

function normalizePhone(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0+/, "");
  return `${countryCode}${digits}`;
}