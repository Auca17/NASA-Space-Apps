/** "Mis números": optional per-parcel economics — cost per hectare,
 * expected price per ton, expected yield (empty = MAGyP department
 * average, said so in the hint) — plus the currency. All optional;
 * every field validates to a non-negative number with a clear
 * message. */
import { useState } from "react";
import { useT } from "../../i18n";
import type { ParcelInput } from "../../domain/parcels";
import type { Economics, ParcelEcon } from "../../domain/parcelsProfile";

type FieldKey = keyof ParcelEcon;

const FIELDS: { key: FieldKey; label: string; ph: string }[] = [
  { key: "cost_per_ha", label: "parcels.econ.cost", ph: "parcels.econ.costPh" },
  { key: "price_per_t", label: "parcels.econ.price", ph: "parcels.econ.pricePh" },
  { key: "expected_yield_t_ha", label: "parcels.econ.yield",
    ph: "parcels.econ.yieldPh" },
];

const parseNum = (s: string): number | null | "bad" => {
  const v = s.trim();
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : "bad";
};

export function EconomicsForm({ parcels, value, onChange }: {
  parcels: ParcelInput[];
  value: Economics;
  onChange: (e: Economics) => void;
}) {
  const { t } = useT();
  // raw strings so the user can type "3," before finishing the number
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [bad, setBad] = useState<Record<string, boolean>>({});

  const fieldId = (pid: string, k: FieldKey) => `${pid}.${k}`;
  const text = (pid: string, k: FieldKey): string =>
    raw[fieldId(pid, k)] ??
      (value.parcels[pid]?.[k] != null
        ? String(value.parcels[pid]![k]) : "");

  const set = (pid: string, k: FieldKey, s: string) => {
    setRaw((r) => ({ ...r, [fieldId(pid, k)]: s }));
    const n = parseNum(s);
    setBad((b) => ({ ...b, [fieldId(pid, k)]: n === "bad" }));
    const pe: ParcelEcon = { ...value.parcels[pid] };
    if (n === null) delete pe[k];
    else if (n !== "bad") pe[k] = n;
    else return; // keep the last valid number while the input is wrong
    onChange({ ...value, parcels: { ...value.parcels, [pid]: pe } });
  };

  return (
    <div className="econ-form">
      <label className="econ-currency">
        {t("parcels.econ.currency")}
        <select value={value.currency}
                onChange={(e) => onChange(
                  { ...value, currency: e.target.value === "ARS"
                      ? "ARS" : "USD" })}>
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </label>
      {parcels.map((p) => (
        <details key={p.id} className="econ-parcel">
          <summary>
            {p.name}
            <span className="muted">
              {Object.keys(value.parcels[p.id] ?? {}).length
                ? t("parcels.econ.filled") : ""}
            </span>
          </summary>
          <div className="econ-fields">
            {FIELDS.map(({ key, label, ph }) => (
              <label key={key}>
                {t(label)}
                <input inputMode="decimal"
                       value={text(p.id, key)}
                       placeholder={t(ph)}
                       aria-invalid={bad[fieldId(p.id, key)] || undefined}
                       aria-label={`${t(label)} — ${p.name}`}
                       onChange={(e) => set(p.id, key, e.target.value)} />
              </label>))}
            {FIELDS.some(({ key }) => bad[fieldId(p.id, key)]) && (
              <p className="notice" role="alert">
                {t("parcels.econ.bad")}</p>)}
            <p className="muted">{t("parcels.econ.yieldHint")}</p>
          </div>
        </details>))}
    </div>);
}
