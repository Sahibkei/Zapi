import type {
  NormalizedStatementResponse,
  PublicNormalizedStatementResponse
} from "./contracts";

export function formatNormalizedStatement(
  statement: NormalizedStatementResponse,
  options?: { debug?: boolean }
): PublicNormalizedStatementResponse {
  const response: PublicNormalizedStatementResponse = {
    meta: statement.meta,
    columns: statement.columns,
    rows: statement.rows,
    periods: statement.periods
  };

  if (options?.debug) {
    response.debug = {
      facts: statement.facts
    };
  }

  return response;
}
