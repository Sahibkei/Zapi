import companyFacts from "../fixtures/sec/aapl-companyfacts.json";
import submissions from "../fixtures/sec/aapl-submissions.json";
import syntheticQuarterlyCompanyFacts from "../fixtures/sec/synthetic-quarterly-companyfacts.json";
import syntheticQuarterlySubmissions from "../fixtures/sec/synthetic-quarterly-submissions.json";
import {
  createStatementService,
  formatMatrixStatement,
  formatNormalizedStatement
} from "../../core/src";
import { mapStatement } from "../../adapters/sec-edgar/src/mapper";

const syntheticBankCompanyFacts = {
  cik: 123456,
  entityName: "Synthetic Bank Corp.",
  facts: {
    "us-gaap": {
      "InterestIncomeExpenseNet": {
        units: {
          USD: [
            { start: "2025-01-01", end: "2025-03-31", val: 10, accn: "bq1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
            { start: "2025-04-01", end: "2025-06-30", val: 11, accn: "bq2", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-08-01" },
            { start: "2025-07-01", end: "2025-09-30", val: 12, accn: "bq3", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-01" },
            { start: "2025-01-01", end: "2025-12-31", val: 46, accn: "bfy", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }
          ]
        }
      },
      "NoninterestIncome": {
        units: {
          USD: [
            { start: "2025-01-01", end: "2025-03-31", val: 8, accn: "nq1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
            { start: "2025-04-01", end: "2025-06-30", val: 9, accn: "nq2", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-08-01" },
            { start: "2025-07-01", end: "2025-09-30", val: 10, accn: "nq3", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-01" },
            { start: "2025-01-01", end: "2025-12-31", val: 38, accn: "nfy", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }
          ]
        }
      },
      "NetIncomeLoss": {
        units: {
          USD: [
            { start: "2025-01-01", end: "2025-03-31", val: 6, accn: "iq1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
            { start: "2025-04-01", end: "2025-06-30", val: 7, accn: "iq2", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-08-01" },
            { start: "2025-07-01", end: "2025-09-30", val: 8, accn: "iq3", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-01" },
            { start: "2025-01-01", end: "2025-12-31", val: 30, accn: "ify", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }
          ]
        }
      },
      "EarningsPerShareDiluted": {
        units: {
          "USD/shares": [
            { start: "2025-01-01", end: "2025-03-31", val: 2.0, accn: "eq1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
            { start: "2025-04-01", end: "2025-06-30", val: 2.1, accn: "eq2", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-08-01" },
            { start: "2025-07-01", end: "2025-09-30", val: 2.2, accn: "eq3", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-01" },
            { start: "2025-01-01", end: "2025-12-31", val: 8.5, accn: "efy", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }
          ]
        }
      },
      "WeightedAverageNumberOfDilutedSharesOutstanding": {
        units: {
          shares: [
            { start: "2025-01-01", end: "2025-03-31", val: 3.0, accn: "sq1", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-05-01" },
            { start: "2025-04-01", end: "2025-06-30", val: 3.1, accn: "sq2", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-08-01" },
            { start: "2025-07-01", end: "2025-09-30", val: 3.2, accn: "sq3", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-11-01" },
            { start: "2025-01-01", end: "2025-12-31", val: 3.15, accn: "sfy", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01" }
          ]
        }
      }
    }
  }
} as const;

const syntheticBankSubmissions = {
  name: "Synthetic Bank Corp.",
  tickers: ["SBK"],
  sic: "6021",
  fiscalYearEnd: "1231",
  filings: { recent: {} }
} as const;

describe("statement service", () => {
  it("maps annual income statements into the normalized contract", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getStatement: async ({ ticker, statement, frequency, periods, includeTtm }) =>
          mapStatement({
            ticker,
            requestedStatement: statement,
            frequency,
            periods,
            includeTtm,
            companyFacts,
            submissions
          })
      }
    });

    const result = await service.getStatement({
      ticker: "AAPL",
      statement: "income_statement",
      frequency: "annual",
      view: "restated",
      format: "normalized",
      periods: 3,
      includeTtm: false,
      debug: false
    });

    expect(result.meta.titleSlug).toBe("AAPL_income-statement_Annual_Restated");
    expect(result.columns).toEqual(["2023", "2024", "2025"]);
    expect(result.periods["2025"].revenue_total).toBe(416161000000);
    expect(result.periods["2024"].eps_diluted).toBe(6.08);
    expect(result.meta.currency).toBe("USD");
  });

  it("formats matrix output with deterministic footer metadata", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    const matrix = formatMatrixStatement(statement);
    expect(matrix.columns).toEqual(["2024", "2025", "TTM"]);
    expect(matrix.rows[0]?.row_kind).toBe("section");
    expect(matrix.rows.find((row) => row.metric_code === "revenue_total")?.values).toEqual([
      500,
      540,
      540
    ]);
    expect(matrix.footer).toBe("Fiscal year ends in Sep 30 | USD");
  });

  it("rejects unsupported as-reported requests in the MVP", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getStatement: async () => {
          throw new Error("should not be called");
        }
      }
    });

    await expect(() =>
      service.getStatement({
        ticker: "AAPL",
        statement: "income_statement",
        frequency: "annual",
        view: "as_reported",
        format: "normalized",
        periods: 3,
        includeTtm: false,
        debug: false
      })
    ).rejects.toThrow("The SEC-first MVP currently supports only restated output.");
  });

  it("returns a compact normalized payload by default and exposes facts only in debug mode", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 3,
      includeTtm: false,
      companyFacts,
      submissions
    });

    const compact = formatNormalizedStatement(statement);
    expect("facts" in compact).toBe(false);
    expect(compact.debug).toBeUndefined();

    const debug = formatNormalizedStatement(statement, { debug: true });
    expect(debug.debug?.facts).toHaveLength(statement.facts.length);
    expect(debug.debug?.facts[0]?.metricCode).toBe("revenue_total");
  });

  it("builds quarterly statements with TTM and section rows", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "quarterly",
      periods: 4,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(statement.columns).toEqual(["2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "TTM"]);
    expect(statement.rows[0]).toMatchObject({
      label: "Revenue",
      rowKind: "section",
      depth: 0
    });
    expect(statement.periods.TTM.revenue_total).toBe(540);
    expect(statement.periods.TTM.shares_diluted).toBe(11.75);
    expect(statement.periods["2025-Q3"].net_income).toBe(30);
  });

  it("adds TTM to annual duration statements without polluting balance sheet output", () => {
    const incomeStatement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(incomeStatement.columns).toEqual(["2024", "2025", "TTM"]);
    expect(incomeStatement.periods.TTM.revenue_total).toBe(540);
    expect(incomeStatement.periods.TTM.shares_diluted).toBe(11.75);
  });

  it("uses annual proxies for per-share TTM metrics when quarter subtraction is invalid", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 1,
      includeTtm: true,
      companyFacts,
      submissions
    });

    expect(statement.periods.TTM.eps_diluted).toBe(7.46);
    expect(statement.periods.TTM.shares_diluted).toBe(15004697000);
  });

  it("uses the bank income template and derives revenue from bank-specific concepts", () => {
    const statement = mapStatement({
      ticker: "SBK",
      requestedStatement: "income_statement",
      frequency: "quarterly",
      periods: 4,
      includeTtm: true,
      companyFacts: syntheticBankCompanyFacts as never,
      submissions: syntheticBankSubmissions as never
    });

    expect(statement.rows.some((row) => row.metricCode === "gross_profit")).toBe(false);
    expect(statement.periods["2025-Q1"].interest_income_net).toBe(10);
    expect(statement.periods["2025-Q1"].noninterest_income).toBe(8);
    expect(statement.periods["2025-Q1"].revenue_total).toBe(18);
    expect(statement.periods.TTM.revenue_total).toBe(84);
    expect(statement.periods.TTM.eps_diluted).toBe(8.5);
    expect(statement.periods.TTM.shares_diluted).toBe(3.15);
  });
});
