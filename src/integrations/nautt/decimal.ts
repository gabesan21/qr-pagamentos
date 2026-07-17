import "server-only";

const PLAIN_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const NON_ZERO_DIGIT_PATTERN = /[1-9]/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isExactDecimal(value: unknown): value is string {
  return typeof value === "string" && PLAIN_DECIMAL_PATTERN.test(value);
}

export function isExactPositiveDecimal(value: unknown): value is string {
  return isExactDecimal(value) && NON_ZERO_DIGIT_PATTERN.test(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
