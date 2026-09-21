import type {BlacklistEntry} from '@/domain/leads/blacklist.entity';
import type { ExistingContact } from '@/domain/leads/contact.entity';

import type {OdooLeadBlacklistRecord,OdooPartnerRecord} from './odoo.types';

function normalizeRequiredEmail(value: string | false, fieldName:string): string {
    if (typeof value != 'string' || value.trim() === '') {
        throw new Error(`Odoo returned an invalid ${fieldName}`);
    }
    return value.trim().toLowerCase();
}

export function mapOdooPartnerToContact(
  record: OdooPartnerRecord
): ExistingContact {
  const email = normalizeRequiredEmail(record.email, 'contact email');

  return {
    id: record.id,
    name: record.name,
    email,
    ...(typeof record.phone === 'string' && record.phone.trim()
      ? { phone: record.phone.trim() }
      : {}),
  };
}

export function mapOdooBlacklistToEntry(
  record: OdooLeadBlacklistRecord
): BlacklistEntry {
  const email = normalizeRequiredEmail(
    record.email_from,
    'blacklist email'
  );

  return {
    id: record.id,
    email,
    active: true,
  };
}