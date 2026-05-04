import type { Role } from './auth';

/**
 * Common message router used by chat UI and the Telegram integration.
 * Keeps a single place for verifying user → looking up access → calling AI.
 */
export interface IncomingMessage {
  channel: 'web' | 'telegram';
  externalUserId: string; // email for web; chat id for telegram
  text: string;
}

export interface ResolvedUser {
  id: string;
  name: string;
  role: Role;
}

export type UserResolver = (msg: IncomingMessage) => Promise<ResolvedUser | null>;
