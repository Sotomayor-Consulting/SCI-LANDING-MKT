import type {BlacklistRepository} from './ports/blacklist.repository';
import type { ContactRepository } from './ports/contact.repository';


import {validateLead} from '@/domain/leads/lead-validation.rules';
import type { LeadSubmission } from '@/domain/leads/lead.types';
import type { LeadDecision } from '@/domain/leads/lead-validation.result';
import type { LeadRepository } from './ports/lead.repository';
import { createPersistLeadInput } from './lead-persistence.mapper';

type ProcessLeadDependencies = {
    contactRepository: ContactRepository;
    blacklistRepository: BlacklistRepository;
    leadRepository: LeadRepository;
}

type ProcessLeadInput = {
    lead: LeadSubmission;
}

export function createProcessLeadUseCase({
  contactRepository,
  blacklistRepository,
  leadRepository,
}: ProcessLeadDependencies) {
    return {
        async execute({lead}:ProcessLeadInput):Promise<LeadDecision>{
            const [existingContact, blacklistEntry] = await Promise.all([
                contactRepository.findByEmail(lead.email),
                blacklistRepository.findActiveByEmail(lead.email)
            ]);

            const decision = validateLead({lead,blacklistEntry,existingContact});
            const persistenceInput = createPersistLeadInput(
              lead,
              decision,
            );
            await leadRepository.upsert(persistenceInput);

            return decision;
        }
    }
}