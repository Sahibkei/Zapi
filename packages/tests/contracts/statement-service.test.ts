import companyFacts from "../fixtures/sec/aapl-companyfacts.json";
import submissions from "../fixtures/sec/aapl-submissions.json";
import syntheticQuarterlyCompanyFacts from "../fixtures/sec/synthetic-quarterly-companyfacts.json";
import syntheticQuarterlySubmissions from "../fixtures/sec/synthetic-quarterly-submissions.json";
import {
  createStatementService,
  formatMatrixCsv,
  formatMatrixStatement,
  formatNormalizedStatement
} from "../../core/src";
import { mapStatement } from "../../adapters/sec-edgar/src/mapper";

const secCapabilities = {
  regime: "sec_edgar" as const,
  status: "live" as const,
  identifierLabel: "ticker",
  identifierExample: "AAPL",
  statementSupport: "full" as const,
  notes: ["test"],
  requiredEnv: ["SEC_USER_AGENT"]
};

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

const syntheticRestatementCompanyFacts = {
  cik: 555555,
  entityName: "Restatement Example Inc.",
  facts: {
    "us-gaap": {
      "RevenueFromContractWithCustomerExcludingAssessedTax": {
        units: {
          USD: [
            { start: "2024-01-01", end: "2024-12-31", val: 1000, accn: "orig-rev", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
            { start: "2024-01-01", end: "2024-12-31", val: 1100, accn: "rest-rev", fy: 2024, fp: "FY", form: "10-K/A", filed: "2025-05-01" }
          ]
        }
      },
      "NetIncomeLoss": {
        units: {
          USD: [
            { start: "2024-01-01", end: "2024-12-31", val: 100, accn: "orig-ni", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
            { start: "2024-01-01", end: "2024-12-31", val: 120, accn: "rest-ni", fy: 2024, fp: "FY", form: "10-K/A", filed: "2025-05-01" }
          ]
        }
      },
      "EarningsPerShareDiluted": {
        units: {
          "USD/shares": [
            { start: "2024-01-01", end: "2024-12-31", val: 1.0, accn: "orig-eps", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
            { start: "2024-01-01", end: "2024-12-31", val: 1.2, accn: "rest-eps", fy: 2024, fp: "FY", form: "10-K/A", filed: "2025-05-01" }
          ]
        }
      },
      "WeightedAverageNumberOfDilutedSharesOutstanding": {
        units: {
          shares: [
            { start: "2024-01-01", end: "2024-12-31", val: 100, accn: "orig-sh", fy: 2024, fp: "FY", form: "10-K", filed: "2025-02-01" },
            { start: "2024-01-01", end: "2024-12-31", val: 100, accn: "rest-sh", fy: 2024, fp: "FY", form: "10-K/A", filed: "2025-05-01" }
          ]
        }
      }
    }
  }
} as const;

const syntheticRestatementSubmissions = {
  name: "Restatement Example Inc.",
  tickers: ["RST"],
  sic: "3571",
  fiscalYearEnd: "1231",
  filings: { recent: {} }
} as const;

describe("statement service", () => {
  it("maps annual income statements into the normalized contract", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getCapabilities: () => secCapabilities,
        getStatement: async ({ ticker, statement, frequency, view, periods, includeTtm }) =>
          mapStatement({
            ticker,
            requestedStatement: statement,
            frequency,
            view,
            periods,
            includeTtm,
            companyFacts,
            submissions
          })
      }
    });

    const result = await service.getStatement({
      ticker: "AAPL",
      regime: "sec_edgar",
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
    expect(result.meta.requestedPeriods).toBe(3);
    expect(result.meta.returnedPeriods).toBe(3);
    expect(result.meta.historyCoverage).toBe("full");
  });

  it("formats matrix output with deterministic footer metadata", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    const matrix = formatMatrixStatement(statement);
    expect(matrix.columns).toEqual(["2024", "2025"]);
    expect(matrix.rows[0]?.row_kind).toBe("metric");
    expect(matrix.rows[0]?.label).toBe("Gross Profit");
    expect(matrix.rows.find((row) => row.metric_code === "revenue_total")?.values).toEqual([500, 540]);
    expect(matrix.footer).toBe("Fiscal year ends in Sep 30 | USD");
  });

  it("formats workbook-style matrix csv with title row, indentation, and footer", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    const csv = formatMatrixCsv(formatMatrixStatement(statement));
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe("SYN_income-statement_Annual_Restated,2024,2025");
    expect(lines[1]).toBe("Gross Profit,210,220");
    expect(lines[2]).toBe("    Total Revenue,500,540");
    expect(lines.at(-1)).toBe("Fiscal year ends in Sep 30 | USD,,");
  });

  it("adds formatted display values in thousands with parentheses for negatives", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 3,
      includeTtm: false,
      companyFacts,
      submissions
    });

    const matrix = formatMatrixStatement(statement);
    const revenueRow = matrix.rows.find((row) => row.metric_code === "revenue_total");
    const costRow = matrix.rows.find((row) => row.metric_code === "cost_of_revenue");
    const epsRow = matrix.rows.find((row) => row.metric_code === "eps_diluted");

    expect(matrix.meta.displayScale).toBe("thousands_when_large");
    expect(revenueRow?.display_values).toEqual(["383,285,000", "391,035,000", "416,161,000"]);
    expect(costRow?.display_values).toEqual(["(214,137,000)", "(210,352,000)", "(220,960,000)"]);
    expect(epsRow?.display_values).toEqual(["6.13", "6.08", "7.46"]);
  });

  it("allows as-reported requests through the service layer", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getCapabilities: () => secCapabilities,
        getStatement: async ({ ticker, statement, frequency, view, periods, includeTtm }) =>
          mapStatement({
            ticker,
            requestedStatement: statement,
            frequency,
            view,
            periods,
            includeTtm,
            companyFacts: syntheticRestatementCompanyFacts as never,
            submissions: syntheticRestatementSubmissions as never
          })
      }
    });

    const statement = await service.getStatement({
      ticker: "RST",
      regime: "sec_edgar",
      statement: "income_statement",
      frequency: "annual",
      view: "as_reported",
      format: "normalized",
      periods: 1,
      includeTtm: true,
      debug: false
    });

    expect(statement.meta.view).toBe("as_reported");
    expect(statement.periods["2024"].revenue_total).toBe(1000);
  });

  it("returns a compact normalized payload by default and exposes facts only in debug mode", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
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
    expect(debug.debug?.facts[0]?.metricCode).toBe("gross_profit");
  });

  it("builds quarterly statements with TTM and section rows", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "quarterly",
      view: "restated",
      periods: 4,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(statement.columns).toEqual(["2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "TTM"]);
    expect(statement.rows[0]).toMatchObject({
      label: "Gross Profit",
      rowKind: "metric",
      depth: 0
    });
    expect(statement.periods.TTM.revenue_total).toBe(540);
    expect(statement.periods.TTM.shares_diluted).toBe(11.75);
    expect(statement.periods["2025-Q3"].net_income).toBe(30);
  });

  it("does not append TTM to annual statements", () => {
    const incomeStatement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(incomeStatement.columns).toEqual(["2024", "2025"]);
    expect(incomeStatement.periods.TTM).toBeUndefined();
  });

  it("does not emit annual TTM proxy columns for per-share metrics", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 1,
      includeTtm: true,
      companyFacts,
      submissions
    });

    expect(statement.columns).toEqual(["2025"]);
    expect(statement.periods.TTM).toBeUndefined();
  });

  it("uses the bank income template and derives revenue from bank-specific concepts", () => {
    const statement = mapStatement({
      ticker: "SBK",
      requestedStatement: "income_statement",
      frequency: "quarterly",
      view: "restated",
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

  it("distinguishes restated from as-reported when later filings revise the same period", () => {
    const restated = mapStatement({
      ticker: "RST",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "restated",
      periods: 1,
      includeTtm: true,
      companyFacts: syntheticRestatementCompanyFacts as never,
      submissions: syntheticRestatementSubmissions as never
    });

    const asReported = mapStatement({
      ticker: "RST",
      requestedStatement: "income_statement",
      frequency: "annual",
      view: "as_reported",
      periods: 1,
      includeTtm: true,
      companyFacts: syntheticRestatementCompanyFacts as never,
      submissions: syntheticRestatementSubmissions as never
    });

    expect(restated.meta.titleSlug).toBe("RST_income-statement_Annual_Restated");
    expect(asReported.meta.titleSlug).toBe("RST_income-statement_Annual_AsReported");
    expect(restated.periods["2024"].revenue_total).toBe(1100);
    expect(asReported.periods["2024"].revenue_total).toBe(1000);
    expect(restated.periods.TTM).toBeUndefined();
    expect(asReported.periods.TTM).toBeUndefined();
  });

  it("routes non-US requests through the selected adapter and exposes regime capabilities", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getCapabilities: () => secCapabilities,
        getStatement: async () => {
          throw new Error("sec adapter should not be called");
        }
      },
      companiesHouseClient: {
        getCapabilities: () => ({
          regime: "companies_house",
          status: "scaffolded",
          identifierLabel: "company number",
          identifierExample: "00001995",
          statementSupport: "parser_pending",
          notes: ["test"],
          requiredEnv: ["COMPANIES_HOUSE_API_KEY"]
        }),
        getStatement: async ({ identifier }) =>
          mapStatement({
            ticker: identifier,
            requestedStatement: "income_statement",
            frequency: "annual",
            view: "restated",
            periods: 1,
            includeTtm: false,
            companyFacts: syntheticRestatementCompanyFacts as never,
            submissions: syntheticRestatementSubmissions as never
          })
      }
    });

    const statement = await service.getStatement({
      ticker: "00001995",
      regime: "companies_house",
      statement: "income_statement",
      frequency: "annual",
      view: "restated",
      format: "normalized",
      periods: 1,
      includeTtm: false,
      debug: false
    });

    expect(statement.meta.ticker).toBe("00001995");
    expect(service.listRegimes().map((regime) => regime.regime)).toEqual([
      "sec_edgar",
      "companies_house",
      "edinet",
      "india_placeholder"
    ]);
  });
});
