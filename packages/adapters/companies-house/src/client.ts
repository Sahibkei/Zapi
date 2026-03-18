import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";
import { createCompaniesHouseOfficialApi, extractDocumentId, selectLatestAccountsFiling } from "./official-api";

export interface CompaniesHouseClientOptions {
  apiKey?: string;
  provider?: PublicFinancialsProvider;
}

export function createCompaniesHouseClient(options: CompaniesHouseClientOptions = {}) {
  const fallbackClient = createRegionalPublicClient({
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

  if (!options.apiKey) {
    return fallbackClient;
  }

  const officialApi = createCompaniesHouseOfficialApi({
    apiKey: options.apiKey
  });

  const officialCompanyAliases: Record<string, string> = {
    HSBA: "00617987",
    HSBC: "00617987"
  };

  return {
    async getStatement(input: Parameters<typeof fallbackClient.getStatement>[0]) {
      const fallbackStatement = await fallbackClient.getStatement(input);

      try {
        const company = await officialApi.resolveCompany(input.identifier, officialCompanyAliases);
        const filings = await officialApi.getFilingHistory(company.companyNumber);
        const latestAccountsFiling = selectLatestAccountsFiling(filings);
        const documentId = latestAccountsFiling?.links?.document_metadata
          ? extractDocumentId(latestAccountsFiling.links.document_metadata)
          : null;

        if (documentId) {
          await officialApi.getDocumentMetadata(documentId);
        }

        return {
          ...fallbackStatement,
          meta: {
            ...fallbackStatement.meta,
            companyName: company.companyName,
            qualityFlags: [
              ...new Set([
                ...fallbackStatement.meta.qualityFlags,
                "official_registry_lookup"
              ])
            ]
          }
        };
      } catch {
        return fallbackStatement;
      }
    },

    getCapabilities() {
      const fallback = fallbackClient.getCapabilities();
      return {
        ...fallback,
        notes: [
          "Official Companies House registry lookup is enabled with the configured API key.",
          "Statement values still use the beta public fallback until the UK filing parser is completed."
        ],
        requiredEnv: ["COMPANIES_HOUSE_API_KEY"]
      };
    }
  };
}
