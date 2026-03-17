import {
  type StatementFrequency,
  type NormalizedStatementResponse,
  type StatementRequest,
  type StatementType
} from "./contracts";
import { UnsupportedFeatureError } from "./errors";

export interface SecEdgarStatementClient {
  getStatement(input: {
    ticker: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
  }): Promise<NormalizedStatementResponse>;
}

export function createStatementService(dependencies: {
  secEdgarClient: SecEdgarStatementClient;
}) {
  return {
    async getStatement(input: StatementRequest): Promise<NormalizedStatementResponse> {
      if (input.view !== "restated") {
        throw new UnsupportedFeatureError(
          "The SEC-first MVP currently supports only restated output.",
          { supportedView: "restated" }
        );
      }

      return dependencies.secEdgarClient.getStatement({
        ticker: input.ticker,
        statement: input.statement,
        frequency: input.frequency,
        periods: input.periods,
        includeTtm: input.includeTtm
      });
    }
  };
}
