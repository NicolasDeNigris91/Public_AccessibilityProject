export interface MagicLink {
  tokenHash: string;
  email: string;
  clientId?: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}
