export const USER_ROLES = ["ADMIN", "USER"] as const;
export const USER_STATUSES = ["ACTIVE", "DISABLED"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type CanonicalEmail = string & { readonly __canonicalEmail: unique symbol };
export type ValidPassword = string & { readonly __validPassword: unique symbol };

const localPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const domainLabelPattern = /^[a-z0-9-]+$/;
const finalLabelPattern = /^[a-z]{2,63}$/;

export function normalizeEmail(input: string): CanonicalEmail {
  if (/[\0\r\n]/.test(input)) throw new Error("Invalid email address");
  const canonical = input.replace(/^[ \t]+|[ \t]+$/g, "").replace(/[A-Z]/g, (character) => character.toLowerCase());
  if (canonical.length < 6 || canonical.length > 254 || /[^\x20-\x7e]/.test(canonical)) {
    throw new Error("Invalid email address");
  }
  const parts = canonical.split("@");
  if (parts.length !== 2) throw new Error("Invalid email address");
  const [local, domain] = parts;
  if (local.length < 1 || local.length > 64 || !localPattern.test(local)
      || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    throw new Error("Invalid email address");
  }
  if (domain.length < 4 || domain.length > 253) throw new Error("Invalid email address");
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => label.length < 1 || label.length > 63
      || !domainLabelPattern.test(label) || label.startsWith("-") || label.endsWith("-"))
      || !finalLabelPattern.test(labels.at(-1) ?? "")) {
    throw new Error("Invalid email address");
  }
  return canonical as CanonicalEmail;
}

export function validatePassword(input: string): ValidPassword {
  const characters = Array.from(input).length;
  if (characters < 12 || characters > 128) {
    throw new Error("Password must contain 12 to 128 characters");
  }
  return input as ValidPassword;
}

type UserDtoSource = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export function toUserDto<T extends UserDtoSource>({ id, email, role, status, createdAt }: T): UserDtoSource {
  return { id, email, role, status, createdAt };
}
