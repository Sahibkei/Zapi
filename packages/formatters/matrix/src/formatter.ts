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
