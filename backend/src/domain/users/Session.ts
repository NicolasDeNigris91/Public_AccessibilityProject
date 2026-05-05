export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}
