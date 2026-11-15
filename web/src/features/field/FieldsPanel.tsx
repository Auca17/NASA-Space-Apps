/** "Mis campos": saved fields (this browser only), their crop zones and
 * the choice of which area to analyse. */
import { useState } from "react";
import { useT } from "../../i18n";
import {
  fieldHa, zoneHa, analysisOptions, ZONE_COLORS, type Field, type AreaOption,
} from "../../domain/fields";
import type { Multi } from "../../domain/selection";
import { useAreaLabel } from "./areaLabel";
import { DetectedCrop } from "./DetectedCrop";
import { CurrentCropPanel } from "./CurrentCrop";
import { cropZonesFor, type NewZone } from "./autoCropSplit";
type SplitState = null | "loading" | "none" | "unavailable" | "done";

/** Text for the automatic split by crop; kept here, next to its only use. */
const SPLIT_TXT = {
  es: { go: "Volver a dividir por cultivo",
        loading: "Buscando los cultivos del campo en las imágenes de esta campaña (puede tardar un minuto)…",
        none: "El mapa del INTA no encontró cultivos en este campo. Podés dibujar las zonas a mano.",
        unavailable: "No pudimos consultar el mapa del INTA ahora. Probá de nuevo en un rato.",
        done: "Listo: el campo quedó dividido según lo que hay hoy en cada parte.",
        hint: "Crea una zona por cada cultivo que ve el satélite, sin cargar nada." },
  en: { go: "Split by crop again",
        loading: "Looking up the field's crops in this season's images (may take a minute)…",
        none: "INTA's map found no crops in this field. You can draw the zones by hand.",
        unavailable: "We couldn't reach INTA's map right now. Try again shortly.",
        done: "Done: the field is split by what is on each part today.",
        hint: "Creates one zone per crop seen from space, no typing needed." },
} as const;

const CROPS = ["maíz", "soja", "trigo", "girasol", "cebada", "sorgo",
               "pastura", "barbecho"];

function useHa() {
  const { lang } = useT();
  const f = new Intl.NumberFormat(lang === "en" ? "en" : "es",
    { maximumFractionDigits: 1 });
  return (v: number) => f.format(v);
}

