/** "Datos y métodos" drawer (task 17B): datasets used, pending, and
 *  limitations. Keyboard operable, Escape closes. */
import { useEffect, useRef } from "react";
import { useT } from "../../i18n";
import { DATASETS_USED, DATASETS_PENDING, LIMITATIONS }
  from "../../content/datasets";

export function MethodsDrawer({ open, onClose }: {
    open: boolean; onClose: () => void }) {
  const { t, lang } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const L = (v: { es: string; en: string }) => lang === "en" ? v.en : v.es;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="meth-overlay" role="dialog" aria-modal="true"
         aria-label={t("meth.title")} ref={ref}>
      <div className="meth-panel">
        <div className="meth-head">
          <h2>{t("meth.title")}</h2>
          <button onClick={onClose} aria-label={t("ui.close")}>✕</button>
        </div>

        <h3>{t("meth.used")}</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="meth-table">
            <thead><tr>
              <th scope="col">{t("meth.ds.name")}</th>
              <th scope="col">{t("meth.ds.gives")}</th>
              <th scope="col">{t("meth.ds.res")}</th>
              <th scope="col">{t("meth.ds.period")}</th>
              <th scope="col">{t("meth.ds.where")}</th>
            </tr></thead>
            <tbody>
              {DATASETS_USED.map((d) => (
                <tr key={d.name}>
                  <th scope="row">{d.name}</th>
                  <td>{L(d.gives)}</td>
                  <td>{d.resolution}</td>
                  <td>{d.period}</td>
                  <td>{L(d.where)}</td>
                </tr>))}
            </tbody>
          </table>
        </div>

        <h3>{t("meth.notUsed")}</h3>
        <ul className="meth-list">
          {DATASETS_PENDING.map((d) => (
            <li key={d.name}><strong>{d.name}</strong> — {L(d.why)}</li>))}
        </ul>

        <h3>{t("meth.limits")}</h3>
        <ul className="meth-list">
          {LIMITATIONS.map((l, i) => <li key={i}>{L(l)}</li>)}
        </ul>
      </div>
    </div>
  );
}
