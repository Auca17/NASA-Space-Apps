import { useState } from "react";
import { useT } from "../../i18n";
import { apiUrl } from "../../api/client";
import { WindLogo } from "../../components/WindLogo";

type Hit = { lat: number; lon: number; name: string };

/** First screen: the field analysis is the main path; fire and live
 * hotspots stay one tap away as secondary views. */
export function Welcome({ onAnalyze, onDemo, onLocate, onExplore, onLive }: {
  onAnalyze: () => void;
  onDemo: () => void;
  onLocate: (lat: number, lon: number) => void;
  onExplore: () => void;
  onLive: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const geo = () => {
    if (!("geolocation" in navigator)) { setDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => onLocate(p.coords.latitude, p.coords.longitude),
      () => setDenied(true),
      { timeout: 8000 });
  };

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      // same-origin proxy: public Nominatim sends no CORS header
      const r = await fetch(
        apiUrl(`/api/geocode?q=${encodeURIComponent(q)}`));
      const j = (await r.json()) as { hits: Hit[] };
      setHits(j.hits ?? []);
    } catch { setHits([]); }
    setBusy(false);
  };

  return (
    <div className="welcome">
      <div className="welcome-logo" aria-hidden="true"><WindLogo size={72} /></div>
      <h2>{t("welcome.title")}</h2>
      <p>{t("welcome.text")}</p>
      <div className="actions">
        <button className="primary big-cta" onClick={onAnalyze}>
          {t("welcome.analyze")}</button>
        <button onClick={onDemo}>{t("welcome.demo")}</button>
        <p className="muted demo-note">{t("welcome.demoNote")}</p>
      </div>

      <details className="welcome-more">
        <summary>{t("welcome.more")}</summary>
        <p className="muted">{t("welcome.fireText")}</p>
        <div className="row-actions">
          <button onClick={onExplore}>{t("welcome.explore")}</button>
          <button onClick={onLive}>{t("welcome.live")}</button>
        </div>
        <button onClick={geo}>{t("welcome.myZone")}</button>
        <p className="geo-note">{t("welcome.geoNote")}</p>
        {denied && <p className="muted">{t("welcome.noGps")}</p>}
        <form className="search"
              onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t("welcome.searchPlaceholder")}
                 aria-label={t("welcome.searchPlaceholder")} />
          <button type="submit" disabled={busy}>
            {busy ? t("welcome.searching") : "→"}
          </button>
        </form>
        <ul className="search-results">
          {hits.map((h) => (
            <li key={`${h.lat}${h.lon}${h.name}`}>
              <button type="button" onClick={() => onLocate(h.lat, h.lon)}>
                {h.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
