import type { BlacklistEntry } from '@/domain/leads/blacklist.entity';

export interface BlacklistRepository {
  findActiveByEmail(email: string): Promise<BlacklistEntry | null>;
}
