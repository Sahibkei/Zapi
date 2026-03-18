import { describe, expect, it } from "vitest";
import { createCompaniesHouseClient } from "../../adapters/companies-house/src";
import { createEdinetClient } from "../../adapters/edinet/src";
import { createIndiaPlaceholderClient } from "../../adapters/india/src";
import { formatMatrixStatement } from "../../core/src";
import type { PublicFinancialsProvider } from "../../adapters/shared/src/public-financials";

const annualRows = {
  "HSBA.L": [
    {
      date: new Date("2024-12-31"),
      totalRevenue: 62000000000,
      netInterestIncome: 33000000000,
      nonInterestIncome: 29000000000,
      operatingExpense: 30000000000,
      pretaxIncome: 28000000000,
      netIncome: 21000000000,
      dilutedEPS: 1.1,
      dilutedAverageShares: 18000000000,
      totalAssets: 3100000000000,
      currentAssets: 600000000000,
      currentLiabilities: 500000000000,
      totalLiabilitiesNetMinorityInterest: 2900000000000,
      totalEquityGrossMinorityInterest: 200000000000,
      stockholdersEquity: 190000000000,
      operatingCashFlow: 25000000000,
      investingCashFlow: -20000000000,
      financingCashFlow: -5000000000,
      endCashPosition: 400000000000,
      beginningCashPosition: 390000000000
    },
    {
      date: new Date("2025-12-31"),
      totalRevenue: 66224000000,
      netInterestIncome: 34794000000,
      nonInterestIncome: 31430000000,
      operatingExpense: 33561000000,
      pretaxIncome: 29907000000,
      netIncome: 22285000000,
      dilutedEPS: 1.2,
      dilutedAverageShares: 17547000000,
      totalAssets: 3233034000000,
      currentAssets: 650000000000,
      currentLiabilities: 520000000000,
      totalLiabilitiesNetMinorityInterest: 3027368000000,
      totalEquityGrossMinorityInterest: 205666000000,
      stockholdersEquity: 198225000000,
      operatingCashFlow: 29766000000,
      investingCashFlow: -37068000000,
      financingCashFlow: -21961000000,
      endCashPosition: 432887000000,
      beginningCashPosition: 434940000000
    }
  ],
  "7203.T": [
    {
      date: new Date("2021-03-31")
    },
    {
      date: new Date("2024-03-31"),
      totalRevenue: 45000000000000,
      grossProfit: 9000000000000,
      costOfRevenue: 36000000000000,
      operatingExpense: 4700000000000,
      operatingIncome: 4300000000000,
      pretaxIncome: 6000000000000,
      taxProvision: 1500000000000,
      netIncome: 4400000000000,
      dilutedEPS: 320,
      dilutedAverageShares: 13300000000,
      totalAssets: 90000000000000,
      currentAssets: 36000000000000,
      currentLiabilities: 29000000000000,
      totalLiabilitiesNetMinorityInterest: 55000000000000,
      totalEquityGrossMinorityInterest: 35000000000000,
      stockholdersEquity: 34000000000000,
      operatingCashFlow: 3500000000000,
      investingCashFlow: -4000000000000,
      financingCashFlow: 150000000000,
      endCashPosition: 9100000000000,
      beginningCashPosition: 9300000000000
    },
    {
      date: new Date("2025-03-31"),
      totalRevenue: 48036704000000,
      grossProfit: 9578038000000,
      costOfRevenue: 38458666000000,
      operatingExpense: 4782452000000,
      operatingIncome: 4795586000000,
      pretaxIncome: 6414590000000,
      taxProvision: 1624835000000,
      netIncome: 4765086000000,
      dilutedEPS: 359.56,
      dilutedAverageShares: 13252456000,
      totalAssets: 93601350000000,
      currentAssets: 37078676000000,
      currentLiabilities: 29434220000000,
      totalLiabilitiesNetMinorityInterest: 56722436000000,
      totalEquityGrossMinorityInterest: 36878914000000,
      stockholdersEquity: 35924826000000,
      operatingCashFlow: 3696934000000,
      investingCashFlow: -4189736000000,
      financingCashFlow: 197236000000,
      endCashPosition: 8982404000000,
      beginningCashPosition: 9412060000000
    }
  ],
  "RELIANCE.NS": [
    {
      date: new Date("2021-03-31")
    },
    {
      date: new Date("2024-03-31"),
      totalRevenue: 9000000000000,
      grossProfit: 2200000000000,
      costOfRevenue: 6800000000000,
      operatingExpense: 1200000000000,
      operatingIncome: 1000000000000,
      pretaxIncome: 930000000000,
      taxProvision: 220000000000,
      netIncome: 650000000000,
      dilutedEPS: 48.5,
      dilutedAverageShares: 13500000000,
      totalAssets: 18500000000000,
      currentAssets: 4700000000000,
      currentLiabilities: 4300000000000,
      totalLiabilitiesNetMinorityInterest: 9000000000000,
      totalEquityGrossMinorityInterest: 9500000000000,
      stockholdersEquity: 8000000000000,
      operatingCashFlow: 1600000000000,
      investingCashFlow: -1200000000000,
      financingCashFlow: -350000000000,
      endCashPosition: 970000000000,
      beginningCashPosition: 910000000000
    },
    {
      date: new Date("2025-03-31"),
      totalRevenue: 9646930000000,
      grossProfit: 2420060000000,
      costOfRevenue: 7226870000000,
      operatingExpense: 1295440000000,
      operatingIncome: 1124620000000,
      pretaxIncome: 1060170000000,
      taxProvision: 252300000000,
      netIncome: 696480000000,
      dilutedEPS: 51.47,
      dilutedAverageShares: 13532410577,
      totalAssets: 19501210000000,
      currentAssets: 4992700000000,
      currentLiabilities: 4537370000000,
      totalLiabilitiesNetMinorityInterest: 9404950000000,
      totalEquityGrossMinorityInterest: 10096260000000,
      stockholdersEquity: 8432000000000,
      operatingCashFlow: 1787030000000,
      investingCashFlow: -1375350000000,
      financingCashFlow: -318910000000,
      endCashPosition: 1065020000000,
      beginningCashPosition: 972250000000
    }
  ]
} as const;

