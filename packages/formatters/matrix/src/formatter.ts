import type { MatrixStatementResponse, NormalizedStatementResponse } from "../../../core/src";

function shouldScaleThousands(unit: string, value: number): boolean {
  return ["USD", "shares"].includes(unit) && Math.abs(value) >= 1000;
}

function formatDisplayValue(value: number | null, unit: string): string {
  if (value === null) {
    return "";
  }

  const scaledValue = shouldScaleThousands(unit, value) ? value / 1000 : value;
  const absoluteValue = Math.abs(scaledValue);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Number.isInteger(absoluteValue) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(absoluteValue) ? 0 : 2
  }).format(absoluteValue);

  return scaledValue < 0 ? `(${formatted})` : formatted;
}

export function formatMatrixStatement(
  statement: NormalizedStatementResponse
): MatrixStatementResponse {
  return {
    meta: {
      ticker: statement.meta.ticker,
      statement: statement.meta.statement,
      frequency: statement.meta.frequency,
      view: statement.meta.view,
      currency: statement.meta.currency,
      fiscalYearEnd: statement.meta.fiscalYearEnd,
      titleSlug: statement.meta.titleSlug,
      displayScale: "thousands_when_large",
      negativeStyle: "parentheses"
    },
    columns: statement.columns,
    rows: statement.rows.map((row) => ({
      metric_code: row.metricCode,
      label: row.label,
      depth: row.depth,
      row_kind: row.rowKind,
      unit: row.unit,
      values: row.values,
      display_values: row.values.map((value) => formatDisplayValue(value, row.unit))
    })),
    footer: `Fiscal year ends in ${statement.meta.fiscalYearEnd} | ${statement.meta.currency}`
  };
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

export function formatMatrixCsv(statement: MatrixStatementResponse): string {
  const lines: string[] = [];
  lines.push(
    [statement.meta.titleSlug, ...statement.columns].map(csvEscape).join(",")
  );

  for (const row of statement.rows) {
    const label = `${"    ".repeat(row.depth)}${row.label}`;
    lines.push([label, ...row.display_values].map(csvEscape).join(","));
  }

  lines.push([statement.footer, ...statement.columns.map(() => "")].map(csvEscape).join(","));
  return `${lines.join("\n")}\n`;
}
