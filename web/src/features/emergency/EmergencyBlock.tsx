/** Emergency call block (task 26): real tel: links, a copyable "what
 * to say" message and the fixed satellite-detection notice. The app
 * never calls by itself and never sends the location anywhere. */
import { useState } from "react";
import { useT } from "../../i18n";
import { numbersFor } from "../../content/emergency";
import { emergencyMessage } from "../../domain/emergency";

export interface EmergencyBlockProps {
  /** ISO A2 of the point being looked at; null shows the generic text. */
  country: string | null;
  /** Visible map centre: the coordinates the message uses when the
   * user has not shared a location. */
  mapCenter: { lat: number; lon: number } | null;
  /** Optional leading sentence (e.g. "si ves fuego, llamá ya"). */
  lead?: string;
}

export function EmergencyBlock({ country, mapCenter, lead }: {
    country: string | null; mapCenter: { lat: number; lon: number } | null;
    lead?: string }) {
  const { t } = useT();
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const numbers = numbersFor(country);
  const at = userLoc ?? mapCenter;
  const message = at
    ? emergencyMessage({
        lat: at.lat, lon: at.lon,
        source: userLoc ? "user" : "map" }, t)
    : t("emerg.msg.intro");

  const copy = async () => {
    setCopied(false); setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) { setLocDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserLoc({ lat: p.coords.latitude,
                            lon: p.coords.longitude });
               setLocDenied(false); },
      () => setLocDenied(true),
      { timeout: 8000 });
  };

  return (
    <section className="emerg" aria-label={t("emerg.title")}>
      {lead && <p className="emerg-lead"><strong>{lead}</strong></p>}
      {numbers.length ? (
        <div className="emerg-calls">
          {numbers.map((n) => (
            <a key={n.number} className="emerg-call" href={`tel:${n.number}`}>
              {t("emerg.call", { svc: t(n.service), n: n.number })}
            </a>))}
          <p className="muted">
            {numbers.map((n) => `${t(n.service)} ${n.number}`).join(" · ")}
          </p>
        </div>
      ) : (
        <p className="emerg-generic">{t("emerg.unknownCountry")}</p>)}
      <div className="emerg-say">
        <button type="button" className="primary" onClick={copy}>
          {t("emerg.copy")}</button>
        {copied && <p className="muted" role="status">{t("emerg.copied")}</p>}
        {copyFailed && (
          <div role="status">
            <p className="muted">{t("emerg.copyFailed")}</p>
            <textarea readOnly className="emerg-msg" value={message}
                      rows={4}
                      onFocus={(e) => e.target.select()} />
          </div>)}
        <details className="emerg-preview">
          <summary>{t("emerg.preview")}</summary>
          <p className="muted">{message}</p>
        </details>
      </div>
      <p className="notice" role="note">
        {t("emerg.satNotice")}. {t("emerg.noticeCall")}
      </p>
      <p className="muted">
        {t("emerg.privacy")}{" "}
        {at && t(userLoc ? "emerg.locUserNote" : "emerg.locMapNote")}
      </p>
      {!userLoc && (
        <button type="button" onClick={locate}>{t("emerg.useMyLoc")}</button>)}
      {locDenied && <p className="muted" role="status">{t("emerg.locDenied")}</p>}
      <details className="emerg-src">
        <summary>{t("emerg.sources")}</summary>
        <ul className="muted">
          {numbers.map((n) => (
            <li key={n.number}>
              {t(n.service)} {n.number} —{" "}
              <a href={n.source} target="_blank" rel="noreferrer">
                {n.source.replace(/^https?:\/\//, "")}</a>
            </li>))}
          {!numbers.length && (
            <li><a href="https://digital-strategy.ec.europa.eu/es/policies/112"
                   target="_blank" rel="noreferrer">
              {t("emerg.euNote")}</a></li>)}
        </ul>
      </details>
    </section>
  );
}
