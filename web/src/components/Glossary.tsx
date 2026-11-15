import { useT } from "../i18n";
import { Tooltip } from "./ui";

/** Stable term ids -> i18n keys (gloss.<id> / gloss.def.<id>). */
export const GLOSS_TERMS = ["ndvi", "et", "et0", "anomaly", "soilAnomaly",
                            "waterBalance", "gdd", "frost", "frostFree",
                            "satGround", "bareSoil", "enso",
                            "hydroGroup"] as const;
export type GlossTerm = (typeof GLOSS_TERMS)[number];

/** Diagnosis card id -> glossary terms it uses; the "?" goes next to
 * the card title. */
export const CARD_TERMS: Record<string, GlossTerm[]> = {
  rain: ["waterBalance"],
  crop_water: ["et", "waterBalance"],
  soil_moisture: ["soilAnomaly"],
  frost: ["frost", "frostFree"],
  heat: ["gdd"],
  water_trend: ["waterBalance"],
  vigor_bare_soil: ["ndvi", "bareSoil"],
  soil: ["hydroGroup"],
  fire: ["anomaly"],
  fire_weather: ["anomaly"],
};

/** Calendar row id -> glossary term; the "?" goes in the row header. */
export const ROW_TERMS: Record<string, GlossTerm> = {
  bare_soil: "bareSoil",
  frost: "frost",
  water_stress: "waterBalance",
  heat: "gdd",
};

/** "?" icon next to a technical term; term is a GLOSS_TERMS id. */
export function Glossary({ term }: { term: string }) {
  const { t } = useT();
  return <Tooltip label={`${t(`gloss.${term}`)}?`}
                  text={t(`gloss.def.${term}`)} />;
}

/** All terms with their definitions, for the collapsible list. */
export function GlossDefs() {
  const { t } = useT();
  return (
    <dl className="gloss-defs">
      {GLOSS_TERMS.map((term) => (
        <div key={term} className="gloss-def">
          <dt>{t(`gloss.${term}`)}</dt>
          <dd>{t(`gloss.def.${term}`)}</dd>
        </div>))}
    </dl>);
}
