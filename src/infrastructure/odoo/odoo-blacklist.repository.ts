import type { BlacklistEntry } from '@/domain/leads/blacklist.entity';
import type {BlacklistRepository} from '@/application/leads/ports/blacklist.repository';

import { odooClient } from './odoo.client';
import type { OdooLeadBlacklistRecord } from './odoo.types';
import { mapOdooBlacklistToEntry } from './odoo.mappers';

export class OdooBlacklistRepository implements BlacklistRepository {
  async findActiveByEmail(
    email: string
  ): Promise<BlacklistEntry | null> {
    const response = await odooClient.post<OdooLeadBlacklistRecord[]>(
      '/crm.lead/search_read',
      {
        domain: [
          '&',
          ['stage_id', 'in', [17]],
          ['email_from', '=', email],
        ],
        fields: ['id', 'name', 'email_from', 'phone'],
        limit: 1,
      }
    );

    const record = response.data[0];


    return record ? mapOdooBlacklistToEntry(record) : null;
  }
}