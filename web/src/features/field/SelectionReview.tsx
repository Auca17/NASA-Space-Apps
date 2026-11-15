/** Review step: the selected field is shown on the map; nothing is
 * analysed or saved until the user confirms it. Also hosts the
 * "Ajustar selección" step that proposes pieces cut by roads and
 * built-up land. */
import { useState } from "react";
import { useT } from "../../i18n";
import { multiHa, type Multi } from "../../domain/selection";
import type { SplitResult } from "../../domain/split";

export type LandCheck = "checking" | "urban" | "ok" | "unknown";

/** Area limits of the diagnosis API (ha). */
export const MIN_HA = 0.5, MAX_HA = 5_000;

/** Suggested pieces waiting for the user's choice. */
export type Adjust = {
  status: "loading" | "ready";
  result?: SplitResult;
  on: boolean[];
  /** i18n keys of what could not be verified */
  unverified: string[];
};

function useHa() {
  const { lang } = useT();
  const f = new Intl.NumberFormat(lang === "en" ? "en" : "es",
    { maximumFractionDigits: 1 });
  return (v: number) => f.format(v);
}

export function SelectionReview({ geom, approx, check, onEdit, onCancel,
                                  onConfirm, onAdjust, onSave, onParcels }: {
  /** pieces of the selection, each [outer, ...holes] */
  geom: Multi;
  approx: boolean;
  check: LandCheck;
  onEdit: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onAdjust: () => void;
  onSave: (name: string) => void;
  /** Optional: divide the confirmed field into crop parcels first. */
  onParcels?: () => void;
}) {
  const { t } = useT();
  const ha = useHa();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const total = multiHa(geom);
  const outOfRange = total < MIN_HA || total > MAX_HA;
  const blocked = check === "checking" || check === "urban" || outOfRange;
  return (
    <div className="controls picker review" role="region"
         aria-label={t("review.title")}>
      <strong>{t("review.title")}</strong>
      <p className="review-area">
        <span className="review-ha">{t("review.area", { ha: ha(total) })}</span>
        {approx && <span className="badge approx">{t("review.approx")}</span>}
        {geom.length > 1 && (
          <span className="badge">{t("review.pieces", { n: geom.length })}</span>)}
      </p>
      <p className="picker-how">
        {t(approx ? "review.howApprox" : "review.how")}</p>
      {geom.length > 1 && (
        <p className="muted">{t("review.multiNote")}</p>)}
      {outOfRange && (
        <p className="notice urban-warning" role="alert">
          {t(total > MAX_HA ? "review.tooBig" : "review.tooSmall",
             { max: ha(MAX_HA), min: ha(MIN_HA) })}</p>)}
      {check === "checking" && (
        <p className="muted" role="status">{t("review.checking")}</p>)}
      {check === "urban" && (
        <p className="notice urban-warning" role="alert">
          {t("review.urban")}</p>)}
      {check === "unknown" && (
        <p className="muted" role="status">{t("review.unknown")}</p>)}
      {naming ? (
        <form className="row save-row" onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) { onSave(name.trim()); setNaming(false); }
        }}>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
                 placeholder={t("fields.namePh")}
                 aria-label={t("fields.name")} />
          <button type="submit" className="primary" disabled={!name.trim()}>
            {t("fields.save")}</button>
          <button type="button" onClick={() => setNaming(false)}>
            {t("field.cancel")}</button>
        </form>
      ) : (
        <div className="row">
          <button className="primary" onClick={onConfirm} disabled={blocked}>
            {t("review.confirm")}</button>
          {onParcels && (
            <button onClick={onParcels} disabled={blocked}>
              {t("parcels.open")}</button>)}
          <button onClick={() => setNaming(true)} disabled={blocked}>
            {t("fields.saveAs")}</button>
          <button onClick={onAdjust}>{t("adjust.open")}</button>
          <button onClick={onEdit}>{t("review.edit")}</button>
          <button onClick={onCancel}>{t("field.cancel")}</button>
        </div>)}
    </div>);
}

export function AdjustPanel({ adjust, onToggle, onApply, onEditPiece,
                              onOriginal, onRedraw }: {
  adjust: Adjust;
  onToggle: (i: number) => void;
  onApply: () => void;
  onEditPiece: (i: number) => void;
  onOriginal: () => void;
  /** start a new drawing (offered when nothing usable is left) */
  onRedraw: () => void;
}) {
  const { t } = useT();
  const ha = useHa();
  const r = adjust.result;
  const chosen = adjust.on.filter(Boolean).length;
  return (
    <div className="controls picker review adjust" role="region"
         aria-label={t("adjust.title")}>
      <strong>{t("adjust.title")}</strong>
      {adjust.status === "loading" || !r ? (
        <p className="muted" role="status">{t("adjust.loading")}</p>
      ) : (
        <>
          {r.pieces.length === 0 ? (
            <p className="notice urban-warning" role="alert">
              {t("adjust.nothingLeft")}</p>
          ) : <p className="picker-how">{t("adjust.how")}</p>}
          <ul className="piece-list">
            {r.pieces.map((p, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={adjust.on[i]}
                         onChange={() => onToggle(i)} />
                  <span className="piece-swatch" aria-hidden="true" />
                  {t("adjust.piece", { i: i + 1, ha: ha(p.ha) })}
                </label>
                <button type="button" className="link-btn"
                        onClick={() => onEditPiece(i)}>
                  {t("adjust.editPiece")}</button>
              </li>))}
          </ul>
          <p className="excluded-line">
            <span className="excl-swatch" aria-hidden="true" />
            {t("adjust.excluded", { ha: ha(r.roadHa + r.urbanHa + r.smallHa) })}
            {r.roadHa > 0 && <> · {t("adjust.roads", { ha: ha(r.roadHa) })}</>}
            {r.urbanHa > 0 && <> · {t("adjust.urban", { ha: ha(r.urbanHa) })}</>}
            {r.smallHa > 0 && <> · {t("adjust.small", { ha: ha(r.smallHa) })}</>}
          </p>
          {adjust.unverified.length > 0 && (
            <div className="notice" role="status">
              <strong>{t("adjust.unverifiedTitle")}</strong>
              <ul>{adjust.unverified.map((k) => <li key={k}>{t(k)}</li>)}</ul>
            </div>)}
          <p className="muted">{t("adjust.suggested")}</p>
          <div className="row">
            {r.pieces.length === 0 ? (
              <button className="primary" onClick={onRedraw}>
                {t("adjust.redraw")}</button>
            ) : (
              <button className="primary" onClick={onApply} disabled={!chosen}>
                {t("adjust.apply", { n: chosen })}</button>)}
            <button onClick={onOriginal}>{t("adjust.original")}</button>
          </div>
        </>)}
    </div>);
}
