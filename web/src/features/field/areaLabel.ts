import { useT } from "../../i18n";
import type { AreaOption } from "../../domain/fields";

/** Readable label of an analysis area ("Todo el campo", "Pieza 2",
 * "Zona Norte (maíz)"). */
export function useAreaLabel() {
  const { t } = useT();
  return (o: Pick<AreaOption, "kind" | "label" | "crop">) =>
    o.kind === "all" ? t("analyze.all")
      : o.kind === "piece" ? t("analyze.piece", { i: o.label })
        : t(o.crop ? "analyze.zoneCrop" : "analyze.zone",
            { name: o.label, crop: o.crop ?? "" });
}
