import { SessionModel } from "@/infrastructure/db/SessionModel";
import { UserModel } from "@/infrastructure/db/UserModel";
import { hashToken } from "@/infrastructure/auth/tokens";

export interface ResolvedSession {
  userId: string;
  email: string;
  expiresAt: Date;
}

export async function getSession(rawToken: string | undefined): Promise<ResolvedSession | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const s = await SessionModel.findOne({ tokenHash });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    await s.deleteOne();
    return null;
  }
  s.lastUsedAt = new Date();
  await s.save();
  const u = await UserModel.findById(s.userId).lean();
  if (!u) {
    await s.deleteOne();
    return null;
  }
  return { userId: s.userId.toString(), email: u.email, expiresAt: s.expiresAt };
}
