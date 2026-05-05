import { SessionModel } from "@/infrastructure/db/SessionModel";
import { hashToken } from "@/infrastructure/auth/tokens";

export async function logout(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await SessionModel.deleteOne({ tokenHash: hashToken(rawToken) });
}
