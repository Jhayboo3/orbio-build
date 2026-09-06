export interface ExtractedOrbioKey {
  baseUrl?: URL;
  key: string;
}

const SECRET_FIELD_NAMES = new Set([
  "api_key",
  "apikey",
  "credential",
  "key",
  "secret",
  "token",
]);

const BASE_URL_FIELD_NAMES = new Set(["base_url", "baseurl", "gateway_url"]);

export function extractCreatedOrbioKey(result: unknown): ExtractedOrbioKey {
  const candidates = collectCandidates(result);
  const key = candidates.secrets.find((candidate) => candidate.length >= 12);
  if (!key) {
    throw new Error("The Orbio create-key response did not contain a recognizable secret.");
  }

  const baseUrlValue = candidates.baseUrls.find((candidate) => {
    try {
      return new URL(candidate).protocol.startsWith("http");
    } catch {
      return false;
    }
  });

  return {
    key,
    ...(baseUrlValue ? { baseUrl: new URL(baseUrlValue) } : {}),
  };
}

function collectCandidates(value: unknown): {
  baseUrls: string[];
  secrets: string[];
} {
  const result = { baseUrls: [] as string[], secrets: [] as string[] };
  visit(value, result);
  return result;
}

function visit(
  value: unknown,
  result: { baseUrls: string[]; secrets: string[] },
  keyName?: string,
): void {
  if (typeof value === "string") {
    const normalizedKey = keyName?.toLowerCase();
    if (normalizedKey && SECRET_FIELD_NAMES.has(normalizedKey)) {
      result.secrets.push(value);
    }
    if (normalizedKey && BASE_URL_FIELD_NAMES.has(normalizedKey)) {
      result.baseUrls.push(value);
    }

    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        visit(JSON.parse(trimmed), result);
      } catch {
        // Non-JSON text is handled by the conservative key-pattern fallback below.
      }
    }

    const fallback = trimmed.match(/\b(?:sk-or-v1-|or-|orbio_)[A-Za-z0-9._-]{12,}\b/);
    if (fallback?.[0]) {
      result.secrets.push(fallback[0]);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, result);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      visit(entryValue, result, entryKey);
    }
  }
}
