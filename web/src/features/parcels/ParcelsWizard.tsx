/** Parcels wizard: after the field boundary is confirmed, the user
 * divides it into crop parcels (draw each one inside the boundary —
 * clipped to it — or cut the field with a line), gives each a name and
 * a crop, then answers the short needs step. Zero parcels is allowed:
 * the whole field is analysed as a single parcel. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "../../i18n";
import { dataUrl, fetchJson } from "../../api/client";
import { clipZone } from "../../domain/split";
import {
  polyHa, type LatLon, type Multi, type Poly,
} from "../../domain/selection";
import { splitByLine, selfIntersects } from "../../domain/parcelsGeo";
import {
  cropColor, MAX_PARCELS, type Needs, type ParcelInput,
} from "../../domain/parcels";
import type { GlobeHandle, Shape } from "../globe/GlobeView";
import { DrawSession } from "../field/drawEdit";
import { DrawLayer } from "../field/DrawLayer";
import { FreehandLayer } from "../field/FreehandLayer";
import { NeedsForm } from "./NeedsForm";
import { CropIcon } from "./CropIcon";

type DrawTool = "points" | "free" | "split";
type Step = "parcels" | "needs";

/** Half-width (m) of the corridor a split line removes. */
const SPLIT_HALF_WIDTH = 10;

type CropOpt = { id: string; label: string };

