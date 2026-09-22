import type { BlacklistEntry } from './blacklist.entity';

export type BlacklistLookup =
  | { found: true; entry: BlacklistEntry }
  | { found: false; entry: null };