const provider: PublicFinancialsProvider = {
  async search(query) {
    const normalized = query.toUpperCase();
    if (normalized === "HSBA") {
      return [{ symbol: "HSBA.L", exchange: "LSE", typeDisp: "equity", longname: "HSBC Holdings plc" }];
    }
    if (normalized === "TOYOTA") {
      return [{ symbol: "7203.T", exchange: "JPX", typeDisp: "equity", longname: "Toyota Motor Corporation" }];
    }
    if (normalized === "RELIANCE") {
      return [{ symbol: "RELIANCE.NS", exchange: "NSI", typeDisp: "equity", longname: "Reliance Industries Limited" }];
    }
    return [];
  },
  async quote(symbol) {
    if (symbol === "HSBA.L") {
      return { symbol, longName: "HSBC Holdings plc", financialCurrency: "USD", fullExchangeName: "LSE" };
    }
    if (symbol === "7203.T") {
      return { symbol, longName: "Toyota Motor Corporation", financialCurrency: "JPY", fullExchangeName: "Tokyo" };
    }
    return { symbol, longName: "Reliance Industries Limited", financialCurrency: "INR", fullExchangeName: "NSE" };
  },
  async fundamentals(symbol, options) {
    if (options.type === "trailing") {
      return [];
    }
    return [...annualRows[symbol as keyof typeof annualRows]];
  }
};

describe("non-US adapters", () => {
  it("builds UK bank statements via the regional public fallback", async () => {
    const client = createCompaniesHouseClient({ provider });
    const statement = await client.getStatement({
      identifier: "HSBA",
      statement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      view: "restated"
    });

    expect(client.getCapabilities().status).toBe("live");
    expect(statement.meta.companyName).toBe("HSBC Holdings plc");
    expect(statement.meta.sectorProfile).toBe("bank");
    expect(statement.columns).toEqual(["2024", "2025"]);
    expect(statement.periods["2025"].revenue_total).toBe(66224000000);
  });

  it("builds Japan industrial statements, trims empty leading periods, and formats JPY in thousands", async () => {
    const client = createEdinetClient({ provider });
    const statement = await client.getStatement({
      identifier: "TOYOTA",
      statement: "income_statement",
      frequency: "annual",
      periods: 5,
      includeTtm: true,
      view: "restated"
    });
    const matrix = formatMatrixStatement(statement);

    expect(statement.meta.currency).toBe("JPY");
    expect(statement.meta.sectorProfile).toBe("industrial");
    expect(statement.columns).toEqual(["2024", "2025"]);
    expect(statement.rows.some((row) => row.metricCode === "interest_income_net")).toBe(false);
    expect(statement.rows.some((row) => row.metricCode === "gross_profit")).toBe(true);
    expect(statement.periods["2025"].revenue_total).toBe(48036704000000);
    expect(matrix.rows.find((row) => row.metric_code === "revenue_total")?.display_values[1]).toBe("48,036,704,000");
  });

  it("builds India statements and keeps beta quality flags visible", async () => {
    const client = createIndiaPlaceholderClient({ provider });
    const statement = await client.getStatement({
      identifier: "RELIANCE",
      statement: "cash_flow",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      view: "as_reported"
    });

    expect(statement.meta.currency).toBe("INR");
    expect(statement.meta.qualityFlags).toContain("beta_public_fundamentals_provider");
    expect(statement.meta.qualityFlags).toContain("as_reported_proxy_not_filing_based");
    expect(statement.periods["2025"].operating_cash_flow).toBe(1787030000000);
  });
});
