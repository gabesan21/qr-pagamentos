// Client-side format validation and masks for the buyer form (14.6.1 F03).
// Mirrors the shape the server normalization in `payment-link-order.ts`
// already accepts (digits-only or the punctuated grammar) so a masked value
// submitted as-is is never rejected server-side. This module never loosens
// or replaces the server's own validation — it only reports the same kind of
// defect earlier, in the buyer's language.

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function maskCpf(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, "").slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);
  let masked = part1;
  if (part2) masked += `.${part2}`;
  if (part3) masked += `.${part3}`;
  if (part4) masked += `-${part4}`;
  return masked;
}

export function maskPostalCode(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  const part1 = digits.slice(0, 5);
  const part2 = digits.slice(5, 8);
  return part2 ? `${part1}-${part2}` : part1;
}

export function isValidEmailFormat(value: string): boolean {
  return EMAIL_FORMAT_PATTERN.test(value.trim());
}

// Same check-digit algorithm the server applies in `validateCpf`, run
// client-side against the masked or bare-digit value.
export function isValidCpfFormat(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const digitAt = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digitAt(9) === Number(digits[9]) && digitAt(10) === Number(digits[10]);
}

export function isValidPostalCodeFormat(value: string): boolean {
  return /^\d{5}-?\d{3}$/.test(value.replace(/\s/g, ""));
}
