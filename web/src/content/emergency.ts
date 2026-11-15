/** Emergency numbers by ISO 3166-1 alpha-2 country code (task 26).
 * Only numbers verified on an official government or emergency-service
 * page; `source` keeps the page each row was checked against. A country
 * absent from the table must never get a guessed number: the UI falls
 * back to "call your country's emergency number" (plus the EU 112 row
 * when the country is in the EU). */

export interface EmergencyNumber {
  /** i18n key for the service name (`emerg.svc.*`). */
  service: string;
  /** Digits only; used verbatim in the tel: link and the text list. */
  number: string;
  /** Official government / emergency-service page the number was
   * verified on. */
  source: string;
}

const AR_GOV = "https://www.argentina.gob.ar/tema/emergencias";
const CL_GOV = "https://degreyd.minsal.cl/informacion-esencial/";
const PY_GOV = "https://www.paraguay.gov.py/sobre-portal";
const BR_GOV = "https://www.gov.br/mcom/pt-br/noticias/2026/setembro/" +
  "emergencia-voce-sabe-para-quem-ligar-quando-precisa-de-ajuda";
const EU_GOV = "https://digital-strategy.ec.europa.eu/es/policies/112";
const EU_YOUREUROPE = "https://europa.eu/youreurope/citizens/travel/" +
  "security-and-emergencies/emergency/index_es.htm";

export const EMERGENCY_BY_COUNTRY: Record<string, EmergencyNumber[]> = {
  AR: [
    { service: "emerg.svc.fire", number: "100", source: AR_GOV },
    { service: "emerg.svc.emergency", number: "911", source: AR_GOV },
  ],
  CL: [
    { service: "emerg.svc.fire", number: "132", source: CL_GOV },
    { service: "emerg.svc.ambulance", number: "131", source: CL_GOV },
    { service: "emerg.svc.police", number: "133", source: CL_GOV },
  ],
  UY: [
    { service: "emerg.svc.emergency", number: "911",
      source: "https://www.gub.uy/sistema-nacional-emergencias/" +
              "recomendaciones-ante-emergencias" },
  ],
  PY: [
    { service: "emerg.svc.fire", number: "132", source: PY_GOV },
    { service: "emerg.svc.police", number: "911", source: PY_GOV },
    { service: "emerg.svc.ambulance", number: "141", source: PY_GOV },
  ],
  BR: [
    { service: "emerg.svc.fire", number: "193", source: BR_GOV },
    { service: "emerg.svc.ambulance", number: "192", source: BR_GOV },
    { service: "emerg.svc.police", number: "190", source: BR_GOV },
  ],
  BO: [
    { service: "emerg.svc.fire", number: "119",
      source: "http://bomberos.sippci.policia.bo/" },
    { service: "emerg.svc.emergency", number: "911",
      source: "https://www.gamirupana.gob.bo/2024/06/25/no-a-las-quemas/" },
  ],
  MX: [
    { service: "emerg.svc.emergency", number: "911",
      source: "http://edomex.gob.mx/emergencias_911" },
  ],
  US: [
    { service: "emerg.svc.emergency", number: "911",
      source: "https://www.fcc.gov/general/9-1-1-and-e9-1-1-services" },
  ],
  CA: [
    { service: "emerg.svc.emergency", number: "911",
      source: "https://crtc.gc.ca/eng/phone/911/can.htm" },
  ],
  ES: [
    { service: "emerg.svc.emergency", number: "112",
      source: EU_YOUREUROPE },
  ],
  PT: [
    { service: "emerg.svc.emergency", number: "112",
      source: EU_YOUREUROPE },
  ],
  AU: [
    { service: "emerg.svc.emergency", number: "000",
      source: "https://www.triplezero.gov.au/triple-zero/" +
              "other-emergency-numbers" },
  ],
};

/** EU-wide emergency number, shown additionally for EU members that
 * have no own row in the table. */
export const EU_NUMBER: EmergencyNumber = {
  service: "emerg.svc.eu", number: "112", source: EU_GOV,
};

/** EU member states (ISO A2): 112 works everywhere in the Union. */
export const EU_MEMBERS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** Numbers for a country: its own rows, or the EU 112 row for EU
 * members, or [] when nothing verified exists (never a guess). */
export function numbersFor(country: string | null | undefined):
    EmergencyNumber[] {
  if (!country) return [];
  const own = EMERGENCY_BY_COUNTRY[country];
  if (own) return own;
  return EU_MEMBERS.has(country) ? [EU_NUMBER] : [];
}
