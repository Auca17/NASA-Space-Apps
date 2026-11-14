import { useState, type ReactNode } from "react";
import { useT } from "../i18n";

export function Card({ title, children, className = "" }:
    { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

/** Bottom sheet on mobile, side panel on desktop (CSS does the split). */
export function BottomSheet({ children, open }: {
    children: ReactNode; open: boolean }) {
  const { t } = useT();
  if (!open) return null;
  return (
    <aside className="panel" aria-label={t("ui.panel")}>
      <span className="grab" aria-hidden="true" />
      <div className="panel-inner">{children}</div>
    </aside>
  );
}

export function Legend({ from, to, mid, colors }: {
    from: string; to: string; mid?: string; colors: string[] }) {
  return (
    <div className="legend" role="img"
         aria-label={`${from} a ${to}`}>
      <span>{from}</span>
      <span className="bar" style={{
        background: `linear-gradient(90deg, ${colors.join(",")})` }} />
      {mid && <span>{mid}</span>}
      <span>{to}</span>
    </div>
  );
}

export function Tooltip({ label, text }:
    { label?: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="glossary-btn"
              aria-label={label ?? "?"} aria-expanded={open}
              onClick={() => setOpen(!open)}>?</button>
      {open && <span className="tooltip-pop" role="tooltip">{text}</span>}
    </span>
  );
}
