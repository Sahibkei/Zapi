import {
  UnsupportedFeatureError,
  type AdapterCapabilities,
  type NormalizedStatementResponse,
  type StatementFrequency,
  type StatementType,
  type StatementView
} from "../../../core/src";

export interface CompaniesHouseClientOptions {
  apiKey?: string;
}

export function createCompaniesHouseClient(options: CompaniesHouseClientOptions = {}) {
  async function getStatement(input: {
    identifier: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse> {
    throw new UnsupportedFeatureError(
      "Companies House federation is scaffolded, but UK filing-to-statement parsing is not implemented yet.",
      {
        regime: "companies_house",
        identifier: input.identifier,
        nextLayer: "uk_xbrl_parser",
        configured: Boolean(options.apiKey)
      }
    );
  }

  function getCapabilities(): AdapterCapabilities {
    return {
      regime: "companies_house",
      status: "scaffolded",
      identifierLabel: "company number",
      identifierExample: "00001995",
      statementSupport: "parser_pending",
      notes: [
        "Adapter package is present for the federation layer.",
        "Statement parsing still needs a UK XBRL/iXBRL parser."
      ],
      requiredEnv: ["COMPANIES_HOUSE_API_KEY"]
    };
  }

  return {
    getStatement,
    getCapabilities
  };
}
