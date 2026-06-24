import { parsePhoneNumberFromString, getCountries, getCountryCallingCode } from "libphonenumber-js";

export interface ParsedRecipient {
  raw: string;
  e164: string | null;
  msisdn: number | null;
  country: string | null;
  error?: string;
}

export function parseRecipient(raw: string): ParsedRecipient {
  const cleaned = raw.trim();
  if (!cleaned) return { raw, e164: null, msisdn: null, country: null, error: "Empty" };
  try {
    const p = parsePhoneNumberFromString(cleaned.startsWith("+") ? cleaned : "+" + cleaned);
    if (!p || !p.isValid()) {
      return { raw, e164: null, msisdn: null, country: null, error: "Invalid number" };
    }
    const e164 = p.number;
    return {
      raw,
      e164,
      msisdn: Number(e164.replace("+", "")),
      country: p.country ?? null,
    };
  } catch {
    return { raw, e164: null, msisdn: null, country: null, error: "Invalid number" };
  }
}

export function splitRecipients(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// GSM 7-bit (160 char segments, 153 for multipart) vs Unicode (70 / 67)
const GSM_REGEX = /^[\x20-\x7E\n\r\t\u00A3\u00A5\u00E8\u00E9\u00F9\u00EC\u00F2\u00C7\u00D8\u00F8\u00C5\u00E5\u0394\u005F\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039E\u00C6\u00E6\u00DF\u00C9\u00A4\u00A1\u00C4\u00D6\u00D1\u00DC\u00A7\u00BF\u00E4\u00F6\u00F1\u00FC\u00E0]*$/;

export function smsSegments(message: string): { encoding: "gsm" | "unicode"; segments: number; chars: number } {
  const chars = [...message].length;
  if (GSM_REGEX.test(message)) {
    if (chars <= 160) return { encoding: "gsm", segments: 1, chars };
    return { encoding: "gsm", segments: Math.ceil(chars / 153), chars };
  }
  if (chars <= 70) return { encoding: "unicode", segments: 1, chars };
  return { encoding: "unicode", segments: Math.ceil(chars / 67), chars };
}

export function listCountries(): { code: string; name: string; callingCode: string }[] {
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  return getCountries().map((c) => ({
    code: c,
    name: display.of(c) ?? c,
    callingCode: getCountryCallingCode(c),
  }));
}
