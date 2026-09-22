import type { LeadDecision } from "@/domain/leads/lead-validation.result";
import type {
  LeadPersistenceStatus,
  PersistLeadInput,
} from "./ports/lead.repository";
import type { LeadSubmission } from "@/domain/leads/lead.types";

export function mapLeadDecisionToPersistenceStatus(
  decision: LeadDecision,
): LeadPersistenceStatus {
  switch (decision.status) {
    case "REJECTED":
      return "rejected";
    case "QUALIFIED":
      return "qualified";
    case "NURTURE":
    case "EXISTING_CONTACT":
      return "contacted";
  }
}

export function createPersistLeadInput(
  submission: LeadSubmission,
  decision: LeadDecision,
  registeredAt = new Date().toISOString(),
): PersistLeadInput {
  return {
    submission,
    status: mapLeadDecisionToPersistenceStatus(decision),
    registeredAt,
  };
}
