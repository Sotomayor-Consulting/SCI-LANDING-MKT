import type { ExistingContact } from '@/domain/leads/contact.entity';

export interface ContactRepository {
    findByEmail(email:string): Promise<ExistingContact | null>;
}