export function ParcelsWizard({ geom, globe, onDone, onCancel }: {
  geom: Multi;
  globe: GlobeHandle;
  /** parcels + needs (null when skipped) — the panel then runs. */
  onDone: (parcels: ParcelInput[], needs: Needs | null) => void;
  onCancel: () => void;
}) {
  const { t, lang } = useT();
  const [step, setStep] = useState<Step>("parcels");
  const [parcels, setParcels] = useState<ParcelInput[]>([]);
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [pending, setPending] = useState<Poly[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [crops, setCrops] = useState<CropOpt[] | null>(null);
  const nextId = useRef(1);

  // the point-by-point tool keeps its own session (open path, then a
  // closed editable outline before finishing)
  const session = useMemo<DrawSession | null>(
    () => (tool === "points" || tool === "split" ? new DrawSession() : null),
    [tool]);
  const draw = useSyncExternalStore(
    (fn) => session?.subscribe(fn) ?? (() => {}),
    () => session?.state ?? null);

  useEffect(() => {
    let live = true;
    fetchJson<{ id: string; name?: { es?: string; en?: string } }[]>(
      dataUrl("knowledge/crops.json")).then((list) => {
      if (!live) return;
      const known = (list ?? []).map((c) =>
        ({ id: c.id, label: c.name?.[lang === "en" ? "en" : "es"]
                ?? c.name?.es ?? c.id }));
      setCrops([...known,
        { id: "otro", label: t("parcels.cropOther") },
        { id: "sin_cultivo", label: t("parcels.cropNone") }]);
    });
    return () => { live = false; };
  }, [lang, t]);

  // preview: boundary + declared parcels + pieces waiting for a name
  useEffect(() => {
    const sh: Shape[] = geom.map((p) => ({ geom: p, kind: "field" }));
    for (const p of parcels) {
      sh.push({ geom: p.geom, kind: "zone", color: cropColor(p.crop) });
    }
    for (const p of pending ?? []) sh.push({ geom: p, kind: "piece-on" });
    globe.setShapes(sh);
  }, [geom, parcels, pending, globe]);

  const startTool = (m: DrawTool) => {
    setNotice(null); setPending(null); setEditing(null); setTool(m);
    globe.setDraft(null);
  };

  const stopTool = () => { setTool(null); globe.setDraft(null); };

  /** Clip a finished outline to the boundary minus existing parcels. */
  const clipAndHold = (m: Multi) => {
    const clipped = clipZone(m, geom, parcels.map((p) => [p.geom]));
    if (!clipped) { setNotice("parcels.outside"); return; }
    setPending(clipped.geom);
    stopTool();
  };

  const finishPoints = () => {
    const ring = draw?.ring ?? [];
    if (ring.length < 3) return;
    if (selfIntersects(ring)) { setNotice("field.draw.crossed"); return; }
    clipAndHold([[ring]]);
  };

  const finishSplit = () => {
    const line = draw?.ring ?? [];
    if (line.length < 2) return;
    const remaining = parcels.length
      ? clipZone(geom, geom, parcels.map((p) => [p.geom]))?.geom ?? null
      : geom;
    if (!remaining) { setNotice("parcels.splitNone"); return; }
    const pieces = splitByLine(remaining, line, SPLIT_HALF_WIDTH);
    if (!pieces || pieces.length < 2) {
      setNotice("parcels.splitNone"); return;
    }
    setPending(pieces);
    stopTool();
  };

  const atCap = parcels.length >= MAX_PARCELS;
  const fmt = useMemo(() =>
    new Intl.NumberFormat(lang === "en" ? "en" : "es",
      { maximumFractionDigits: 1 }), [lang]);
  const cropLabel = (id: string) =>
    crops?.find((c) => c.id === id)?.label ?? id;

  const saveForm = (name: string, crop: string) => {
    if (editing) {
      setParcels((ps) => ps.map((p) =>
        p.id === editing ? { ...p, name, crop } : p));
      setEditing(null);
      return;
    }
    if (!pending) return;
    setParcels((ps) => {
      const room = Math.max(0, MAX_PARCELS - ps.length);
      const pieces = pending.slice(0, room);
      const add = pieces.map((geom, i) => ({
        id: `p${nextId.current + i}`,
        name: pieces.length > 1 ? `${name} ${i + 1}` : name,
        crop, geom }));
      nextId.current += pieces.length;
      return [...ps, ...add];
    });
    if (pending.length > MAX_PARCELS - parcels.length) {
      setNotice("parcels.limit");
    }
    setPending(null);
  };

  /* ------------------------------------------------ draw toolbar ---- */
  if (tool === "points" || tool === "split") {
    const ring = draw?.ring ?? [];
    const n = ring.length;
    const need = tool === "split" ? 2 : 3;
    return (
      <>
      {/* the draw layer must sit directly on .map-wrap to cover the
          whole map — inside the panel it would only cover the picker */}
      {tool === "points" ? (
        <DrawLayer unproject={(x, y) => globe.unproject(x, y)}
                   session={session ?? undefined}
                   onSync={(r, c) => globe.setDraft(r, c)} />
      ) : (
        <DrawLayer unproject={(x, y) => globe.unproject(x, y)}
                   session={session ?? undefined}
                   onSync={(r) => globe.setDraft(r, false)} />
      )}
      <div className="controls picker parcels-wizard" role="region"
           aria-label={t("parcels.title")}>
        <strong className="picker-mode">
          {t(tool === "split" ? "parcels.split.how" : "parcels.draw.how")}
        </strong>
        <p aria-live="polite" className="picker-status">
          <span className="picker-count">
            {t("field.drawing.count", { n })}</span>{" "}
          {n >= need ? t("field.drawing.ready")
            : t("field.drawing.missing", { k: need - n })}
        </p>
        {(notice || draw?.notice) && (
          <p className="notice" role="status">{t(notice ?? draw!.notice!)}</p>)}
        <div className="row">
          <button className="primary" disabled={n < need}
                  onClick={tool === "split" ? finishSplit : finishPoints}>
            {t("field.finish")}</button>
          <button onClick={() => session?.undo()} disabled={n === 0}>
            {t("field.drawing.undo")}</button>
          {draw?.closed && draw.selected != null && (
            <button onClick={() => session?.removeSelected()}>
              {t("field.draw.removeVertex")}</button>)}
          <button onClick={stopTool}>{t("field.cancel")}</button>
        </div>
      </div>
      </>);
  }

  if (tool === "free") {
    return (
      <>
      <FreehandLayer unproject={(x, y) => globe.unproject(x, y)}
        onStroke={(pts) => globe.setDraft(pts, false)}
        onDone={(r) => {
          if (r) clipAndHold([[r]]);
          else { setNotice("parcels.outside"); globe.setDraft(null); }
        }} />
      <div className="controls picker parcels-wizard" role="region"
           aria-label={t("parcels.title")}>
        <strong className="picker-mode">{t("parcels.free.how")}</strong>
        {notice && <p className="notice" role="status">{t(notice)}</p>}
        <div className="row">
          <button onClick={stopTool}>{t("field.cancel")}</button>
        </div>
      </div>
      </>);
  }

  /* ------------------------------------------------ needs step ------ */
  if (step === "needs") {
    return (
      <div className="controls picker parcels-wizard" role="region"
           aria-label={t("parcels.needs.title")}>
        <strong className="picker-mode">{t("parcels.needs.title")}</strong>
        <p className="picker-how">{t("parcels.needs.how")}</p>
        <NeedsForm
          onDone={(n) => onDone(parcels, n)}
          onSkip={() => onDone(parcels, null)} />
        <div className="row">
          <button onClick={() => setStep("parcels")}>
            {t("parcels.back")}</button>
        </div>
      </div>);
  }

  /* ------------------------------------------------ list step ------- */
  return (
    <div className="controls picker parcels-wizard" role="region"
         aria-label={t("parcels.title")}>
      <strong className="picker-mode">{t("parcels.title")}</strong>
      <p className="picker-how">
        {parcels.length
          ? t("parcels.count", { n: parcels.length, max: MAX_PARCELS })
          : t("parcels.how")}
      </p>
      {atCap && <p className="notice" role="status">{t("parcels.limit")}</p>}

      {(pending || editing) && (
        <ParcelForm
          t={t} crops={crops}
          initial={editing
            ? parcels.find((p) => p.id === editing) ?? null : null}
          defaultName={t("parcels.defaultName",
                         { n: parcels.length + 1 })}
          onSave={saveForm}
          onCancel={() => { setPending(null); setEditing(null); }} />)}

      {!pending && !editing && (
        <>
          <ul className="parcel-list">
            {parcels.map((p) => (
              <li key={p.id} className="parcel-row">
                <span className="parcel-swatch"
                      style={{ background: cropColor(p.crop) }} />
                <CropIcon crop={p.crop} />
                <span className="parcel-name">{p.name}</span>
                <span className="muted">{cropLabel(p.crop)}</span>
                <span className="parcel-ha">{fmt.format(polyHa(p.geom))} ha</span>
                <button type="button"
                        aria-label={t("parcels.edit", { name: p.name })}
                        onClick={() => setEditing(p.id)}>
                  {t("parcels.editBtn")}</button>
                <button type="button"
                        aria-label={t("parcels.remove", { name: p.name })}
                        onClick={() =>
                          setParcels((ps) => ps.filter((x) => x.id !== p.id))}>
                  ✕</button>
              </li>))}
          </ul>
          {parcels.length === 0 && (
            <p className="muted">{t("parcels.wholeHint")}</p>)}
          <div className="row parcel-tools">
            <button onClick={() => startTool("points")} disabled={atCap}>
              {t("parcels.addParcel")}</button>
            <button onClick={() => startTool("free")} disabled={atCap}>
              {t("parcels.drawFree")}</button>
            <button onClick={() => startTool("split")} disabled={atCap}>
              {t("parcels.splitLine")}</button>
          </div>
          {parcels.length > 0 && (
            <ul className="parcel-legend" aria-label={t("parcels.legend")}>
              {[...new Set(parcels.map((p) => p.crop))].map((c) => (
                <li key={c}>
                  <span className="parcel-swatch"
                        style={{ background: cropColor(c) }} />
                  <CropIcon crop={c} />
                  <span>{cropLabel(c)}</span>
                </li>))}
            </ul>)}
        </>
      )}

      {notice && !(tool || pending) && (
        <p className="notice" role="status">{t(notice)}</p>)}

      <div className="row">
        <button className="primary" disabled={!!pending || !!editing}
                onClick={() => setStep("needs")}>
          {t("parcels.continue")}</button>
        <button onClick={onCancel}>{t("field.cancel")}</button>
      </div>
    </div>);
}

/** Name + crop form: used right after drawing (one shared form even
 * when a split produced several pieces — each becomes a parcel with
 * the same crop and a numbered name) and for editing a parcel. */
function ParcelForm({ t, crops, initial, defaultName, onSave, onCancel }: {
    t: (k: string, v?: Record<string, string | number>) => string;
    crops: CropOpt[] | null;
    initial: ParcelInput | null;
    defaultName: string;
    onSave: (name: string, crop: string) => void;
    onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? defaultName);
  const [crop, setCrop] = useState(initial?.crop ?? "otro");
  return (
    <form className="parcel-form" onSubmit={(e) => {
      e.preventDefault();
      if (name.trim()) onSave(name.trim(), crop);
    }}>
      <label>{t("parcels.name")}
        <input value={name} autoFocus
               onChange={(e) => setName(e.target.value)} />
      </label>
      <label>{t("parcels.crop")}
        <span className="parcel-crop-row">
          <span className="parcel-swatch"
                style={{ background: cropColor(crop) }} />
          <CropIcon crop={crop} />
          <select value={crop}
                  onChange={(e) => setCrop(e.target.value)}>
            {(crops ?? [{ id: "otro", label: t("parcels.cropOther") }])
              .map((c) =>
                <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </span>
      </label>
      <div className="row">
        <button type="submit" className="primary">{t("parcels.save")}</button>
        <button type="button" onClick={onCancel}>{t("field.cancel")}</button>
      </div>
    </form>);
}

export type { LatLon };
