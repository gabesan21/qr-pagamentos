import { getDatabaseClient } from "../db/client";
import { verifyPassword } from "./password";

export async function verifyCurrentPassword(userId: string, password: string): Promise<boolean> {
  const user = await getDatabaseClient().user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    include: { credential: true },
  });
  if (!user?.credential) return false;
  return verifyPassword(password, user.credential.passwordHash);
}
