import type { MatrixStatementResponse, NormalizedStatementResponse } from "../../../core/src";

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
      titleSlug: statement.meta.titleSlug
    },
    columns: statement.columns,
    rows: statement.rows.map((row) => ({
      metric_code: row.metricCode,
      label: row.label,
      depth: row.depth,
      row_kind: row.rowKind,
      values: row.values
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
    lines.push([label, ...row.values].map(csvEscape).join(","));
  }

  lines.push([statement.footer, ...statement.columns.map(() => "")].map(csvEscape).join(","));
  return `${lines.join("\n")}\n`;
}
