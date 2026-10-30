import {
  SIZE_CHART_MAX_CELL,
  SIZE_CHART_MAX_COLUMNS,
  SIZE_CHART_MAX_ROWS,
  type SizeChartTable,
} from "@appsy/app-config";

// A size chart's table as a grid of fields: the first row holds the column headings
// ("Size", "Chest"), each row below one size. Rows and columns can be added and removed,
// up to the limits phones show well.

export const STARTING_TABLE: SizeChartTable = {
  columns: ["Size", "Chest", "Waist"],
  rows: [
    ["S", "", ""],
    ["M", "", ""],
    ["L", "", ""],
  ],
};

export function SizeChartTableEditor({
  table,
  onChange,
}: {
  table: SizeChartTable;
  onChange: (table: SizeChartTable) => void;
}) {
  const width = table.columns.length;
  const grid = `repeat(${width}, minmax(72px, 1fr)) auto`;

  const setHeading = (column: number, value: string) =>
    onChange({
      ...table,
      columns: table.columns.map((heading, index) =>
        index === column ? value : heading,
      ),
    });
  const setCell = (row: number, column: number, value: string) =>
    onChange({
      ...table,
      rows: table.rows.map((cells, index) =>
        index === row
          ? cells.map((cell, place) => (place === column ? value : cell))
          : cells,
      ),
    });
  const addColumn = () =>
    onChange({
      columns: [...table.columns, ""],
      rows: table.rows.map((cells) => [...cells, ""]),
    });
  const removeColumn = (column: number) =>
    onChange({
      columns: table.columns.filter((_, index) => index !== column),
      rows: table.rows.map((cells) =>
        cells.filter((_, index) => index !== column),
      ),
    });
  const addRow = () =>
    onChange({ ...table, rows: [...table.rows, Array(width).fill("")] });
  const removeRow = (row: number) =>
    onChange({
      ...table,
      rows: table.rows.filter((_, index) => index !== row),
    });

  return (
    <s-stack gap="small">
      <s-grid gridTemplateColumns={grid} gap="small" alignItems="end">
        {table.columns.map((heading, column) => (
          <s-text-field
            key={`heading-${column}`}
            label={column === 0 ? "Column headings" : `Heading ${column + 1}`}
            labelAccessibilityVisibility={
              column === 0 ? "visible" : "exclusive"
            }
            value={heading}
            maxLength={SIZE_CHART_MAX_CELL}
            placeholder={column === 0 ? "Size" : "Chest"}
            onInput={(event) => setHeading(column, event.currentTarget.value)}
          />
        ))}
        <span />
        {width > 1 &&
          table.columns.map((heading, column) => (
            <s-button
              key={`remove-column-${column}`}
              variant="tertiary"
              tone="critical"
              icon="delete"
              accessibilityLabel={`Remove the ${heading || `column ${column + 1}`} column`}
              onClick={() => removeColumn(column)}
            />
          ))}
        {width > 1 && <span />}
        {table.rows.map((cells, row) => (
          <SizeChartRow
            key={`row-${row}`}
            cells={cells}
            columns={table.columns}
            row={row}
            onCell={(column, value) => setCell(row, column, value)}
            onRemove={() => removeRow(row)}
          />
        ))}
      </s-grid>
      <s-stack direction="inline" gap="small">
        <s-button
          icon="plus"
          disabled={table.rows.length >= SIZE_CHART_MAX_ROWS || undefined}
          onClick={addRow}
        >
          Add size
        </s-button>
        <s-button
          icon="plus"
          disabled={width >= SIZE_CHART_MAX_COLUMNS || undefined}
          onClick={addColumn}
        >
          Add column
        </s-button>
      </s-stack>
      <s-text color="subdued">
        Up to {SIZE_CHART_MAX_ROWS} sizes and {SIZE_CHART_MAX_COLUMNS} columns.
        Put the unit in a heading, such as &quot;Chest (cm)&quot;.
      </s-text>
    </s-stack>
  );
}

function SizeChartRow({
  cells,
  columns,
  row,
  onCell,
  onRemove,
}: {
  cells: string[];
  columns: string[];
  row: number;
  onCell: (column: number, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <>
      {columns.map((heading, column) => (
        <s-text-field
          key={`cell-${row}-${column}`}
          label={`${cells[0] || `Size ${row + 1}`}, ${heading || `column ${column + 1}`}`}
          labelAccessibilityVisibility="exclusive"
          value={cells[column] ?? ""}
          maxLength={SIZE_CHART_MAX_CELL}
          onInput={(event) => onCell(column, event.currentTarget.value)}
        />
      ))}
      <s-button
        variant="tertiary"
        tone="critical"
        icon="delete"
        accessibilityLabel={`Remove ${cells[0] || `size ${row + 1}`}`}
        onClick={onRemove}
      />
    </>
  );
}
