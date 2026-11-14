/** Field lens: draw/tap plot -> diagnose -> rotations -> explain. */
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";
import { Card, BottomSheet } from "../../components/ui";
import { Glossary } from "../../components/Glossary";
import {
  apiDiagnose, apiRotations, apiExplain, knowledgeRotations,
  knowledgeCrops,
} from "../../api";
import type {
  DiagnoseResponse, RotationsResponse, Strategy,
} from "../../api/types";

type LatLonRing = [number, number][];
/** Back contract: {polygon:{coordinates:[[[lon,lat],..closed]]}} or
 * {point:[lat,lon],ha}. */
type PlotBody = { polygon: { coordinates: [number,number][][] } } |
                { point: [number, number]; ha: number };

const LS_PLOTS = "fs_plots";

const PRIORITIES = ["water", "soil", "erosion", "income", "forage",
                    "nitrogen", "pests", "avoid_burning"] as const;
const CONSTRAINTS = ["irrigation", "livestock", "machinery", "markets"] as const;

function savePlot(name: string, body: PlotBody) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_PLOTS) ?? "[]") as unknown[];
    all.push({ name, body, saved_at: new Date().toISOString() });
    localStorage.setItem(LS_PLOTS, JSON.stringify(all.slice(-20)));
  } catch { /* quota/parse errors: non-fatal */ }
}

function levelText(lv: number | null): string {
  if (lv == null) return "·";
  return ["○", "◔", "◑", "●"][Math.min(Math.max(lv, 0), 3)];
}

function StrategyCard({ s, t }: {
    s: Strategy;
    t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <article className={`card strategy${s.is_current ? " current" : ""}`}>
      <h3>{s.name}
        {s.is_current && <span className="badge"> {t("rot.current")}</span>}
      </h3>
      <p className="muted">{t("rot.score", { s: s.score })} · {s.confidence}</p>
      <p><strong>{t("rot.why")}:</strong> {s.why}</p>
      {s.evidence.length > 0 && (
        <div><strong>{t("rot.evidence")}</strong>
          <ul>{s.evidence.map((e, i) => <li key={i}>{e.text}
            {e.source && <span className="muted"> — {e.source}</span>}</li>)}
          </ul></div>)}
      {s.benefits && Object.keys(s.benefits).length > 0 && (
        <div><strong>{t("rot.benefits")}</strong>
          <ul>{Object.entries(s.benefits).map(([k, v]) => (
            <li key={k}>{k}: {String(v)}</li>))}</ul></div>)}
      {s.gaps.length > 0 && (
        <div><strong>{t("rot.gaps")}</strong>
          <ul>{s.gaps.map((g) => <li key={g}>{g}</li>)}</ul></div>)}
      {s.risks.length > 0 && (
        <div><strong>{t("rot.risks")}</strong>
          <ul>{s.risks.map((r) => <li key={r}>{r}</li>)}</ul></div>)}
      <div><strong>{t("rot.sequence")}</strong>
        <div className="seq-timeline">
          {s.sequence.map((seq, i) => (
            <div className="seq-item" key={i}>
              <span>{seq.crop} · {seq.start}→{seq.end}</span>
              <span className={`cov ${seq.cover === false ? "bare" : "covered"}`}>
                {seq.cover === false ? `▢ ${t("rot.bare")}` : `■ ${t("rot.covered")}`}
              </span>
            </div>))}
        </div></div>
      {s.measures && s.measures.length > 0 && (
        <div><strong>{t("rot.measures")}</strong>
          <ul>{s.measures.map((m) => (
            <li key={m.id}><strong>{m.name}</strong>
              {m.why && <> — {m.why}</>}
              {m.requires && <div className="muted">
                {Object.entries(m.requires).map(([k, v]) =>
                  `${k}: ${v}`).join(" · ")}</div>}
              {m.cost && <div className="muted">{m.cost}</div>}
              {m.source && <div className="muted">{m.source}</div>}
            </li>))}</ul></div>)}
    </article>
  );
}

