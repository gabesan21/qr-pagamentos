// Browser-local expiry conversion for the merchant V2 link form. The visible
// control is an unnamed `datetime-local` in the browser clock; the hidden
// canonical `expiresAt` posts the delivered server grammar (UTC
// `YYYY-MM-DDTHH:mm`). Both helpers are pure and money never passes here.
//
// The stored instant is a UTC date; the browser clock is unavailable during
// SSR, so callers convert the stored instant only after mount — never during
// the server render — to avoid a hydration mismatch.

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats a stored ISO instant as the browser-local `datetime-local` value. */
export function instantToLocalInput(instant: string): string {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/** Converts a browser-local `datetime-local` value to the UTC server grammar. */
export function localInputToUtc(local: string): string {
  if (local === "") return "";
  const parsed = new Date(local);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}
