interface TabDef {
  id: string;
  icon: string;
  label: string;
}

interface Props {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

/** Icon-only tab strip for a long inspector (see BubbleInspector.tsx) — the label is
 * kept for accessibility (aria-label/title tooltip) but never shown as text, so the
 * strip stays compact regardless of how many tabs there are. */
export function IconTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="icon-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          aria-label={tab.label}
          title={tab.label}
          className={"icon-tab" + (tab.id === active ? " active" : "")}
          onClick={() => onChange(tab.id)}
        >
          <span aria-hidden="true">{tab.icon}</span>
        </button>
      ))}
    </div>
  );
}
