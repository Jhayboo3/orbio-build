const SECRET_KEYS = new Set([
  "api-key",
  "apikey",
  "authorization",
  "cookie",
  "key",
  "refresh_token",
  "secret",
  "set-cookie",
  "token",
]);

const REDACTED = "[REDACTED]";

export function redactValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEYS.has(key.toLowerCase())) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }

  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
      .replace(/(?:sk|or)-[A-Za-z0-9_-]{12,}/g, REDACTED);
  }

  return value;
}
