import type { BlacklistEntry } from './blacklist.entity';
import type { ExistingContact } from './contact.entity';
import type { LeadSubmission } from './lead.types';
import type { LeadDecision } from './lead-validation.result';

type LeadValidationInput = {
    lead: LeadSubmission;
    existingContact: ExistingContact | null;
    blacklistEntry: BlacklistEntry | null;
}

export function validateLead({lead,blacklistEntry,existingContact}: LeadValidationInput): LeadDecision {
    if (blacklistEntry?.active) {
        return {
            status: 'REJECTED',
            reason: 'BLACKLISTED',
            message: 'Contact is on the blacklist',
            showCalendar: false
        };
    }

    const showCalendar = lead.adviceIntent === 'EXPERT_REVIEW' || lead.adviceIntent === 'MORE_INFORMATION';

    if (existingContact) {
        return {
            status: 'EXISTING_CONTACT',
            contact: existingContact,
            nextAction: showCalendar ? 'CREATE_ACTIVITY' : 'UPDATE_CONTACT',
            showCalendar
        };
    }

    if (lead.adviceIntent === 'EXPERT_REVIEW') {
        return {
            status: 'QUALIFIED',
            nextAction: 'CREATE_LEAD',
            segment: 'EXPERT_REVIEW',
            showCalendar: true
        };
    }

    return {
        status: 'NURTURE',
        nextAction: 'SEND_INFORMATION',
        segment: lead.adviceIntent,
        showCalendar
    }

}