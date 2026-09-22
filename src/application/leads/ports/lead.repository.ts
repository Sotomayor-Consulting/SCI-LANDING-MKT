import type { LeadSubmission } from "@/domain/leads/lead.types";

export const leadPersistenceStatuses = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "won",
  "lost",
  "spam",
  "rejected",
] as const;

export type LeadPersistenceStatus =
  (typeof leadPersistenceStatuses)[number];

export type PersistLeadInput = {
  submission: LeadSubmission;
  status: LeadPersistenceStatus;
  registeredAt: string;
};

export type PersistedLead = {
  id: number;
  submissionId: string;
  email: string;
  status: LeadPersistenceStatus;
};

export interface LeadRepository {
  upsert(input: PersistLeadInput): Promise<PersistedLead>;

  updateStatusById(
    id: number,
    status: LeadPersistenceStatus,
  ): Promise<PersistedLead>;

  findBySubmissionId(submissionId: string): Promise<PersistedLead | null>;

  create(input: PersistLeadInput): Promise<PersistedLead>;

  updateBySubmissionId(
    submissionId: string,
    input: {
      status: LeadPersistenceStatus;
    },
  ): Promise<PersistedLead>;
}
