import type {LeadReference} from "@/domain/leads/lead-reference.entity";
import type {LeadLookupRepository} from "@/application/leads/ports/lead-lookup.repository";
import { supabaseServerClient } from "./supabase.client";

type SupabaseLeadReferenceRow = {
  id: number;
  email: string; 
  created_at: string;
};

function mapRowToLeadReference(row:SupabaseLeadReferenceRow): LeadReference {
  return {
    id: row.id,
    email: row.email,
  };
}

export class SupabaseLeadLookupRepository implements LeadLookupRepository {
    async findByEmail(email: string): Promise<LeadReference | null> {
        const normalizedEmail = email.trim().toLowerCase();
        const {data, error} = await supabaseServerClient
        .from("leads")
        .select("id, email, created_at")
        .eq("email", normalizedEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

        if (error) {
            throw new Error(`Error occurred while fetching lead by email: ${error.message}`);
        }

        return data ? mapRowToLeadReference(data as SupabaseLeadReferenceRow) : null;

    }
}