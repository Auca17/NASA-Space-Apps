/** Accessible tab strip for the field panel: roving tabindex,
 * Arrow keys move focus, Home/End jump, Enter/Space activate. */
import { useRef } from "react";
import { useT } from "../../i18n";

export type TabId = string;

export function Tabs({ tabs, active, onSelect }: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { t } = useT();

  const focus = (i: number) => {
    const n = tabs.length;
    const idx = ((i % n) + n) % n;
    refs.current[idx]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault(); focus(i + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault(); focus(i - 1);
    } else if (e.key === "Home") {
      e.preventDefault(); focus(0);
    } else if (e.key === "End") {
      e.preventDefault(); focus(tabs.length - 1);
    }
  };

  return (
    <div className="panel-tabs" role="tablist"
         aria-label={t("parcels.tabs")}>
      {tabs.map((tab, i) => (
        <button key={tab.id} role="tab" type="button"
                id={`tab-${tab.id}`}
                aria-selected={active === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={active === tab.id ? 0 : -1}
                ref={(el) => { refs.current[i] = el; }}
                onKeyDown={(e) => onKey(e, i)}
                onClick={() => onSelect(tab.id)}>
          {tab.label}
        </button>))}
    </div>);
}
