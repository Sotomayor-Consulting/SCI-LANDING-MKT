import type { ExistingContact } from './contact.entity';

export type LeadDecision =
  | {
      status: 'REJECTED';
      reason: 'BLACKLISTED';
      message: string;
      showCalendar: false;
    }
  | {
      status: 'EXISTING_CONTACT';
      contact: ExistingContact;
      nextAction: 'UPDATE_CONTACT' | 'CREATE_ACTIVITY';
      showCalendar: boolean;
    }
  | {
      status: 'QUALIFIED';
      nextAction: 'CREATE_LEAD';
      segment: 'EXPERT_REVIEW';
      showCalendar: true;
    }
  | {
      status: 'NURTURE';
      nextAction: 'SEND_INFORMATION';
      segment: 'MORE_INFORMATION' | 'NOT_READY';
      showCalendar: boolean;
    };
