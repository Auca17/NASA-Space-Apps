/** "Avisos de fenómenos naturales": the farmer leaves an e-mail
 * (remembered in a cookie on this browser) and asks for a test alert.
 * The backend computes the level of every phenomenon from the parcels
 * analysis — fire, drought, frost, heat, snow, hail, El Niño / La Niña,
 * flood — and sends it through n8n or SMTP, or returns a preview when
 * no mail service is configured. */
import { useState } from "react";
import { useT } from "../../i18n";
import { apiUrl } from "../../api/client";
import {
  forgetEmail, looksLikeEmail, readEmail, saveEmail,
} from "../../domain/contactCookie";

type AlertParcel = { name: string; indicators: unknown; alerts: unknown };
type Answer =
  | { kind: "sent"; to: string }
  | { kind: "preview"; subject: string; text: string }
  | { kind: "error"; key: string };

export function AlertSignup({ parcels, fieldName }: {
  parcels: AlertParcel[]; fieldName?: string;
}) {
  const { t } = useT();
  const [email, setEmail] = useState(readEmail);
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState(() => readEmail() !== "");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const valid = looksLikeEmail(email);

  const send = async () => {
    if (!valid || busy) return;
    const to = email.trim();
    if (remember) { saveEmail(to); setSaved(true); }
    setBusy(true); setAnswer(null);
    try {
      const r = await fetch(apiUrl("/api/alerts/test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, field_name: fieldName,
                               parcels, app_url: location.href }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.sent) setAnswer({ kind: "sent", to: j.to });
      else if (r.ok && j.preview) setAnswer({ kind: "preview", ...j.preview });
      else setAnswer({ kind: "error", key: r.status === 429 ? "alerts.wait"
        : r.status === 400 ? "alerts.invalid" : "alerts.failed" });
    } catch {
      setAnswer({ kind: "error", key: "alerts.failed" });
    }
    setBusy(false);
  };

  return (
    <section className="card alert-signup" aria-labelledby="alerts-h">
      <h4 id="alerts-h" style={{ marginTop: 0 }}>{t("alerts.title")}</h4>
      <p className="muted">{t("alerts.intro")}</p>
      <form onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="alert-email">
          {t("alerts.email")}
          <input type="email" autoComplete="email" inputMode="email"
                 value={email} placeholder="nombre@correo.com"
                 onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="alert-remember">
          <input type="checkbox" checked={remember}
                 onChange={(e) => setRemember(e.target.checked)} />
          {t("alerts.remember")}
        </label>
        <button type="submit" className="primary" disabled={!valid || busy}>
          {busy ? t("alerts.sending") : t("alerts.send")}
        </button>
        {saved && (
          <button type="button" onClick={() => {
            forgetEmail(); setSaved(false); setEmail("");
          }}>{t("alerts.forget")}</button>)}
      </form>
      <div role="status" aria-live="polite">
        {answer?.kind === "sent" && <p>{t("alerts.sent", { to: answer.to })}</p>}
        {answer?.kind === "error" && <p>{t(answer.key)}</p>}
        {answer?.kind === "preview" && (
          <div className="alert-preview">
            <p>{t("alerts.preview")}</p>
            <p><strong>{answer.subject}</strong></p>
            <pre>{answer.text}</pre>
          </div>)}
      </div>
      <p className="muted alert-note">{t("alerts.privacy")}</p>
    </section>
  );
}
