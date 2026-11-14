import { useT } from "../i18n";
import { Tooltip } from "./ui";

/** Stable term ids -> i18n keys (gloss.<id> / gloss.def.<id>). */
export const GLOSS_TERMS = ["ndvi", "et", "anomaly", "waterBalance",
                            "gdd"] as const;

/** "?" icon next to a technical term; term is a GLOSS_TERMS id. */
export function Glossary({ term }: { term: string }) {
  const { t } = useT();
  return <Tooltip label={`${t(`gloss.${term}`)}?`}
                  text={t(`gloss.def.${term}`)} />;
}
