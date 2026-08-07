import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "./types";
import { users, mockLatency } from "./fixtures";

export type SignInResult =
  | { ok: true; requiresTotp: boolean }
  | { ok: false; error: "invalid-credentials" | "request-error" };

export type TotpResult =
  | { ok: true }
  | { ok: false; error: "wrong-code" | "too-many-attempts" };

export type ResetTokenState = "loading" | "valid" | "invalid" | "expired" | "used";

interface SessionContextValue {
  /** Signed-in mock user (null when signed out). */
  user: User | null;
  /** User awaiting the TOTP challenge step (null when not in challenge). */
  pendingTotpUser: User | null;
  isAuthenticated: boolean;
  /** All fixture users — for the demo role switcher. */
  demoUsers: User[];
  /** Mock sign-in. `nautt-admin` requires the TOTP step; valid demo credentials: any fixture username + password "demo1234". */
  signIn: (username: string, password: string) => Promise<SignInResult>;
  /** Mock TOTP/recovery verification. Demo code: any 6-digit code ending in "0" succeeds; others fail. */
  verifyTotp: (code: string) => Promise<TotpResult>;
  /** Abort the TOTP challenge and return to the credentials step. */
  cancelTotp: () => void;
  signOut: () => void;
  /** Demo helper: switch session to another fixture user instantly. */
  switchUser: (userId: string) => void;
  /** Mock reset-token resolution. Query token "expired" → expired, "used" → used, otherwise valid. */
  resolveResetToken: (token: string | null) => Promise<ResetTokenState>;
  resetPassword: (password: string) => Promise<{ ok: boolean }>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "qrp:session-user";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    return users.find((u) => u.id === id) ?? null;
  });
  const [pendingTotpUser, setPendingTotpUser] = useState<User | null>(null);
  const [totpAttempts, setTotpAttempts] = useState(0);

  const signIn = useCallback(async (username: string, password: string): Promise<SignInResult> => {
    await mockLatency(600);
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!found || password !== "demo1234" || found.state !== "active") {
      return { ok: false, error: "invalid-credentials" };
    }
    if (found.totpEnabled) {
      setPendingTotpUser(found);
      setTotpAttempts(0);
      return { ok: true, requiresTotp: true };
    }
    setUser(found);
    localStorage.setItem(STORAGE_KEY, found.id);
    return { ok: true, requiresTotp: false };
  }, []);

  const verifyTotp = useCallback(
    async (code: string): Promise<TotpResult> => {
      await mockLatency(500);
      if (!pendingTotpUser) return { ok: false, error: "wrong-code" };
      if (totpAttempts >= 4) return { ok: false, error: "too-many-attempts" };
      const digits = code.replace(/\D/g, "");
      const ok = digits.endsWith("0") && digits.length >= 6;
      if (!ok) {
        setTotpAttempts((n) => n + 1);
        return totpAttempts + 1 >= 5 ? { ok: false, error: "too-many-attempts" } : { ok: false, error: "wrong-code" };
      }
      setUser(pendingTotpUser);
      localStorage.setItem(STORAGE_KEY, pendingTotpUser.id);
      setPendingTotpUser(null);
      return { ok: true };
    },
    [pendingTotpUser, totpAttempts],
  );

  const cancelTotp = useCallback(() => {
    setPendingTotpUser(null);
    setTotpAttempts(0);
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setPendingTotpUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchUser = useCallback((userId: string) => {
    const found = users.find((u) => u.id === userId) ?? null;
    setUser(found);
    if (found) localStorage.setItem(STORAGE_KEY, found.id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const resolveResetToken = useCallback(async (token: string | null): Promise<ResetTokenState> => {
    await mockLatency(700);
    if (!token) return "invalid";
    if (token === "expired") return "expired";
    if (token === "used") return "used";
    return "valid";
  }, []);

  const resetPassword = useCallback(async (password: string) => {
    await mockLatency(600);
    return { ok: password.length >= 12 && password.length <= 128 };
  }, []);

  const value = useMemo(
    () => ({
      user,
      pendingTotpUser,
      isAuthenticated: user !== null,
      demoUsers: users,
      signIn,
      verifyTotp,
      cancelTotp,
      signOut,
      switchUser,
      resolveResetToken,
      resetPassword,
    }),
    [user, pendingTotpUser, signIn, verifyTotp, cancelTotp, signOut, switchUser, resolveResetToken, resetPassword],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
