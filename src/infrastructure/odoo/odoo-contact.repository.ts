import type { ExistingContact } from '@/domain/leads/contact.entity';
import type {ContactRepository} from '@/application/leads/ports/contact.repository';

import { odooClient } from './odoo.client';
import type { OdooPartnerRecord } from './odoo.types';
import { mapOdooPartnerToContact } from './odoo.mappers';

export class OdooContactRepository implements ContactRepository {
    async findByEmail(email:string): Promise<ExistingContact | null> {
        const response = await odooClient.post<OdooPartnerRecord[]>(
            '/res.partner/search_read',
            {
                domain: [['email', '=', email]],
                fields: ['id', 'name', 'email', 'phone'],
                limit: 1,
            }
        );
        const record = response.data[0];
        return record ? mapOdooPartnerToContact(record) : null;
    }
}