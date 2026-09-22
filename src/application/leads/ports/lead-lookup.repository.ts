import type {LeadReference} from "@/domain/leads/lead-reference.entity";

export interface LeadLookupRepository {
    findByEmail(email: string): Promise<LeadReference | null>;
}