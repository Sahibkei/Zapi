import {
  type NormalizedStatementResponse,
  type StatementRequest,
  type StatementType
} from "./contracts";
import { UnsupportedFeatureError } from "./errors";

export interface SecEdgarStatementClient {
  getAnnualStatement(input: {
    ticker: string;
    statement: StatementType;
    periods: number;
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

      if (input.frequency !== "annual") {
        throw new UnsupportedFeatureError(
          "The SEC-first MVP currently supports only annual statements.",
          { supportedFrequency: "annual" }
        );
      }

      return dependencies.secEdgarClient.getAnnualStatement({
        ticker: input.ticker,
        statement: input.statement,
        periods: input.periods
      });
    }
  };
}
