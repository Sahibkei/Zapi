import {
  NotFoundError,
  UpstreamError,
  type StatementFrequency,
  type NormalizedStatementResponse,
  type StatementType
} from "../../../core/src";
import { mapStatement } from "./mapper";
import type { SecCompanyFacts, SecSubmissions, SecTickerEntry } from "./types";

const SEC_BASE_URL = "https://data.sec.gov";
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

export interface SecEdgarClientOptions {
  userAgent: string;
}

export function createSecEdgarClient(options: SecEdgarClientOptions) {
  const headers = {
    "User-Agent": options.userAgent,
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate"
  };

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new UpstreamError(`SEC request failed with status ${response.status}.`, {
        url,
        status: response.status
      });
    }

    return response.json() as Promise<T>;
  }

  async function resolveTicker(ticker: string): Promise<SecTickerEntry> {
    const tickerMap = await fetchJson<Record<string, SecTickerEntry>>(SEC_TICKERS_URL);
    const entry = Object.values(tickerMap).find(
      (candidate) => candidate.ticker.toUpperCase() === ticker.toUpperCase()
    );

    if (!entry) {
      throw new NotFoundError(`Ticker ${ticker} was not found in the SEC ticker map.`);
    }

    return entry;
  }

  async function getStatement(input: {
    ticker: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
  }): Promise<NormalizedStatementResponse> {
    const company = await resolveTicker(input.ticker);
    const cik = company.cik_str.toString().padStart(10, "0");

    const [facts, submissions] = await Promise.all([
      fetchJson<SecCompanyFacts>(`${SEC_BASE_URL}/api/xbrl/companyfacts/CIK${cik}.json`),
      fetchJson<SecSubmissions>(`${SEC_BASE_URL}/submissions/CIK${cik}.json`)
    ]);

    return mapStatement({
      ticker: company.ticker,
      requestedStatement: input.statement,
      frequency: input.frequency,
      periods: input.periods,
      includeTtm: input.includeTtm,
      companyFacts: facts,
      submissions
    });
  }

  return {
    getStatement
  };
}
