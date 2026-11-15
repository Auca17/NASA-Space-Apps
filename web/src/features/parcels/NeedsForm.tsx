/** Needs step: a short, skippable form before the analysis. Water
 * access, known distance to emergency services, concern chips and a
 * free note (300 chars). Everything optional — "Saltear" sends
 * `unknown` with no concerns. */
import { useState } from "react";
import { useT } from "../../i18n";
import {
  CONCERNS, NOTE_MAX, type Concern, type Needs, type WaterAccess,
} from "../../domain/parcels";

const WATER_OPTIONS: WaterAccess[] =
  ["none", "well", "channel", "irrigation", "unknown"];

export function NeedsForm({ onDone, onSkip, compact = false }: {
  /** Answers confirmed (or partially filled and accepted). */
  onDone: (n: Needs) => void;
  /** Skipped entirely: needs = null (unknown). */
  onSkip: () => void;
  /** Inside the panel (smaller) vs standalone wizard step. */
  compact?: boolean;
}) {
  const { t } = useT();
  const [water, setWater] = useState<WaterAccess>("unknown");
  const [dist, setDist] = useState("");
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [note, setNote] = useState("");

  const distKm = dist.trim() === "" ? undefined : Number(dist.replace(",", "."));
  const distBad = distKm != null &&
    (!Number.isFinite(distKm) || distKm < 0 || distKm > 500);

  const toggle = (c: Concern) =>
    setConcerns((s) => s.includes(c)
      ? s.filter((x) => x !== c) : [...s, c]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onDone({
      water_access: water,
      ...(distKm != null && !distBad
          ? { emergency_distance_km: distKm } : {}),
      concerns,
      ...(note.trim() ? { notes: note.trim().slice(0, NOTE_MAX) } : {}),
    });
  };

  return (
    <form className={`needs-form${compact ? " compact" : ""}`}
          onSubmit={submit}>
      <fieldset className="needs-set">
        <legend>{t("parcels.needs.water")}</legend>
        <div className="chips" role="group"
             aria-label={t("parcels.needs.water")}>
          {WATER_OPTIONS.map((w) => (
            <button key={w} type="button" className="chip"
                    aria-pressed={water === w}
                    onClick={() => setWater(w)}>
              {t(`parcels.needs.water.${w}`)}
            </button>))}
        </div>
      </fieldset>

      <label className="needs-dist">
        {t("parcels.needs.emergencyDist")}
        <input inputMode="decimal" value={dist}
               placeholder={t("parcels.needs.emergencyDistPh")}
               aria-label={t("parcels.needs.emergencyDist")}
               aria-invalid={distBad || undefined}
               onChange={(e) => setDist(e.target.value)} />
      </label>
      {distBad && (
        <p className="notice" role="alert">{t("parcels.needs.distBad")}</p>)}
      <p className="muted needs-dist-hint">
        {t("parcels.needs.emergencyDistHint")}</p>

      <fieldset className="needs-set">
        <legend>{t("parcels.needs.concerns")}</legend>
        <div className="chips" role="group"
             aria-label={t("parcels.needs.concerns")}>
          {CONCERNS.map((c) => (
            <button key={c} type="button" className="chip"
                    aria-pressed={concerns.includes(c)}
                    onClick={() => toggle(c)}>
              {t(`parcels.needs.concern.${c}`)}
            </button>))}
        </div>
      </fieldset>

      <label className="needs-note">
        {t("parcels.needs.note")}
        <textarea value={note} maxLength={NOTE_MAX} rows={2}
                  placeholder={t("parcels.needs.notePh")}
                  onChange={(e) => setNote(e.target.value)} />
        <span className="needs-note-count" aria-live="polite">
          {note.length}/{NOTE_MAX}
        </span>
      </label>

      <div className="row">
        <button type="submit" className="primary" disabled={distBad}>
          {t("parcels.needs.continue")}
        </button>
        <button type="button" onClick={onSkip}>
          {t("parcels.needs.skip")}
        </button>
      </div>
    </form>);
}
