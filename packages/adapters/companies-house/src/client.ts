import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";

export interface CompaniesHouseClientOptions {
  apiKey?: string;
  provider?: PublicFinancialsProvider;
}

export function createCompaniesHouseClient(options: CompaniesHouseClientOptions = {}) {
  return createRegionalPublicClient({
    regime: "companies_house",
    label: "UK",
    identifierLabel: "ticker or company number",
    identifierExample: "HSBA",
    aliases: {
      HSBA: "HSBA.L",
      HSBC: "HSBA.L"
    },
    preferredSuffixes: [".L"],
    preferredExchanges: ["LSE", "LONDON"],
    provider: options.provider
  });
}
