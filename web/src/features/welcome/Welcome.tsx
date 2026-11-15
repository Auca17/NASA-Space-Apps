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
        <ul className="welcome-alt">
          <li><button type="button" className="welcome-row"
                  onClick={onExplore}>
            <svg className="row-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21c-4 0-7-2.8-7-6.5C5 9 9.5 6 11 2c.6 2.4 2.6
                3.8 3.4 6.2.4-1 .6-2.1.4-3.2 2.6 1.7 4.2 4.6 4.2 8
                0 4.4-3 8-7 8Zm0-2.5c2.2 0 4-1.6 4-4 0-2.6-2.6-4.3-4-7
               -1.4 2.7-4 4.4-4 7 0 2.4 1.8 4 4 4Z"/></svg>
            <span className="row-text">
              <strong>{t("welcome.explore")}</strong>
              <small>{t("welcome.row.fire")}</small>
            </span>
            <span className="row-chev" aria-hidden="true">›</span>
          </button></li>
          <li><button type="button" className="welcome-row"
                  onClick={onLive}>
            <svg className="row-ico" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.4"/>
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9
                16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"
                fill="none" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span className="row-text">
              <strong>{t("welcome.live")}</strong>
              <small>{t("welcome.row.live")}</small>
            </span>
            <span className="row-chev" aria-hidden="true">›</span>
          </button></li>
          <li><button type="button" className="welcome-row"
                  onClick={geo}>
            <svg className="row-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21.5s7-6.1 7-11.5A7 7 0 0 0 5 10c0 5.4 7 11.5 7
                11.5Zm0-9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>
            <span className="row-text">
              <strong>{t("welcome.myZone")}</strong>
              <small>{t("welcome.row.geo")}</small>
            </span>
            <span className="row-chev" aria-hidden="true">›</span>
          </button></li>
        </ul>
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
