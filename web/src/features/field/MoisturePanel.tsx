import { useEffect, useState } from "react";
import { apiMoisture } from "../../api";
import type { MoistureKind, MoistureResult, MoistureZone } from "../../api/types";
import type { PlotBody } from "../../domain/selection";
import { useT } from "../../i18n";

import { MOISTURE_COLORS } from "../../domain/moisture";

export function MoisturePanel({ body, selected, onZones, onSelect }: {
  body: PlotBody;
  selected: number | null;
  onZones: (zones: MoistureZone[]) => void;
  onSelect: (index: number | null) => void;
}) {
  const { t, lang } = useT();
  const [result, setResult] = useState<MoistureResult | null>(null);
  const [visible, setVisible] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    apiMoisture(body, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult(data ?? { status: "unavailable" });
    });
    return () => controller.abort();
  }, [body, retry]);
  useEffect(() => {
    onZones(visible && result?.status === "available" ? result.zones : []);
    return () => onZones([]);
  }, [visible, result, onZones]);

  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const date = result?.status === "available"
    ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" })
      .format(new Date(result.date + "T00:00:00Z")) : "";
  const zone = result?.status === "available" && selected != null
    ? result.zones[selected] : null;
  return (
    <section className="card moisture-card" aria-labelledby="moisture-title">
      <h3 id="moisture-title">{t("moisture.title")}</h3>
      {!result && <p role="status">{t("moisture.loading")}</p>}
      {result?.status === "unavailable" && <p role="status">
        {t("moisture.unavailable")} <button onClick={() => setRetry((n) => n + 1)}>
          {t("field.diagnosis.retry")}
        </button>
      </p>}
      {result?.status === "no_detail" && <p role="status">{t("moisture.noDetail")}</p>}
      {result?.status === "available" && <>
        <p>{t("moisture.observed", { date, n: fmt.format(result.coverage * 100) })}</p>
        <p className="muted">{t("moisture.explain")}</p>
        {result.zones.every((item) => item.kind === "middle" || item.kind === "missing") &&
          <p>{t("moisture.uniform")}</p>}
        <button aria-pressed={visible} onClick={() => {
          setVisible(!visible); onSelect(null);
        }}>{t(visible ? "moisture.hide" : "moisture.show")}</button>
        <ul className="moisture-legend">
          {(Object.keys(MOISTURE_COLORS) as MoistureKind[]).map((kind) => {
            const total = result.zones.filter((item) => item.kind === kind)
              .reduce((sum, item) => sum + item.ha, 0);
            if (!total) return null;
            return <li key={kind}>
              <span className={kind} style={{ backgroundColor: MOISTURE_COLORS[kind] }} />
              {t("moisture." + kind)} · {fmt.format(total)} ha
            </li>;
          })}
        </ul>
        {visible && <label>{t("moisture.pick")}
          <select value={selected ?? ""} onChange={(e) => {
            onSelect(e.target.value === "" ? null : Number(e.target.value));
          }}>
            <option value="">{t("moisture.all")}</option>
            {result.zones.map((item, i) => <option key={i} value={i}>
              {t("moisture." + item.kind)} · {fmt.format(item.ha)} ha
            </option>)}
          </select>
        </label>}
        {zone && <p role="status">{t("moisture.selected", {
          label: t("moisture." + zone.kind), n: fmt.format(zone.ha), date,
        })}</p>}
      </>}
    </section>
  );
}
