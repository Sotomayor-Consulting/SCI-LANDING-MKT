import countriesJson from "@/content/phone-countries.json";

export type PhoneCountry = {
  iso2: string;
  name: string;
  dialCode: string;
  placeholder: string;
};

type PhoneCountryJson = PhoneCountry & {
  timezones?: string[];
  timezonePrefixes?: string[];
};

const rawCountries = countriesJson as unknown as PhoneCountryJson[];

export const PHONE_COUNTRIES: readonly PhoneCountry[] = rawCountries.map(
  ({ iso2, name, dialCode, placeholder }) => ({
    iso2: iso2.toUpperCase(),
    name,
    dialCode,
    placeholder,
  }),
);

export const PHONE_COUNTRY_BY_ISO = new Map(
  PHONE_COUNTRIES.map((country) => [country.iso2, country]),
);

export const DEFAULT_PHONE_COUNTRY_ISO = "EC";

const TIMEZONE_TO_ISO = new Map<string, string>();
const TIMEZONE_PREFIXES: Array<[string, string]> = [];

for (const country of rawCountries) {
  const iso2 = country.iso2.toUpperCase();
  if (!PHONE_COUNTRY_BY_ISO.has(iso2)) continue;

  for (const zone of country.timezones ?? []) {
    TIMEZONE_TO_ISO.set(zone, iso2);
  }
  for (const prefix of country.timezonePrefixes ?? []) {
    TIMEZONE_PREFIXES.push([prefix, iso2]);
  }
}

// El prefijo más específico gana.
TIMEZONE_PREFIXES.sort((a, b) => b[0].length - a[0].length);

export type AttendeePhonePayload = {
  attendee_phone: string;
  attendee_phone_country?: string;
};

/**
 * Calnode espera el número nacional junto al país ISO, o el número en
 * formato E.164 cuando ya incluye prefijo internacional.
 */
export const buildAttendeePhonePayload = (
  raw: string | null | undefined,
  countryIso: string | null | undefined,
): AttendeePhonePayload | null => {
  const value = raw?.trim();
  if (!value) return null;

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (value.startsWith("+")) {
    return { attendee_phone: `+${digits}` };
  }

  if (value.startsWith("00")) {
    return { attendee_phone: `+${digits.slice(2)}` };
  }

  const normalizedIso = countryIso?.toUpperCase();

  return {
    attendee_phone: value,
    attendee_phone_country:
      (normalizedIso && PHONE_COUNTRY_BY_ISO.get(normalizedIso)?.iso2) ||
      DEFAULT_PHONE_COUNTRY_ISO,
  };
};

export const detectPhoneCountryIso = (
  timeZone: string | null | undefined,
  locales: readonly string[] = [],
): string => {
  if (timeZone) {
    const exact = TIMEZONE_TO_ISO.get(timeZone);
    if (exact) return exact;

    const prefix = TIMEZONE_PREFIXES.find(([value]) =>
      timeZone.startsWith(value),
    );
    if (prefix) return prefix[1];
  }

  // Solo la región explícita del locale. No se usa maximize():
  // "es" se convertiría en "ES" y elegiría España incorrectamente.
  for (const locale of locales) {
    try {
      const parsed = new Intl.Locale(locale.replace(/_/g, "-"));
      const region = parsed.region?.toUpperCase();
      if (
        region &&
        /^[A-Z]{2}$/.test(region) &&
        PHONE_COUNTRY_BY_ISO.has(region)
      ) {
        return region;
      }
    } catch {
      // Locale inválido: se ignora.
    }
  }

  return DEFAULT_PHONE_COUNTRY_ISO;
};
