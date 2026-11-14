/** Historic playback: month slider + play over globe/{YYYY-MM}.json. */
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { globeMonth } from "../../api";
import { viridis, css } from "../../domain/colors";
import { Legend } from "../../components/ui";
import type { GlobeHandle } from "../globe/GlobeView";

const START = "2000-11";

function monthSeq(start: string, end: string): string[] {
  const out: string[] = [];
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function HistoricControls({ globe, onMonth }: {
  globe: GlobeHandle | null;
  onMonth?: (month: string) => void;
}) {
  const { t } = useT();
  const now = new Date().toISOString().slice(0, 7);
  const months = useRef(monthSeq(START, now));
  const [idx, setIdx] = useState(months.current.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [maxN, setMaxN] = useState(0);
  const cache = useRef(new Map<string, Map<string, number> | null>());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const show = async (i: number) => {
    if (!globe) return;
    const mo = months.current[i];
    onMonth?.(mo);
    let cells = cache.current.get(mo);
    if (cells === undefined) {
      const sh = await globeMonth(mo);
      cells = sh ? new Map(sh.cells.map(([h, n]) => [h, n])) : null;
      cache.current.set(mo, cells);
    }
    if (!cells) { globe.setCells(new Map(), null); setMaxN(0); return; }
    const max = Math.max(1, ...cells.values());
    setMaxN(max);
    globe.setCells(cells, [
      "interpolate", ["linear"],
      ["sqrt", ["/", ["get", "n"], max]],
      0, css(viridis(0.1)), 0.5, css(viridis(0.6)), 1, css(viridis(1)),
    ]);
  };

  useEffect(() => { show(idx); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, globe]);

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setIdx((i) => {
        if (i >= months.current.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(iv);
  }, [playing, speed]);

  // space toggles play (keyboard, PRD 12.3)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="controls">
      <div className="row">
        <button onClick={() => setPlaying(!playing)}
                aria-label={playing ? t("historic.pause") : t("historic.play")}
                aria-pressed={playing}>
          {playing ? "⏸" : "▶"}
        </button>
        <span aria-live="polite" role="status">
          {months.current[idx]}
        </span>
        {!reduce && (
          <label>{t("historic.speed")}
            <select value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}>
              {[2, 4, 8].map((s) =>
                <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>)}
      </div>
      <input type="range" min={0} max={months.current.length - 1}
             value={idx} aria-label={t("historic.month")}
             onChange={(e) => { setIdx(Number(e.target.value)); setPlaying(false); }}
             style={{ width: "100%" }} />
      {maxN > 0 && (
        <Legend from="0" to={String(maxN)}
          colors={[css(viridis(0.1)), css(viridis(0.55)), css(viridis(1))]} />
      )}
    </div>
  );
}
