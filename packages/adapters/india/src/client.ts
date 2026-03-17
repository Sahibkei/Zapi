import {
  UnsupportedFeatureError,
  type AdapterCapabilities,
  type NormalizedStatementResponse,
  type StatementFrequency,
  type StatementType,
  type StatementView
} from "../../../core/src";

export function createIndiaPlaceholderClient() {
  async function getStatement(input: {
    identifier: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse> {
    throw new UnsupportedFeatureError(
      "India support is still a placeholder until the official filing-access path is finalized.",
      {
        regime: "india_placeholder",
        identifier: input.identifier
      }
    );
  }

  function getCapabilities(): AdapterCapabilities {
    return {
      regime: "india_placeholder",
      status: "placeholder",
      identifierLabel: "issuer identifier",
      identifierExample: "NSE:TCS",
      statementSupport: "not_started",
      notes: [
        "Reserved adapter slot for the architecture paper.",
        "No official statement parser is implemented yet."
      ],
      requiredEnv: []
    };
  }

  return {
    getStatement,
    getCapabilities
  };
}
