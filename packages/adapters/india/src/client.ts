import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";

export interface IndiaClientOptions {
  provider?: PublicFinancialsProvider;
}

export function createIndiaPlaceholderClient(options: IndiaClientOptions = {}) {
  return createRegionalPublicClient({
    regime: "india_placeholder",
    label: "India",
    identifierLabel: "ticker or company name",
    identifierExample: "RELIANCE",
    aliases: {
      RELIANCE: "RELIANCE.NS",
      "NSE:RELIANCE": "RELIANCE.NS"
    },
    preferredSuffixes: [".NS", ".BO"],
    preferredExchanges: ["NSE", "BSE", "NSI"],
    provider: options.provider
  });
}
