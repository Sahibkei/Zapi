import {
  UnsupportedFeatureError,
  type AdapterCapabilities,
  type NormalizedStatementResponse,
  type StatementFrequency,
  type StatementType,
  type StatementView
} from "../../../core/src";

export function createEdinetClient() {
  async function getStatement(input: {
    identifier: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse> {
    throw new UnsupportedFeatureError(
      "EDINET federation is scaffolded, but Japanese filing-to-statement parsing is not implemented yet.",
      {
        regime: "edinet",
        identifier: input.identifier,
        nextLayer: "edinet_taxonomy_parser"
      }
    );
  }

  function getCapabilities(): AdapterCapabilities {
    return {
      regime: "edinet",
      status: "scaffolded",
      identifierLabel: "EDINET code",
      identifierExample: "E00001",
      statementSupport: "parser_pending",
      notes: [
        "Adapter package is present for the federation layer.",
        "Statement parsing still needs EDINET taxonomy and filing parsing."
      ],
      requiredEnv: []
    };
  }

  return {
    getStatement,
    getCapabilities
  };
}
