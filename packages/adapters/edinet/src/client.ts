import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";

export interface EdinetClientOptions {
  apiKey?: string;
  provider?: PublicFinancialsProvider;
}

export function createEdinetClient(options: EdinetClientOptions = {}) {
  return createRegionalPublicClient({
    regime: "edinet",
    label: "Japan",
    identifierLabel: "ticker, company name, or EDINET alias",
    identifierExample: "TOYOTA",
    aliases: {
      TOYOTA: "7203.T",
      "7203": "7203.T"
    },
    preferredSuffixes: [".T"],
    preferredExchanges: ["JPX", "TOKYO"],
    provider: options.provider
  });
}