/** Commits a text value on blur or Enter (rename without a save button). */
function InlineInput({ value, onCommit, label, list, placeholder }: {
  value: string; onCommit: (v: string) => void; label: string;
  list?: string; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  return (
    <input value={v} aria-label={label} list={list} placeholder={placeholder}
           onChange={(e) => setV(e.target.value)}
           onBlur={() => v !== value && onCommit(v)}
           onKeyDown={(e) => { if (e.key === "Enter")
             (e.target as HTMLInputElement).blur(); }} />);
}

export function FieldsList({ fields, onOpen, onZones, onAnalyze, onRename,
                             onDelete, onClose }: {
  fields: Field[];
  onOpen: (f: Field) => void;
  onZones: (f: Field) => void;
  /** opens the field to choose which area to analyse */
  onAnalyze: (f: Field) => void;
  onRename: (f: Field, name: string) => void;
  onDelete: (f: Field) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const ha = useHa();
  return (
    <div className="controls picker fields" role="region"
         aria-label={t("fields.title")}>
      <div className="picker-head">
        <strong>{t("fields.title")}</strong>
        <button onClick={onClose}>{t("fields.back")}</button>
      </div>
      {fields.length === 0 ? (
        <p className="muted">{t("fields.empty")}</p>
      ) : (
        <ul className="field-list">
          {fields.map((f) => (
            <li key={f.id}>
              <InlineInput value={f.name} label={t("fields.name")}
                           onCommit={(v) => onRename(f, v)} />
              <span className="muted">
                {t("fields.summary", { ha: ha(fieldHa(f)), z: f.zones.length,
                                       p: f.geom.length })}
              </span>
              <div className="row">
                <button onClick={() => onOpen(f)}>{t("fields.openMap")}</button>
                <button onClick={() => onZones(f)}>{t("zones.open")}</button>
                <button onClick={() => onAnalyze(f)}>{t("fields.analyze")}</button>
                <button className="link-btn danger" onClick={() => {
                  if (window.confirm(t("fields.deleteConfirm", { name: f.name })))
                    onDelete(f);
                }}>{t("fields.delete")}</button>
              </div>
            </li>))}
        </ul>)}
      <p className="muted">{t("fields.local")}</p>
    </div>);
}

export function FieldDetail({ field, pending, choice, onChoose, onAnalyze,
                              onDrawZone, onSaveZone, onDiscardZone,
                              onUpdateZone, onRemoveZone, onBack,
                              onAddZones, onSetCrop, onCropSplit }: {
  field: Field;
  /** zone drawn and clipped to the field, not saved yet */
  pending: { geom: Multi; ha: number } | null;
  /** id of the area chosen for analysis (highlighted on the map) */
  choice: string;
  onChoose: (id: string) => void;
  onAnalyze: (o: AreaOption) => void;
  onDrawZone: (m: "free" | "draw") => void;
  onSaveZone: (name: string, crop: string) => void;
  onDiscardZone: () => void;
  onUpdateZone: (id: string, patch: { name?: string; crop?: string }) => void;
  onRemoveZone: (id: string) => void;
  onBack: () => void;
  /** save the zones of the field split by crop */
  onAddZones?: (zones: NewZone[]) => void;
  /** the user typed the field's crop (map has none) */
  onSetCrop?: (crop: string) => void;
  /** remember the automatic split ran, so it is not repeated */
  onCropSplit?: (result: "done" | "none") => void;
}) {
  const { t, lang } = useT();
  const st = SPLIT_TXT[lang];
  const [split, setSplit] = useState<SplitState>(null);
  const splitByCrop = async () => {
    setSplit("loading");
    const r = await cropZonesFor(field.geom, lang);
    if (!r) return setSplit("unavailable");
    if (r.zones.length) onAddZones?.(r.zones);
    onCropSplit?.(r.result);
    setSplit(r.result);
  };
  // The first split runs on its own from the fields list (useAutoCropSplit);
  // here we only say what happened and offer to redo it.
  const auto = field.zones.length ? null
    : !field.cropSplit ? "loading" : field.cropSplit === "none" ? "none" : null;
  const status = split ?? auto;
  const ha = useHa();
  const areaLabel = useAreaLabel();
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const total = fieldHa(field);
  const zoned = field.zones.reduce((a, z) => a + zoneHa(z), 0);
  const options = analysisOptions(field);
  const chosen = options.find((o) => o.id === choice) ?? options[0];
  return (
    <div className="controls picker fields" role="region"
         aria-label={field.name}>
      <datalist id="crop-list">
        {CROPS.map((c) => <option key={c} value={c} />)}
      </datalist>
      <div className="picker-head">
        <strong>{field.name}</strong>
        <button onClick={onBack}>{t("fields.back")}</button>
      </div>
      <CurrentCropPanel geom={field.geom} />
      <DetectedCrop geom={field.geom} declared={field.crop ?? ""}
                    onDeclare={onSetCrop} />

      <fieldset className="analyze-set">
        <legend>{t("analyze.title")}</legend>
        {options.map((o) => (
          <label key={o.id} className="analyze-opt">
            <input type="radio" name="analyze-area" checked={o.id === chosen.id}
                   onChange={() => onChoose(o.id)} />
            <span>{areaLabel(o)}</span>
            <span className="muted">{ha(o.ha)} ha</span>
          </label>))}
        <button className="primary" onClick={() => onAnalyze(chosen)}>
          {t("analyze.go", { ha: ha(chosen.ha) })}</button>
      </fieldset>

      <h4 className="zones-h">{t("zones.open")}</h4>
      <p className="muted">
        {t("zones.summary", { ha: ha(total), z: ha(zoned),
                              free: ha(Math.max(0, total - zoned)) })}</p>
      {onAddZones && field.zones.length === 0 && split !== "loading" &&
        (field.cropSplit || split === "unavailable") && (

        <div className="crop-split">
          <button onClick={splitByCrop}>{st.go}</button>
          <span className="muted">{st.hint}</span>
        </div>)}
      {status && (
        <p role="status" className="muted">{st[status]}</p>)}
      {field.zones.length > 0 && (
        <ul className="zone-list">
          {field.zones.map((z, i) => (
            <li key={z.id}>
              <span className="zone-swatch" aria-hidden="true"
                    style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
              <InlineInput value={z.name} label={t("zones.name")}
                           placeholder={t("zones.defaultName", { n: i + 1 })}
                           onCommit={(v) => onUpdateZone(z.id, { name: v.trim() })} />
              <InlineInput value={z.crop} label={t("zones.crop")}
                           list="crop-list" placeholder={t("zones.cropPh")}
                           onCommit={(v) => onUpdateZone(z.id, { crop: v.trim() })} />
              <span className="muted">{ha(zoneHa(z))} ha</span>
              <button className="link-btn danger"
                      onClick={() => onRemoveZone(z.id)}>
                {t("zones.remove")}</button>
              <DetectedCrop geom={z.geom} />
            </li>))}
        </ul>)}
      {pending ? (
        <form className="zone-new" onSubmit={(e) => {
          e.preventDefault();
          onSaveZone(name, crop);
          setName(""); setCrop("");
        }}>
          <strong>{t("zones.preview", { ha: ha(pending.ha) })}</strong>
          <p className="muted">{t("zones.clipped")}</p>
          <div className="row">
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
                   placeholder={t("zones.namePhOpt")} aria-label={t("zones.name")} />
            <input value={crop} onChange={(e) => setCrop(e.target.value)}
                   list="crop-list" placeholder={t("zones.cropPh")}
                   aria-label={t("zones.crop")} />
          </div>
          <div className="row">
            <button type="submit" className="primary">{t("zones.save")}</button>
            <button type="button" onClick={onDiscardZone}>
              {t("zones.discard")}</button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button onClick={() => onDrawZone("free")}>{t("zones.drawFree")}</button>
          <button onClick={() => onDrawZone("draw")}>{t("zones.drawPoints")}</button>
        </div>)}
      <p className="muted">{t("zones.how")}</p>
    </div>);
}
