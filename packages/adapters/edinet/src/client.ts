import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";
import { createEdinetOfficialApi, selectLatestAnnualSecuritiesReport } from "./official-api";

export interface EdinetClientOptions {
  apiKey?: string;
  provider?: PublicFinancialsProvider;
}

export function createEdinetClient(options: EdinetClientOptions = {}) {
  const fallbackClient = createRegionalPublicClient({
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

  if (!options.apiKey) {
    return fallbackClient;
  }

  const officialApi = createEdinetOfficialApi({
    apiKey: options.apiKey
  });

  const officialAliases: Record<string, string> = {
    TOYOTA: "E02144",
    "7203": "E02144"
  };

  function recentDates(days: number): string[] {
    const results: string[] = [];
    const now = new Date();
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - offset
      ));
      results.push(date.toISOString().slice(0, 10));
    }
    return results;
  }

  return {
    async getStatement(input: Parameters<typeof fallbackClient.getStatement>[0]) {
      const fallbackStatement = await fallbackClient.getStatement(input);

      try {
        const company = officialApi.resolveCompany(input.identifier, officialAliases);
        let latestAnnualReport: ReturnType<typeof selectLatestAnnualSecuritiesReport> = null;

        for (const date of recentDates(550)) {
          const entries = await officialApi.getDocumentsForDate(date);
          latestAnnualReport = selectLatestAnnualSecuritiesReport(entries, company.edinetCode);
          if (latestAnnualReport) {
            break;
          }
        }

        if (latestAnnualReport?.docID) {
          await officialApi.downloadDocument(latestAnnualReport.docID, "1");
        }

        return {
          ...fallbackStatement,
          meta: {
            ...fallbackStatement.meta,
            companyName: latestAnnualReport?.filerName ?? fallbackStatement.meta.companyName,
            qualityFlags: [
              ...new Set([
                ...fallbackStatement.meta.qualityFlags,
                "official_filing_lookup"
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
          "Official EDINET document lookup is enabled with the configured API key.",
          "Statement values still use the beta public fallback until the EDINET XBRL parser is completed."
        ],
        requiredEnv: ["EDINET_API_KEY"]
      };
    }
  };
}
