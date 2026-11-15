/** One saved field: its overall outline, the confirmed plots and the
 * plot detection proposal. Plots are farm boundaries; dry or wet zones
 * are a different layer shown when a plot is analyzed. */
import { useState } from "react";
import { useT } from "../../i18n";
import { fieldHa, zoneHa, type Field, type Zone } from "../../domain/fields";
import { multiHa, type Multi } from "../../domain/selection";
import type { Detection } from "../../domain/split";
import { DetectedCrop } from "./DetectedCrop";
import { CurrentCropPanel } from "./CurrentCrop";

export type Proposal =
  | { status: "loading" }
  | { status: "ready"; detection: Detection; keep: boolean[];
      names: string[]; notes: string[] };

function InlineInput({ value, onCommit, label, placeholder }: {
  value: string; onCommit: (v: string) => void; label: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  return (
    <input value={v} aria-label={label} placeholder={placeholder}
           onChange={(e) => setV(e.target.value)}
           onClick={(e) => e.stopPropagation()}
           onBlur={() => v !== value && onCommit(v)}
           onKeyDown={(e) => { if (e.key === "Enter")
             (e.target as HTMLInputElement).blur(); }} />);
}

export function ParcelPanel(p: {
  field: Field;
  selected: string | null;
  onSelect: (id: string | null) => void;
  proposal: Proposal | null;
  onDetect: () => void;
  onProposalToggle: (i: number) => void;
  onProposalName: (i: number, name: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onRename: (z: Zone, name: string) => void;
  onCrop: (z: Zone, crop: string) => void;
  onDiscard: (z: Zone) => void;
  onFix: (z: Zone) => void;
  onAnalyze: (z: Zone) => void;
  onSummary: () => void;
  pending: { geom: Multi; ha: number } | null;
  onDrawParcel: (m: "free" | "draw") => void;
  onSavePending: (name: string) => void;
  onDiscardPending: () => void;
  /** crop the producer typed for the whole field */
  onSetFieldCrop?: (crop: string) => void;
  /** split the field by INTA's crop map; resolves with what happened */
  onSplitByCrop?: () => Promise<"done" | "none" | "unavailable">;
  onBack: () => void;
}) {
  const { t, lang } = useT();
  const fmt = new Intl.NumberFormat(lang === "en" ? "en" : "es",
    { maximumFractionDigits: 1 });
  const ha = (v: number) => fmt.format(v);
  const [newName, setNewName] = useState("");
  const [split, setSplit] = useState<null | "loading" | "done" | "none" | "unavailable">(null);
  const f = p.field;
  const reviewHa = multiHa(f.review ?? []);
  const pr = p.proposal;

  return (
    <div className="controls picker fields parcels" role="region"
         aria-label={f.name}>
      <div className="picker-head">
        <strong>{f.name}</strong>
        <button onClick={p.onBack}>{t("fields.back")}</button>
      </div>
      <p className="muted">
        {t("parcel.fieldLine", { ha: ha(fieldHa(f)), n: f.zones.length })}</p>
      <CurrentCropPanel geom={f.geom} />
      <DetectedCrop geom={f.geom} declared={f.crop ?? ""}
                    onDeclare={p.onSetFieldCrop} />

      {pr?.status === "loading" && (
        <p role="status" className="muted">{t("parcel.detecting")}</p>)}

      {pr?.status === "ready" && (
        <section className="proposal" aria-label={t("parcel.detect")}>
          <strong>{t("parcel.proposal", { n: pr.detection.parcels.length,
                                          ha: ha(pr.detection.parcelHa) })}</strong>
          <p className="muted">{t("parcel.proposalHow")}</p>
          <ul className="parcel-list">
            {pr.detection.parcels.map((d, i) => (
              <li key={i} className={p.selected === `p${i}` ? "sel" : ""}
                  onClick={() => p.onSelect(`p${i}`)}>
                <input type="checkbox" checked={pr.keep[i]}
                       aria-label={pr.names[i]}
                       onClick={(e) => e.stopPropagation()}
                       onChange={() => p.onProposalToggle(i)} />
                <InlineInput value={pr.names[i]} label={t("parcel.name")}
                             onCommit={(v) => p.onProposalName(i, v)} />
                <span className="muted">{ha(d.ha)} ha</span>
              </li>))}
          </ul>
          {pr.detection.reviewHa >= 0.5 && (
            <p className="review-line">
              <span className="review-swatch" aria-hidden="true" />
              {t("parcel.reviewLine", { ha: ha(pr.detection.reviewHa) })}</p>)}
          {pr.detection.excludedHa >= 0.5 && (
            <p className="muted">{t("parcel.excludedLine",
              { ha: ha(pr.detection.excludedHa) })}</p>)}
          {pr.notes.length > 0 && (
            <div className="notice" role="status">
              <ul>{pr.notes.map((k) => <li key={k}>{t(k)}</li>)}</ul>
            </div>)}
          <div className="row">
            <button className="primary" onClick={p.onAccept}
                    disabled={!pr.keep.some(Boolean)}>
              {t("parcel.accept", { n: pr.keep.filter(Boolean).length })}</button>
            <button onClick={p.onReject}>{t("parcel.reject")}</button>
          </div>
        </section>)}

      {!pr && (
        <>
          {f.zones.length === 0 ? (
            <p className="muted">{t("parcel.none")}</p>
          ) : (
            <ul className="parcel-list">
              {f.zones.map((z, i) => (
                <li key={z.id} className={p.selected === z.id ? "sel" : ""}
                    onClick={() => p.onSelect(p.selected === z.id ? null : z.id)}>
                  <div className="parcel-main">
                    <InlineInput value={z.name} label={t("parcel.name")}
                                 placeholder={t("parcel.defaultName", { n: i + 1 })}
                                 onCommit={(v) => p.onRename(z, v)} />
                    <span className="muted">{ha(zoneHa(z))} ha ·{" "}
                      {t("parcel.src." + (z.source ?? "manual"))}</span>
                  </div>
                  {p.selected === z.id ? (
                    // crop of the selected plot: now (Sentinel-2) and last
                    // campaign (INTA)
                    <div onClick={(e) => e.stopPropagation()}>
                      <CurrentCropPanel geom={z.geom} />
                      <DetectedCrop geom={z.geom} declared={z.crop}
                                    onDeclare={(c) => p.onCrop(z, c)} />
                    </div>
                  ) : (
                    <div className="muted parcel-crop">
                      {z.source === "crop" && z.crop
                        ? t("parcel.cropAuto", { c: z.crop })
                        : z.crop ? t("parcel.cropDeclared", { c: z.crop })
                          : t("parcel.cropTap")}</div>)}
                  {p.selected === z.id && (
                    <div className="row" onClick={(e) => e.stopPropagation()}>
                      <button className="primary" onClick={() => p.onAnalyze(z)}>
                        {t("parcel.analyze")}</button>
                      <button onClick={() => p.onFix(z)}>{t("parcel.fix")}</button>
                      <button className="link-btn danger"
                              onClick={() => p.onDiscard(z)}>
                        {t("parcel.discard")}</button>
                    </div>)}
                </li>))}
            </ul>)}
          {reviewHa >= 0.5 && (
            <p className="review-line">
              <span className="review-swatch" aria-hidden="true" />
              {t("parcel.reviewLine", { ha: ha(reviewHa) })}</p>)}

          {p.pending ? (
            <form className="zone-new" onSubmit={(e) => {
              e.preventDefault(); p.onSavePending(newName); setNewName("");
            }}>
              <strong>{t("zones.preview", { ha: ha(p.pending.ha) })}</strong>
              <p className="muted">{t("zones.clipped")}</p>
              <input value={newName} autoFocus aria-label={t("parcel.saveName")}
                     placeholder={t("parcel.defaultName", { n: f.zones.length + 1 })}
                     onChange={(e) => setNewName(e.target.value)} />
              <div className="row">
                <button type="submit" className="primary">{t("zones.save")}</button>
                <button type="button" onClick={p.onDiscardPending}>
                  {t("zones.discard")}</button>
              </div>
            </form>
          ) : (
            <div className="row">
              <button className="primary" onClick={p.onDetect}>
                {t(f.detection ? "parcel.redetect" : "parcel.detect")}</button>
              <button onClick={p.onSummary}>{t("parcel.summary")}</button>
              <button onClick={() => p.onDrawParcel("free")}>{t("parcel.drawFree")}</button>
              <button onClick={() => p.onDrawParcel("draw")}>{t("parcel.drawPoints")}</button>
              {p.onSplitByCrop && (
                <button disabled={split === "loading"} onClick={async () => {
                  setSplit("loading");
                  setSplit(await p.onSplitByCrop!());
                }}>{t("parcel.splitByCrop")}</button>)}
            </div>)}
          {split && <p role="status" className="muted">{t("parcel.split." + split)}</p>}
          <p className="muted">{t("parcel.layers")}</p>
        </>)}
    </div>);
}
