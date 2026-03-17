import {
  type StatementFrequency,
  type NormalizedStatementResponse,
  type StatementRequest,
  type StatementSourceRegime,
  type StatementType,
  type StatementView
} from "./contracts";
import { UnsupportedFeatureError } from "./errors";

export interface SecEdgarStatementClient {
  getStatement(input: {
    ticker: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse>;
  getCapabilities(): AdapterCapabilities;
}

export interface FederatedStatementClient {
  getStatement(input: {
    identifier: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse>;
  getCapabilities(): AdapterCapabilities;
}

export interface AdapterCapabilities {
  regime: StatementSourceRegime;
  status: "live" | "scaffolded" | "placeholder";
  identifierLabel: string;
  identifierExample: string;
  statementSupport: "full" | "parser_pending" | "not_started";
  notes: string[];
  requiredEnv: string[];
}

function unsupportedRegime(regime: StatementSourceRegime): FederatedStatementClient {
  return {
    async getStatement() {
      throw new UnsupportedFeatureError(
        `The ${regime} adapter is not configured in this deployment.`,
        { regime }
      );
    },
    getCapabilities() {
      return {
        regime,
        status: "placeholder",
        identifierLabel: "identifier",
        identifierExample: "UNKNOWN",
        statementSupport: "not_started",
        notes: [`The ${regime} adapter is not configured in this deployment.`],
        requiredEnv: []
      };
    }
  };
}

export function createStatementService(dependencies: {
  secEdgarClient: SecEdgarStatementClient;
  companiesHouseClient?: FederatedStatementClient;
  edinetClient?: FederatedStatementClient;
  indiaClient?: FederatedStatementClient;
}) {
  const companiesHouseClient =
    dependencies.companiesHouseClient ?? unsupportedRegime("companies_house");
  const edinetClient = dependencies.edinetClient ?? unsupportedRegime("edinet");
  const indiaClient =
    dependencies.indiaClient ?? unsupportedRegime("india_placeholder");

  return {
    async getStatement(input: StatementRequest): Promise<NormalizedStatementResponse> {
      switch (input.regime) {
        case "sec_edgar":
          return dependencies.secEdgarClient.getStatement({
            ticker: input.ticker,
            statement: input.statement,
            frequency: input.frequency,
            periods: input.periods,
            includeTtm: input.includeTtm,
            view: input.view
          });
        case "companies_house":
          return companiesHouseClient.getStatement({
            identifier: input.ticker,
            statement: input.statement,
            frequency: input.frequency,
            periods: input.periods,
            includeTtm: input.includeTtm,
            view: input.view
          });
        case "edinet":
          return edinetClient.getStatement({
            identifier: input.ticker,
            statement: input.statement,
            frequency: input.frequency,
            periods: input.periods,
            includeTtm: input.includeTtm,
            view: input.view
          });
        case "india_placeholder":
          return indiaClient.getStatement({
            identifier: input.ticker,
            statement: input.statement,
            frequency: input.frequency,
            periods: input.periods,
            includeTtm: input.includeTtm,
            view: input.view
          });
      }
    },

    listRegimes(): AdapterCapabilities[] {
      return [
        dependencies.secEdgarClient.getCapabilities(),
        companiesHouseClient.getCapabilities(),
        edinetClient.getCapabilities(),
        indiaClient.getCapabilities()
      ];
    }
  };
}