export function FieldPanel({ ring, open, onClose }: {
  ring: LatLonRing | null; open: boolean; onClose: () => void;
}) {
  const { t, lang } = useT();
  const [diag, setDiag] = useState<DiagnoseResponse | null>(null);
  const [rots, setRots] = useState<RotationsResponse | null>(null);
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [rotList, setRotList] = useState<{ id: string; label: string }[]>([]);
  const [current, setCurrent] = useState("unknown");
  const [prios, setPrios] = useState<Record<string, number>>({});
  const [cons, setCons] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    knowledgeRotations().then((k) => {
      if (!k) return;
      setRotList(k.rotations.map((r) => ({
        id: r.id,
        label: r.name[lang as "es" | "en"] ?? r.name.es ?? r.id,
      })));
    });
  }, [lang]);

  const body = useMemo<PlotBody | null>(() =>
    ring ? {
      polygon: { coordinates: [[
        ...ring.map(([la, lo]) => [lo, la] as [number, number]),
        [ring[0][1], ring[0][0]] as [number, number],
      ]] },
    } : null, [ring]);

  useEffect(() => {
    if (!open || !body) return;
    setBusy(true); setDiag(null); setRots(null); setExplain({});
    apiDiagnose(body).then((d) => {
      setDiag(d); setBusy(false);
      if (d) savePlot("lote", body);
    });
  }, [open, body]);

  const runRotations = async () => {
    if (!diag) return;
    setBusy(true);
    const cropIds = await knowledgeCrops()
      .then((k) => (k?.crops ?? []).map((c) => c.id))
      .catch(() => [] as string[]);
    const r = await apiRotations({
      diagnosis: diag,
      current: current === "unknown" ? null : { rotation_id: current },
      priorities: Object.fromEntries(
        PRIORITIES.map((p) => [p, prios[p] ?? 3])),
      constraints: {
        irrigation: Boolean(cons.irrigation),
        livestock: Boolean(cons.livestock),
        machinery: Boolean(cons.machinery),
        markets: cons.markets ? cropIds : [],
      },
    });
    setRots(r);
    if (r) {
      const e = await apiExplain(r); // explain takes the rotations response
      if (e) {
        setExplain(Object.fromEntries(
          e.strategies.map((s) => [s.id, s.text])));
      }
    }
    setBusy(false);
  };

  return (
    <BottomSheet open={open}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{t("field.cta")}</h3>
        <button onClick={onClose} aria-label="cerrar">✕</button>
      </div>
      {busy && <p aria-live="polite">{t("field.diagnosing")}</p>}
      {!diag && !busy && <p className="muted">{t("panel.noData")}</p>}

      {diag && (
        <>
          <div className="chip-row">
            {diag.cards.map((c) => (
              <Card key={c.id}>
                <strong>{c.id}</strong>
                <div className="big">
                  {c.value == null ? t("field.noData") : c.value}
                </div>
                <p className="muted">{c.text}</p>
                <p className="muted">{c.source}{c.resolution && ` · ${c.resolution}`}</p>
                <span className="badge">{t(`field.confidence.${c.confidence}`)}</span>
              </Card>
            ))}
          </div>
          <p className="muted">
            NDVI<Glossary term="NDVI" /> · evapotranspiración
            <Glossary term="evapotranspiración" /> · balance hídrico
            <Glossary term="balance hídrico" /> · anomalía
            <Glossary term="anomalía" /> · grados-día
            <Glossary term="grados-día" />
          </p>

          <Card title={t("field.calendar")}>
            <div style={{ overflowX: "auto" }}>
              <table className="cal" aria-label={t("field.calendar")}>
                <thead><tr><th></th>
                  {diag.calendar.months.map((m) => <th key={m} scope="col">{m}</th>)}
                </tr></thead>
                <tbody>
                  {diag.calendar.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.label ?? row.id}</th>
                      {row.levels.map((lv, i) => (
                        <td key={i} style={{
                          background: lv == null ? "transparent"
                            : `color-mix(in srgb, var(--covered) ${lv * 30}%, var(--panel))`,
                        }}>{levelText(lv)}</td>))}
                    </tr>))}
                </tbody>
              </table>
            </div>
          </Card>

          {diag.measures && diag.measures.length > 0 && (
            <Card title={t("measures.title")}>
              <ul>{diag.measures.map((m) => (
                <li key={m.id}><strong>{m.name}</strong> — {m.why}
                  <div className="muted">
                    {m.requires && Object.entries(m.requires)
                      .map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    {m.cost && ` · ${m.cost}`}
                    {m.source && ` · ${m.source}`}</div>
                </li>))}</ul>
            </Card>)}

          <Card title={t("field.form.priorities")}>
            <label>{t("field.form.current")}
              <select value={current}
                      onChange={(e) => setCurrent(e.target.value)}>
                <option value="unknown">{t("field.form.dontKnow")}</option>
                {rotList.map((r) =>
                  <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            {PRIORITIES.map((p) => (
              <label key={p} style={{ display: "block" }}>
                {t(`prio.${p}`)} — {prios[p] ?? 3}
                <input type="range" min={0} max={5} step={1}
                  value={prios[p] ?? 3}
                  aria-label={t(`prio.${p}`)}
                  onChange={(e) =>
                    setPrios({ ...prios, [p]: Number(e.target.value) })} />
              </label>))}
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>{t("field.form.constraints")}</legend>
              {CONSTRAINTS.map((c) => (
                <label key={c} style={{ display: "inline-flex",
                  gap: 6, marginRight: 12, alignItems: "center" }}>
                  <input type="checkbox"
                    checked={cons[c] ?? false}
                    onChange={(e) =>
                      setCons({ ...cons, [c]: e.target.checked })} />
                  {t(`field.form.${c}`)}
                </label>))}
            </fieldset>
            <button className="primary" onClick={runRotations} disabled={busy}>
              {t("field.form.run")}</button>
          </Card>
        </>
      )}

      {rots && (
        <>
          <div className="strategies">
            {rots.strategies.map((s) => (
              <div key={s.id}>
                <StrategyCard s={s} t={t} />
                {explain[s.id] &&
                  <p className="muted">{explain[s.id]}</p>}
              </div>))}
          </div>
          <p className="notice">{rots.disclaimer || t("rot.disclaimer")}</p>
        </>
      )}
      {!rots && diag && <p className="notice">{t("rot.disclaimer")}</p>}
    </BottomSheet>
  );
}
export type { LatLonRing, PlotBody };
