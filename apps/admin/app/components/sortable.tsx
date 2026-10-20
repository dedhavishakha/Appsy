import { useRef, useState, type ReactNode } from "react";

type Drag = { from: number; slot: number };

// A list the merchant reorders by dragging each row's handle. Pointer events, so it works
// with a mouse, a trackpad or touch; the handle also takes the up and down keys. `slot` is
// where the row would land: 0 is before the first row, items.length after the last.
export function Sortable<T>({
  items,
  keyOf,
  label,
  onMove,
  children,
}: {
  items: T[];
  keyOf: (item: T) => string;
  // Read out for each handle, e.g. "Drag to move Image banner".
  label: (item: T) => string;
  onMove: (from: number, to: number) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // Only this list's own rows: a section's row holds its blocks' list too.
  const slotAt = (y: number) => {
    const rows = Array.from(
      list.current?.querySelectorAll<HTMLElement>(
        ":scope > [data-sortable-row]",
      ) ?? [],
    );
    const index = rows.findIndex((row) => {
      const box = row.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    return index === -1 ? rows.length : index;
  };

  const finish = () => {
    if (drag) {
      const to = drag.slot > drag.from ? drag.slot - 1 : drag.slot;
      if (to !== drag.from) onMove(drag.from, to);
    }
    setDrag(null);
  };

  // A line where the row would land, unless that's where it already is.
  const lineAt = (slot: number) =>
    drag !== null &&
    drag.slot === slot &&
    slot !== drag.from &&
    slot !== drag.from + 1;

  return (
    <div ref={list} style={styles.list}>
      {items.map((item, index) => (
        <div
          key={keyOf(item)}
          data-sortable-row
          style={{ ...styles.row, opacity: drag?.from === index ? 0.45 : 1 }}
        >
          {lineAt(index) && <div style={styles.line} />}
          {children(
            item,
            <span
              role="button"
              tabIndex={0}
              aria-label={label(item)}
              aria-keyshortcuts="ArrowUp ArrowDown"
              title="Drag to move"
              style={{ ...styles.handle, cursor: drag ? "grabbing" : "grab" }}
              // Without a mouse: the up and down keys move the row one place.
              onKeyDown={(event) => {
                const to =
                  event.key === "ArrowUp"
                    ? index - 1
                    : event.key === "ArrowDown"
                      ? index + 1
                      : null;
                if (to === null) return;
                event.preventDefault();
                if (to >= 0 && to < items.length) onMove(index, to);
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDrag({ from: index, slot: index });
              }}
              onPointerMove={(event) => {
                if (!drag) return;
                const slot = slotAt(event.clientY);
                if (slot !== drag.slot) setDrag({ ...drag, slot });
              }}
              onPointerUp={finish}
              onPointerCancel={() => setDrag(null)}
            >
              <s-icon type="drag-handle" />
            </span>,
          )}
        </div>
      ))}
      {lineAt(items.length) && <div style={styles.line} />}
    </div>
  );
}

const styles = {
  list: { display: "flex", flexDirection: "column", gap: 6 },
  row: { position: "relative" },
  line: {
    position: "absolute",
    top: -4,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    background: "#005bd3",
  },
  handle: {
    display: "flex",
    alignItems: "center",
    padding: 2,
    touchAction: "none",
  },
} as const;
