import {
  type StatementFrequency,
  type NormalizedStatementResponse,
  type StatementRequest,
  type StatementType,
  type StatementView
} from "./contracts";

export interface SecEdgarStatementClient {
  getStatement(input: {
    ticker: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse>;
}

export function createStatementService(dependencies: {
  secEdgarClient: SecEdgarStatementClient;
}) {
  return {
    async getStatement(input: StatementRequest): Promise<NormalizedStatementResponse> {
      return dependencies.secEdgarClient.getStatement({
        ticker: input.ticker,
        statement: input.statement,
        frequency: input.frequency,
        periods: input.periods,
        includeTtm: input.includeTtm,
        view: input.view
      });
    }
  };
}
