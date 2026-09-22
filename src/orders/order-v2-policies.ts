import "server-only";

export const CHECKOUT_DATA_POLICIES = ["NONE", "NAME_EMAIL", "EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"] as const;
export const PAYMENT_LINK_ORDER_STATES = ["CREATED", "PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "INDETERMINATE", "REFUNDED"] as const;

export type CheckoutDataPolicy = (typeof CHECKOUT_DATA_POLICIES)[number];
export type PaymentLinkOrderState = (typeof PAYMENT_LINK_ORDER_STATES)[number];
export type CustomerAddressV1 = Readonly<{
  street: string;
  number: string;
  district: string;
  city: string;
  stateUf: string;
  postalCode: string;
  country: "BR";
  complement: string | null;
}>;
export type CustomerSnapshotV1 = Readonly<{
  name: string | null;
  email: string | null;
  cpf: string | null;
  address: CustomerAddressV1 | null;
}>;

const UNICODE_WHITESPACE = " \\t\\n\\r\\f\\v\\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u;
const BRAZILIAN_UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);

function codePointLength(value: string): number {
  return [...value].length;
}

function normalizedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(new RegExp(`^[${UNICODE_WHITESPACE}]+|[${UNICODE_WHITESPACE}]+$`, "gu"), "");
  return codePointLength(normalized) >= min && codePointLength(normalized) <= max && !CONTROL_PATTERN.test(normalized) ? normalized : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validateEmail(value: unknown): string | null {
  const email = normalizedText(value, 3, 254);
  return email && !/[\s]/u.test(email) && EMAIL_PATTERN.test(email) ? email : null;
}

function validateCpf(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return null;
  const digitAt = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce((total, digit, index) => total + (digit.charCodeAt(0) - 48) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digitAt(9) === digits.charCodeAt(9) - 48 && digitAt(10) === digits.charCodeAt(10) - 48 ? digits : null;
}

function validateAddress(value: unknown): CustomerAddressV1 | null {
  const address = object(value);
  if (!address || !exactKeys(address, ["street", "number", "district", "city", "stateUf", "postalCode", "country", "complement"])) return null;
  const street = normalizedText(address.street, 1, 160);
  const number = normalizedText(address.number, 1, 32);
  const district = normalizedText(address.district, 1, 120);
  const city = normalizedText(address.city, 1, 120);
  const state = normalizedText(address.stateUf, 2, 2);
  const stateUf = state?.toUpperCase() ?? "";
  const postalCode = typeof address.postalCode === "string" && /^(?:\d{8}|\d{5}-\d{3})$/.test(address.postalCode) ? address.postalCode.replace("-", "") : "";
  const complement = address.complement === undefined || address.complement === null
    ? null
    : normalizedText(address.complement, 1, 160);
  if (!street || !number || !district || !city || !BRAZILIAN_UFS.has(stateUf) || !/^\d{8}$/.test(postalCode) || address.country !== "BR" || (address.complement !== undefined && address.complement !== null && typeof address.complement !== "string")) return null;
  return { street, number, district, city, stateUf, postalCode, country: "BR", complement };
}

export function normalizeCustomerSnapshotV1(policy: CheckoutDataPolicy, value: unknown): CustomerSnapshotV1 | null {
  const snapshot = object(value);
  if (!snapshot || !exactKeys(snapshot, ["name", "email", "cpf", "address"])) return null;
  const name = snapshot.name == null ? null : normalizedText(snapshot.name, 1, 160);
  const email = snapshot.email == null ? null : validateEmail(snapshot.email);
  const cpf = snapshot.cpf == null ? null : validateCpf(snapshot.cpf);
  const address = snapshot.address == null ? null : validateAddress(snapshot.address);
  if ((snapshot.name != null && !name) || (snapshot.email != null && !email) || (snapshot.cpf != null && !cpf) || (snapshot.address != null && !address)) return null;
  const normalized = { name, email, cpf, address } satisfies CustomerSnapshotV1;
  const exactTuple = (policy === "NONE" && !name && !email && !cpf && !address)
    || (policy === "NAME_EMAIL" && !!name && !!email && !cpf && !address)
    || (policy === "EMAIL" && !name && !!email && !cpf && !address)
    || (policy === "NAME_EMAIL_CPF" && !!name && !!email && !!cpf && !address)
    || (policy === "NAME_EMAIL_CPF_ADDRESS" && !!name && !!email && !!cpf && !!address);
  return exactTuple ? normalized : null;
}
