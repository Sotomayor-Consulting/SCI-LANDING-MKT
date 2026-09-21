import type { ExistingContact } from './contact.entity';

export type ContactLookup =
  | { found: true; contact: ExistingContact }
  | { found: false; contact: null };