import {
  createRegionalPublicClient,
  type PublicFinancialsProvider
} from "../../shared/src/public-financials";
import {
  createIndiaOfficialApi,
  selectPreferredAnnualResults,
  type IndiaOfficialApiOptions,
  type IndiaOfficialFinancialRow
} from "./official-api";

export interface IndiaClientOptions {
  provider?: PublicFinancialsProvider;
  fetchImpl?: IndiaOfficialApiOptions["fetchImpl"];
}

export function createIndiaPlaceholderClient(options: IndiaClientOptions = {}) {
  const aliases = {
    RELIANCE: "RELIANCE.NS",
    "NSE:RELIANCE": "RELIANCE.NS"
  };
  const useOfficialProvider = !(options.provider && !options.fetchImpl);

  return createRegionalPublicClient({
    regime: "india_placeholder",
    label: "India",
    identifierLabel: "ticker or company name",
    identifierExample: "RELIANCE",
    aliases,
    preferredSuffixes: [".NS", ".BO"],
    preferredExchanges: ["NSE", "BSE", "NSI"],
    provider: !useOfficialProvider
      ? options.provider
      : createIndiaOfficialProvider({
          fallbackProvider: options.provider,
          fetchImpl: options.fetchImpl,
          aliases
        }),
    qualityFlags: useOfficialProvider ? ["official_nse_xbrl"] : ["beta_public_fundamentals_provider"],
    asReportedQualityFlags: ["as_reported_proxy_not_filing_based"],
    capabilityNotes: useOfficialProvider
      ? [
          "Official NSE annual-results XBRL support is enabled for Indian equities.",
          "Quarterly and TTM statement support still fall back until the broader India filing parser is completed."
        ]
      : [
          "Beta India statement support is enabled via a public market-statement fallback.",
          "Official NSE annual-results XBRL support is available when the official transport is enabled."
        ]
  });
}

function createIndiaOfficialProvider(input: {
  fallbackProvider?: PublicFinancialsProvider;
  fetchImpl?: IndiaOfficialApiOptions["fetchImpl"];
  aliases: Record<string, string>;
}): PublicFinancialsProvider {
  const officialApi = createIndiaOfficialApi({
    fetchImpl: input.fetchImpl
  });
  const annualResultsCache = new Map<string, Promise<ReturnType<typeof selectPreferredAnnualResults>>>();
  const annualRowsCache = new Map<string, Promise<IndiaOfficialFinancialRow[]>>();

  async function getAnnualResults(symbol: string) {
    if (!annualResultsCache.has(symbol)) {
      annualResultsCache.set(symbol, (async () => {
        const results = await officialApi.getAnnualFinancialResults(symbol);
        return selectPreferredAnnualResults(results);
      })());
    }

    return annualResultsCache.get(symbol)!;
  }

  async function getAnnualRows(symbol: string): Promise<IndiaOfficialFinancialRow[]> {
    if (!annualRowsCache.has(symbol)) {
      annualRowsCache.set(symbol, (async () => {
        const results = await getAnnualResults(symbol);
        const rows = await Promise.all(
          results.map(async (entry) => {
            const xml = await officialApi.downloadXbrl(entry.xbrl!);
            return officialApi.parseAnnualXbrl(xml);
          }).map((promise) => promise.catch(() => null))
        );

        return rows
          .filter((row): row is IndiaOfficialFinancialRow => row !== null)
          .sort((left, right) => left.date.getTime() - right.date.getTime());
      })());
    }

    return annualRowsCache.get(symbol)!;
  }

  function resolveSymbol(identifier: string): { symbol: string; exchangeSymbol: string } {
    const company = officialApi.resolveCompany(identifier, input.aliases);
    return {
      symbol: company.symbol,
      exchangeSymbol: company.exchangeSymbol
    };
  }

  return {
    async search(query: string) {
      try {
        const { symbol, exchangeSymbol } = resolveSymbol(query);
        const annualResults = await getAnnualResults(exchangeSymbol);
        const latest = annualResults.at(-1);
        return [{
          symbol,
          exchange: "NSE",
          typeDisp: "equity",
          longname: latest?.companyName ?? exchangeSymbol
        }];
      } catch {
        if (input.fallbackProvider) {
          return input.fallbackProvider.search(query);
        }
        return [];
      }
    },

    async quote(symbol: string) {
      const { symbol: resolvedSymbol, exchangeSymbol } = resolveSymbol(symbol);
      const annualResults = await getAnnualResults(exchangeSymbol);
      const latest = annualResults.at(-1);
      return {
        symbol: resolvedSymbol,
        longName: latest?.companyName ?? exchangeSymbol,
        financialCurrency: "INR",
        fullExchangeName: "NSE"
      };
    },

    async fundamentals(symbol: string, options) {
      const { exchangeSymbol } = resolveSymbol(symbol);
      if (options.type !== "annual") {
        if (input.fallbackProvider) {
          return input.fallbackProvider.fundamentals(symbol, options);
        }
        return [];
      }

      return getAnnualRows(exchangeSymbol);
    }
  };
}
