import YahooFinance from "yahoo-finance2";
import {
  NotFoundError,
  UpstreamError,
  type AdapterCapabilities,
  type CanonicalFact,
  type NormalizedStatementResponse,
  type SectorProfile,
  type StatementFrequency,
  type StatementRow,
  type StatementSourceRegime,
  type StatementType,
  type StatementView
} from "../../../core/src";

type ProviderSearchQuote = {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  typeDisp?: string;
};

type ProviderQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  fullExchangeName?: string;
  currency?: string;
  financialCurrency?: string;
};

type ProviderFinancialRow = Record<string, unknown> & {
  date: Date;
  periodType?: string;
};

export interface PublicFinancialsProvider {
  search(query: string): Promise<ProviderSearchQuote[]>;
  quote(symbol: string): Promise<ProviderQuote>;
  fundamentals(
    symbol: string,
    options: {
      type: "annual" | "quarterly" | "trailing";
      startDate: string;
    }
  ): Promise<ProviderFinancialRow[]>;
}

export interface RegionalPublicClientOptions {
  regime: StatementSourceRegime;
  label: string;
  identifierLabel: string;
  identifierExample: string;
  aliases?: Record<string, string>;
  preferredSuffixes?: string[];
  preferredExchanges?: string[];
  provider?: PublicFinancialsProvider;
  qualityFlags?: string[];
  asReportedQualityFlags?: string[];
  capabilityNotes?: string[];
  requiredEnv?: string[];
}

type MetricDef = {
  metricCode: string;
  label: string;
  depth: number;
  unit: string;
  rowKind: "section" | "metric";
  sourceConcept?: string;
  getValue?: (row: ProviderFinancialRow, currency: string) => number | null;
};

type ResolvedSymbol = {
  requestedIdentifier: string;
  symbol: string;
  companyName: string;
  currency: string;
  exchange: string;
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

function createYahooProvider(): PublicFinancialsProvider {
  return {
    async search(query: string) {
      const result = await yahooFinance.search(query, {
        quotesCount: 8,
        newsCount: 0,
        enableFuzzyQuery: false
      });
      return result.quotes.map((quote) => ({
        symbol: typeof quote.symbol === "string" ? quote.symbol : undefined,
        shortname: typeof quote.shortname === "string" ? quote.shortname : undefined,
        longname: typeof quote.longname === "string" ? quote.longname : undefined,
        exchange: typeof quote.exchange === "string" ? quote.exchange : undefined,
        typeDisp: typeof quote.typeDisp === "string" ? quote.typeDisp : undefined
      }));
    },
    async quote(symbol: string) {
      const quote = await yahooFinance.quote(symbol);
      return {
        symbol: typeof quote.symbol === "string" ? quote.symbol : undefined,
        shortName: typeof quote.shortName === "string" ? quote.shortName : undefined,
        longName: typeof quote.longName === "string" ? quote.longName : undefined,
        fullExchangeName: typeof quote.fullExchangeName === "string" ? quote.fullExchangeName : undefined,
        currency: typeof quote.currency === "string" ? quote.currency : undefined,
        financialCurrency: typeof quote.financialCurrency === "string" ? quote.financialCurrency : undefined
      };
    },
    async fundamentals(symbol: string, options) {
      const result = await yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: options.startDate,
        type: options.type,
        module: "all"
      });
      return result as ProviderFinancialRow[];
    }
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickNumber(row: ProviderFinancialRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function negative(row: ProviderFinancialRow, keys: string[]): number | null {
  const value = pickNumber(row, keys);
  if (value === null) {
    return null;
  }
  return value > 0 ? -value : value;
}

function positive(row: ProviderFinancialRow, keys: string[]): number | null {
  const value = pickNumber(row, keys);
  if (value === null) {
    return null;
  }
  return value < 0 ? -value : value;
}

function derive(compute: () => number | null): number | null {
  const value = compute();
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatFiscalYearEnd(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).replace(",", "");
}

function annualLabel(date: Date): string {
  return date.getUTCFullYear().toString();
}

function quarterlyLabel(date: Date): string {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function titleStatementSlug(statement: StatementType): string {
  return statement.replaceAll("_", "-");
}

function titleViewSlug(view: StatementView): string {
  return view === "restated" ? "Restated" : "AsReported";
}

function startDateForRequest(frequency: StatementFrequency, periods: number): string {
  const currentYear = new Date().getUTCFullYear();
  if (frequency === "annual") {
    return `${currentYear - Math.max(periods + 2, 8)}-01-01`;
  }
  return `${currentYear - Math.max(Math.ceil(periods / 4) + 2, 4)}-01-01`;
}

function inferSector(rows: ProviderFinancialRow[]): SectorProfile {
  const latest = [...rows].reverse().find((row) =>
    pickNumber(row, [
      "totalRevenue",
      "operatingRevenue",
      "grossProfit",
      "operatingIncome",
      "netIncome",
      "netIncomeCommonStockholders",
      "totalDeposits",
      "netLoan"
    ]) !== null
  );
  if (!latest) {
    return "unknown";
  }

  if (
    pickNumber(latest, ["totalDeposits", "netLoan"]) !== null ||
    (
      pickNumber(latest, ["netInterestIncome"]) !== null &&
      pickNumber(latest, ["nonInterestIncome"]) !== null &&
      pickNumber(latest, ["grossProfit", "costOfRevenue"]) === null
    )
  ) {
    return "bank";
  }

  return "industrial";
}

function hasTemplateValues(
  row: ProviderFinancialRow,
  template: MetricDef[],
  currency: string
): boolean {
  return template.some((definition) =>
    definition.rowKind === "metric" &&
    definition.getValue !== undefined &&
    definition.getValue(row, currency) !== null
  );
}

function trimLeadingEmptyPeriods(
  rows: ProviderFinancialRow[],
  template: MetricDef[],
  currency: string
): ProviderFinancialRow[] {
  let startIndex = 0;
  while (startIndex < rows.length && !hasTemplateValues(rows[startIndex], template, currency)) {
    startIndex += 1;
  }
  return rows.slice(startIndex);
}

function incomeTemplate(sector: SectorProfile): MetricDef[] {
  if (sector === "bank") {
    return [
      { metricCode: "section_revenue", label: "Revenue", depth: 0, unit: "", rowKind: "section" },
      { metricCode: "interest_income", label: "Interest Income", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "interestIncome", getValue: (row) => pickNumber(row, ["interestIncome"]) },
      { metricCode: "interest_expense", label: "Interest Expense", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "interestExpense", getValue: (row) => negative(row, ["interestExpense"]) },
      { metricCode: "interest_income_net", label: "Net Interest Income", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "netInterestIncome", getValue: (row) => pickNumber(row, ["netInterestIncome"]) },
      { metricCode: "fees_commission_income", label: "Fee and Commission Income", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "feesAndCommissions", getValue: (row) => pickNumber(row, ["feesAndCommissions", "feesandCommissionIncome"]) },
      { metricCode: "fees_commission_expense", label: "Fee and Commission Expense", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "feesandCommissionExpense", getValue: (row) => negative(row, ["feesandCommissionExpense"]) },
      { metricCode: "noninterest_income", label: "Noninterest Income", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "nonInterestIncome", getValue: (row) => pickNumber(row, ["nonInterestIncome"]) },
      {
        metricCode: "revenue_total",
        label: "Total Revenue",
        depth: 1,
        unit: "USD",
        rowKind: "metric",
        sourceConcept: "totalRevenue",
        getValue: (row) =>
          pickNumber(row, ["totalRevenue", "operatingRevenue"]) ??
          derive(() => {
            const netInterestIncome = pickNumber(row, ["netInterestIncome"]);
            const nonInterestIncome = pickNumber(row, ["nonInterestIncome"]);
            if (netInterestIncome === null || nonInterestIncome === null) {
              return null;
            }
            return netInterestIncome + nonInterestIncome;
          })
      },
      { metricCode: "operating_expenses", label: "Operating Expenses", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "operatingExpense", getValue: (row) => negative(row, ["operatingExpense"]) },
      { metricCode: "selling_general_admin", label: "Selling, General and Administrative Expenses", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "sellingGeneralAndAdministration", getValue: (row) => negative(row, ["sellingGeneralAndAdministration", "generalAndAdministrativeExpense"]) },
      { metricCode: "pretax_income", label: "Pretax Income", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "pretaxIncome", getValue: (row) => pickNumber(row, ["pretaxIncome"]) },
      { metricCode: "income_tax_provision", label: "Provision for Income Tax", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "taxProvision", getValue: (row) => negative(row, ["taxProvision"]) },
      {
        metricCode: "net_income",
        label: "Net Income",
        depth: 0,
        unit: "USD",
        rowKind: "metric",
        sourceConcept: "netIncome",
        getValue: (row) => pickNumber(row, ["netIncomeCommonStockholders", "netIncome", "netIncomeFromContinuingOperationNetMinorityInterest"])
      },
      { metricCode: "eps_basic", label: "Basic EPS", depth: 0, unit: "USD/shares", rowKind: "metric", sourceConcept: "basicEPS", getValue: (row) => pickNumber(row, ["basicEPS"]) },
      { metricCode: "eps_diluted", label: "Diluted EPS", depth: 0, unit: "USD/shares", rowKind: "metric", sourceConcept: "dilutedEPS", getValue: (row) => pickNumber(row, ["dilutedEPS"]) },
      { metricCode: "shares_basic", label: "Basic Weighted Average Shares Outstanding", depth: 0, unit: "shares", rowKind: "metric", sourceConcept: "basicAverageShares", getValue: (row) => pickNumber(row, ["basicAverageShares"]) },
      { metricCode: "shares_diluted", label: "Diluted Weighted Average Shares Outstanding", depth: 0, unit: "shares", rowKind: "metric", sourceConcept: "dilutedAverageShares", getValue: (row) => pickNumber(row, ["dilutedAverageShares"]) }
    ];
  }

  return [
    { metricCode: "gross_profit", label: "Gross Profit", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "grossProfit", getValue: (row) => pickNumber(row, ["grossProfit"]) },
    { metricCode: "revenue_total", label: "Total Revenue", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "totalRevenue", getValue: (row) => pickNumber(row, ["totalRevenue", "operatingRevenue"]) },
    { metricCode: "business_revenue", label: "Business Revenue", depth: 2, unit: "USD", rowKind: "metric", sourceConcept: "operatingRevenue", getValue: (row) => pickNumber(row, ["operatingRevenue", "totalRevenue"]) },
    { metricCode: "cost_of_revenue", label: "Cost of Revenue", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "costOfRevenue", getValue: (row) => negative(row, ["costOfRevenue"]) },
    { metricCode: "cost_of_goods_services", label: "Cost of Goods and Services", depth: 2, unit: "USD", rowKind: "metric", sourceConcept: "costOfRevenue", getValue: (row) => negative(row, ["costOfRevenue"]) },
    { metricCode: "operating_income_expenses", label: "Operating Income/Expenses", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "operatingExpense", getValue: (row) => negative(row, ["operatingExpense"]) },
    { metricCode: "selling_general_admin", label: "Selling, General and Administrative Expenses", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "sellingGeneralAndAdministration", getValue: (row) => negative(row, ["sellingGeneralAndAdministration", "sellingAndMarketingExpense"]) },
    { metricCode: "research_development", label: "Research and Development Expenses", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "researchAndDevelopment", getValue: (row) => negative(row, ["researchAndDevelopment"]) },
    { metricCode: "employee_benefit_expense", label: "Employee Benefit Expense", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "employeeBenefitExpense", getValue: (row) => negative(row, ["employeeBenefitExpense"]) },
    { metricCode: "other_operating_expenses", label: "Other Operating Expenses", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "otherOperatingExpenses", getValue: (row) => negative(row, ["otherOperatingExpenses", "otherExpenses"]) },
    { metricCode: "total_operating_profit_loss", label: "Total Operating Profit/Loss", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "operatingIncome", getValue: (row) => pickNumber(row, ["operatingIncome", "totalOperatingIncomeAsReported"]) },
    { metricCode: "operating_income", label: "Operating Income", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "operatingIncome", getValue: (row) => pickNumber(row, ["operatingIncome", "totalOperatingIncomeAsReported"]) },
    {
      metricCode: "non_operating_income_expense_total",
      label: "Non-Operating Income/Expense, Total",
      depth: 0,
      unit: "USD",
      rowKind: "metric",
      sourceConcept: "otherNonOperatingIncomeExpenses",
      getValue: (row) =>
        pickNumber(row, ["otherNonOperatingIncomeExpenses"]) ??
        derive(() => {
          const pretaxIncome = pickNumber(row, ["pretaxIncome"]);
          const operatingIncome = pickNumber(row, ["operatingIncome", "totalOperatingIncomeAsReported"]);
          if (pretaxIncome === null || operatingIncome === null) {
            return null;
          }
          return pretaxIncome - operatingIncome;
        })
    },
    { metricCode: "other_income_expense_non_operating", label: "Other Income/Expense, Non-Operating", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "otherNonOperatingIncomeExpenses", getValue: (row) => pickNumber(row, ["otherNonOperatingIncomeExpenses", "otherIncomeExpense", "otherSpecialCharges"]) },
    { metricCode: "finance_costs", label: "Finance Costs", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "financeCosts", getValue: (row) => negative(row, ["financeCosts", "interestExpense"]) },
    { metricCode: "equity_method_income", label: "Share of Profit/Loss of Associates and Joint Ventures", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "equityMethodIncome", getValue: (row) => pickNumber(row, ["equityMethodIncome"]) },
    { metricCode: "pretax_income", label: "Pretax Income", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "pretaxIncome", getValue: (row) => pickNumber(row, ["pretaxIncome"]) },
    { metricCode: "income_tax_provision", label: "Provision for Income Tax", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "taxProvision", getValue: (row) => negative(row, ["taxProvision"]) },
    { metricCode: "current_tax", label: "Current Tax", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "currentTax", getValue: (row) => negative(row, ["currentTax"]) },
    { metricCode: "deferred_tax", label: "Deferred Tax", depth: 1, unit: "USD", rowKind: "metric", sourceConcept: "deferredTax", getValue: (row) => negative(row, ["deferredTax"]) },
    { metricCode: "net_income_before_extraordinary", label: "Net Income before Extraordinary Items and Discontinued Operations", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "netIncomeFromContinuingOperationNetMinorityInterest", getValue: (row) => pickNumber(row, ["netIncomeFromContinuingOperationNetMinorityInterest", "netIncomeContinuousOperations", "netIncomeFromContinuingOperations", "netIncome"]) },
    { metricCode: "net_income_after_extraordinary", label: "Net Income after Extraordinary Items and Discontinued Operations", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "netIncomeFromContinuingAndDiscontinuedOperation", getValue: (row) => pickNumber(row, ["netIncomeFromContinuingAndDiscontinuedOperation", "netIncome", "netIncomeCommonStockholders"]) },
    { metricCode: "net_income_after_non_controlling_interests", label: "Net Income after Non-Controlling/Minority Interests", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "netIncomeFromContinuingOperationNetMinorityInterest", getValue: (row) => pickNumber(row, ["netIncomeFromContinuingOperationNetMinorityInterest", "netIncomeCommonStockholders", "netIncome"]) },
    { metricCode: "net_income_available_to_common_stockholders", label: "Net Income Available to Common Stockholders", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "netIncomeCommonStockholders", getValue: (row) => pickNumber(row, ["netIncomeCommonStockholders", "netIncome"]) },
    { metricCode: "diluted_net_income_available_to_common_stockholders", label: "Diluted Net Income Available to Common Stockholders", depth: 0, unit: "USD", rowKind: "metric", sourceConcept: "dilutedNIAvailtoComStockholders", getValue: (row) => pickNumber(row, ["dilutedNIAvailtoComStockholders", "netIncomeCommonStockholders", "netIncome"]) },
    { metricCode: "eps_basic", label: "Basic EPS", depth: 0, unit: "USD/shares", rowKind: "metric", sourceConcept: "basicEPS", getValue: (row) => pickNumber(row, ["basicEPS"]) },
    { metricCode: "eps_diluted", label: "Diluted EPS", depth: 0, unit: "USD/shares", rowKind: "metric", sourceConcept: "dilutedEPS", getValue: (row) => pickNumber(row, ["dilutedEPS"]) },
    { metricCode: "shares_basic", label: "Basic Weighted Average Shares Outstanding", depth: 0, unit: "shares", rowKind: "metric", sourceConcept: "basicAverageShares", getValue: (row) => pickNumber(row, ["basicAverageShares"]) },
    { metricCode: "shares_diluted", label: "Diluted Weighted Average Shares Outstanding", depth: 0, unit: "shares", rowKind: "metric", sourceConcept: "dilutedAverageShares", getValue: (row) => pickNumber(row, ["dilutedAverageShares"]) },
    {
      metricCode: "dividend_per_share_total",
      label: "Total Dividend Per Share",
      depth: 0,
      unit: "USD/shares",
      rowKind: "metric",
      sourceConcept: "cashDividendsPaid",
      getValue: (row) =>
        derive(() => {
          const dividend = positive(row, ["cashDividendsPaid", "commonStockDividendPaid"]);
          const shares = pickNumber(row, ["basicAverageShares", "dilutedAverageShares"]);
          if (dividend === null || shares === null || shares === 0) {
            return null;
          }
          return dividend / shares;
        })
    }
  ];
}

function balanceTemplate(currency: string): MetricDef[] {
  return [
    { metricCode: "total_assets", label: "Total Assets", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "totalAssets", getValue: (row) => pickNumber(row, ["totalAssets"]) },
    { metricCode: "total_current_assets", label: "Total Current Assets", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "currentAssets", getValue: (row) => pickNumber(row, ["currentAssets"]) },
    { metricCode: "cash_short_term_investments", label: "Cash, Cash Equivalents and Short Term Investments", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "cashCashEquivalentsAndShortTermInvestments", getValue: (row) => pickNumber(row, ["cashCashEquivalentsAndShortTermInvestments"]) },
    { metricCode: "cash_cash_equivalents", label: "Cash and Cash Equivalents", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "cashAndCashEquivalents", getValue: (row) => pickNumber(row, ["cashAndCashEquivalents"]) },
    { metricCode: "cash", label: "Cash", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "cashFinancial", getValue: (row) => pickNumber(row, ["cashFinancial", "cashAndCashEquivalents"]) },
    { metricCode: "cash_equivalents", label: "Cash Equivalents", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "cashEquivalents", getValue: (row) => pickNumber(row, ["cashEquivalents"]) },
    { metricCode: "short_term_investments", label: "Short Term Investments", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "otherShortTermInvestments", getValue: (row) => pickNumber(row, ["otherShortTermInvestments", "availableForSaleSecurities"]) },
    { metricCode: "other_short_term_investments", label: "Other Short Term Investments", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "otherShortTermInvestments", getValue: (row) => pickNumber(row, ["otherShortTermInvestments", "availableForSaleSecurities"]) },
    { metricCode: "inventories", label: "Inventories", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "inventory", getValue: (row) => pickNumber(row, ["inventory"]) },
    { metricCode: "trade_other_receivables_current", label: "Trade and Other Receivables, Current", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "receivables", getValue: (row) => pickNumber(row, ["receivables", "accountsReceivable"]) },
    { metricCode: "trade_accounts_receivable_current", label: "Trade/Accounts Receivable, Current", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "accountsReceivable", getValue: (row) => pickNumber(row, ["accountsReceivable"]) },
    { metricCode: "gross_trade_accounts_receivable_current", label: "Gross Trade/Accounts Receivable, Current", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "accountsReceivable", getValue: (row) => pickNumber(row, ["accountsReceivable"]) },
    { metricCode: "allowance_trade_accounts_receivable_current", label: "Allowance/Adjustments for Trade/Accounts Receivable, Current", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "receivablesAdjustmentsAllowances", getValue: (row) => pickNumber(row, ["receivablesAdjustmentsAllowances"]) },
    { metricCode: "other_receivables_current", label: "Other Receivables, Current", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "otherReceivables", getValue: (row) => pickNumber(row, ["otherReceivables"]) },
    { metricCode: "other_current_assets", label: "Other Current Assets", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "otherCurrentAssets", getValue: (row) => pickNumber(row, ["otherCurrentAssets"]) },
    { metricCode: "total_non_current_assets", label: "Total Non-Current Assets", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "totalNonCurrentAssets", getValue: (row) => pickNumber(row, ["totalNonCurrentAssets"]) },
    { metricCode: "net_property_plant_equipment", label: "Net Property, Plant and Equipment", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "netPPE", getValue: (row) => pickNumber(row, ["netPPE"]) },
    { metricCode: "gross_property_plant_equipment", label: "Gross Property, Plant and Equipment", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "grossPPE", getValue: (row) => pickNumber(row, ["grossPPE"]) },
    { metricCode: "accumulated_depreciation_impairment", label: "Accumulated Depreciation and Impairment", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "accumulatedDepreciation", getValue: (row) => pickNumber(row, ["accumulatedDepreciation"]) },
    { metricCode: "total_long_term_investments", label: "Total Long Term Investments", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "investmentsAndAdvances", getValue: (row) => pickNumber(row, ["investmentsAndAdvances", "investmentinFinancialAssets"]) },
    { metricCode: "deferred_tax_assets_non_current", label: "Deferred Tax Assets, Non-Current", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "nonCurrentDeferredTaxesAssets", getValue: (row) => pickNumber(row, ["nonCurrentDeferredTaxesAssets", "deferredTaxAssets"]) },
    { metricCode: "other_non_current_assets", label: "Other Non-Current Assets", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "otherNonCurrentAssets", getValue: (row) => pickNumber(row, ["otherNonCurrentAssets"]) },
    { metricCode: "total_liabilities", label: "Total Liabilities", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "totalLiabilitiesNetMinorityInterest", getValue: (row) => pickNumber(row, ["totalLiabilitiesNetMinorityInterest"]) },
    { metricCode: "total_current_liabilities", label: "Total Current Liabilities", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "currentLiabilities", getValue: (row) => pickNumber(row, ["currentLiabilities"]) },
    { metricCode: "payables_and_accrued_expenses_current", label: "Payables and Accrued Expenses, Current", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "payablesAndAccruedExpenses", getValue: (row) => pickNumber(row, ["payablesAndAccruedExpenses", "payables"]) },
    { metricCode: "current_debt", label: "Current Debt", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "currentDebtAndCapitalLeaseObligation", getValue: (row) => pickNumber(row, ["currentDebtAndCapitalLeaseObligation", "currentDebt"]) },
    { metricCode: "other_current_liabilities", label: "Other Current Liabilities", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "otherCurrentLiabilities", getValue: (row) => pickNumber(row, ["otherCurrentLiabilities"]) },
    { metricCode: "total_non_current_liabilities", label: "Total Non-Current Liabilities", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "totalNonCurrentLiabilitiesNetMinorityInterest", getValue: (row) => pickNumber(row, ["totalNonCurrentLiabilitiesNetMinorityInterest"]) },
    { metricCode: "long_term_debt", label: "Long Term Debt", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "longTermDebtAndCapitalLeaseObligation", getValue: (row) => pickNumber(row, ["longTermDebtAndCapitalLeaseObligation", "longTermDebt"]) },
    { metricCode: "other_non_current_liabilities", label: "Other Non-Current Liabilities", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "otherNonCurrentLiabilities", getValue: (row) => pickNumber(row, ["otherNonCurrentLiabilities"]) },
    { metricCode: "stockholders_equity", label: "Stockholders Equity", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "stockholdersEquity", getValue: (row) => pickNumber(row, ["stockholdersEquity", "commonStockEquity"]) },
    { metricCode: "minority_interest", label: "Minority Interest", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "minorityInterest", getValue: (row) => pickNumber(row, ["minorityInterest"]) },
    { metricCode: "total_equity", label: "Total Equity", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "totalEquityGrossMinorityInterest", getValue: (row) => pickNumber(row, ["totalEquityGrossMinorityInterest", "stockholdersEquity"]) }
  ];
}

function cashFlowTemplate(currency: string): MetricDef[] {
  return [
    { metricCode: "operating_cash_flow", label: "Cash Flow from Operating Activities, Indirect", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "operatingCashFlow", getValue: (row) => pickNumber(row, ["operatingCashFlow", "cashFlowFromContinuingOperatingActivities"]) },
    { metricCode: "net_cash_flow_continuing_operating", label: "Net Cash Flow from Continuing Operating Activities, Indirect", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "cashFlowFromContinuingOperatingActivities", getValue: (row) => pickNumber(row, ["cashFlowFromContinuingOperatingActivities", "operatingCashFlow"]) },
    { metricCode: "cash_generated_from_operating_activities", label: "Cash Generated from Operating Activities", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "operatingCashFlow", getValue: (row) => pickNumber(row, ["operatingCashFlow"]) },
    { metricCode: "income_before_non_cash_adjustment", label: "Income/Loss before Non-Cash Adjustment", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "netIncome", getValue: (row) => pickNumber(row, ["netIncome", "netIncomeCommonStockholders"]) },
    { metricCode: "total_adjustments_non_cash_items", label: "Total Adjustments for Non-Cash Items", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "otherNonCashItems", getValue: (row) => pickNumber(row, ["otherNonCashItems"]) },
    { metricCode: "depreciation_amortization_non_cash_adjustment", label: "Depreciation, Amortization and Depletion, Non-Cash Adjustment", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "depreciationAndAmortization", getValue: (row) => pickNumber(row, ["depreciationAndAmortization", "reconciledDepreciation"]) },
    { metricCode: "depreciation_amortization", label: "Depreciation and Amortization, Non-Cash Adjustment", depth: 4, unit: currency, rowKind: "metric", sourceConcept: "depreciationAndAmortization", getValue: (row) => pickNumber(row, ["depreciationAndAmortization", "reconciledDepreciation"]) },
    { metricCode: "stock_based_compensation", label: "Stock-Based Compensation, Non-Cash Adjustment", depth: 4, unit: currency, rowKind: "metric", sourceConcept: "stockBasedCompensation", getValue: (row) => pickNumber(row, ["stockBasedCompensation"]) },
    { metricCode: "other_non_cash_items", label: "Other Non-Cash Items", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "otherNonCashItems", getValue: (row) => pickNumber(row, ["otherNonCashItems"]) },
    { metricCode: "changes_in_operating_capital", label: "Changes in Operating Capital", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "changeInWorkingCapital", getValue: (row) => pickNumber(row, ["changeInWorkingCapital"]) },
    { metricCode: "change_in_inventory", label: "Change in Inventories", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "changeInInventory", getValue: (row) => pickNumber(row, ["changeInInventory"]) },
    { metricCode: "change_in_trade_other_receivables", label: "Change in Trade and Other Receivables", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "changeInReceivables", getValue: (row) => pickNumber(row, ["changeInReceivables"]) },
    { metricCode: "change_in_trade_accounts_receivable", label: "Change in Trade/Accounts Receivable", depth: 4, unit: currency, rowKind: "metric", sourceConcept: "changesInAccountReceivables", getValue: (row) => pickNumber(row, ["changesInAccountReceivables", "changeInReceivables"]) },
    { metricCode: "change_in_other_current_assets", label: "Change in Other Current Assets", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "changeInOtherCurrentAssets", getValue: (row) => pickNumber(row, ["changeInOtherCurrentAssets"]) },
    { metricCode: "change_in_payables_and_accrued_expenses", label: "Change in Payables and Accrued Expenses", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "changeInPayablesAndAccruedExpense", getValue: (row) => pickNumber(row, ["changeInPayablesAndAccruedExpense", "changeInPayable"]) },
    { metricCode: "change_in_trade_other_payables", label: "Change in Trade and Other Payables", depth: 4, unit: currency, rowKind: "metric", sourceConcept: "changeInPayable", getValue: (row) => pickNumber(row, ["changeInPayable"]) },
    { metricCode: "change_in_trade_accounts_payable", label: "Change in Trade/Accounts Payable", depth: 4, unit: currency, rowKind: "metric", sourceConcept: "changeInPayable", getValue: (row) => pickNumber(row, ["changeInPayable"]) },
    { metricCode: "change_in_other_current_liabilities", label: "Change in Other Current Liabilities", depth: 3, unit: currency, rowKind: "metric", sourceConcept: "changeInOtherCurrentLiabilities", getValue: (row) => pickNumber(row, ["changeInOtherCurrentLiabilities"]) },
    { metricCode: "investing_cash_flow", label: "Cash Flow from Investing Activities", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "investingCashFlow", getValue: (row) => pickNumber(row, ["investingCashFlow", "cashFlowFromContinuingInvestingActivities"]) },
    { metricCode: "cash_flow_continuing_investing", label: "Cash Flow from Continuing Investing Activities", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "cashFlowFromContinuingInvestingActivities", getValue: (row) => pickNumber(row, ["cashFlowFromContinuingInvestingActivities", "investingCashFlow"]) },
    { metricCode: "purchase_sale_pp&e_net", label: "Purchase/Sale and Disposal of Property, Plant and Equipment, Net", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "netPPEPurchaseAndSale", getValue: (row) => pickNumber(row, ["netPPEPurchaseAndSale"]) },
    { metricCode: "purchase_property_plant_equipment", label: "Purchase of Property, Plant and Equipment", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "purchaseOfPPE", getValue: (row) => pickNumber(row, ["purchaseOfPPE", "capitalExpenditure"]) },
    { metricCode: "purchase_sale_investments_net", label: "Purchase/Sale of Investments, Net", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "netInvestmentPurchaseAndSale", getValue: (row) => pickNumber(row, ["netInvestmentPurchaseAndSale"]) },
    { metricCode: "purchase_of_investments", label: "Purchase of Investments", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "purchaseOfInvestment", getValue: (row) => pickNumber(row, ["purchaseOfInvestment"]) },
    { metricCode: "sale_of_investments", label: "Sale of Investments", depth: 2, unit: currency, rowKind: "metric", sourceConcept: "saleOfInvestment", getValue: (row) => pickNumber(row, ["saleOfInvestment"]) },
    { metricCode: "financing_cash_flow", label: "Cash Flow from Financing Activities", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "financingCashFlow", getValue: (row) => pickNumber(row, ["financingCashFlow", "cashFlowFromContinuingFinancingActivities"]) },
    { metricCode: "cash_flow_continuing_financing", label: "Cash Flow from Continuing Financing Activities", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "cashFlowFromContinuingFinancingActivities", getValue: (row) => pickNumber(row, ["cashFlowFromContinuingFinancingActivities", "financingCashFlow"]) },
    { metricCode: "issuance_of_debt", label: "Issuance of Debt", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "issuanceOfDebt", getValue: (row) => pickNumber(row, ["issuanceOfDebt"]) },
    { metricCode: "repayment_of_debt", label: "Repayment of Debt", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "repaymentOfDebt", getValue: (row) => pickNumber(row, ["repaymentOfDebt", "longTermDebtPayments"]) },
    { metricCode: "cash_dividends_paid", label: "Cash Dividends Paid", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "cashDividendsPaid", getValue: (row) => pickNumber(row, ["cashDividendsPaid", "commonStockDividendPaid"]) },
    { metricCode: "change_in_cash", label: "Change in Cash", depth: 0, unit: currency, rowKind: "metric", sourceConcept: "changesInCash", getValue: (row) => pickNumber(row, ["changesInCash"]) },
    { metricCode: "cash_and_cash_equivalents_end_of_period", label: "Cash and Cash Equivalents, End of Period", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "endCashPosition", getValue: (row) => pickNumber(row, ["endCashPosition", "cashAndCashEquivalents"]) },
    { metricCode: "cash_and_cash_equivalents_beginning_of_period", label: "Cash and Cash Equivalents, Beginning of Period", depth: 1, unit: currency, rowKind: "metric", sourceConcept: "beginningCashPosition", getValue: (row) => pickNumber(row, ["beginningCashPosition"]) }
  ];
}

function selectTemplate(statement: StatementType, sector: SectorProfile, currency: string): MetricDef[] {
  switch (statement) {
    case "income_statement":
      return incomeTemplate(sector).map((metric) => ({
        ...metric,
        unit: metric.unit === "USD" ? currency : metric.unit
      }));
    case "balance_sheet":
      return balanceTemplate(currency);
    case "cash_flow":
      return cashFlowTemplate(currency);
  }
}

function hierarchyPathsForTemplate(template: MetricDef[]): string[][] {
  const paths: string[][] = [];

  for (const metric of template) {
    const path = [metric.label];
    for (let cursor = paths.length - 1; cursor >= 0; cursor -= 1) {
      const ancestor = template[cursor];
      if (ancestor.depth < metric.depth) {
        path.unshift(...paths[cursor]);
        break;
      }
    }
    paths.push(path);
  }

  return paths;
}

async function resolveSymbol(
  provider: PublicFinancialsProvider,
  identifier: string,
  options: RegionalPublicClientOptions
): Promise<ResolvedSymbol> {
  const normalized = identifier.trim().toUpperCase();
  const aliases = options.aliases ?? {};
  const preferredSuffixes = options.preferredSuffixes ?? [];
  const preferredExchanges = options.preferredExchanges ?? [];

  let symbol: string | undefined = aliases[normalized];

  if (!symbol && preferredSuffixes.some((suffix) => normalized.endsWith(suffix.toUpperCase()))) {
    symbol = normalized;
  }

  if (!symbol) {
    const searchResults = await provider.search(identifier);
    const preferredQuote = searchResults.find((quote) => {
      const quoteSymbol = quote.symbol?.toUpperCase() ?? "";
      const exchange = quote.exchange?.toUpperCase() ?? "";
      const isEquity = (quote.typeDisp ?? "").toLowerCase() === "equity";
      return isEquity && (
        preferredSuffixes.some((suffix) => quoteSymbol.endsWith(suffix.toUpperCase())) ||
        preferredExchanges.some((preferred) => exchange.includes(preferred.toUpperCase()))
      );
    });
    symbol = typeof preferredQuote?.symbol === "string"
      ? preferredQuote.symbol.toUpperCase()
      : undefined;
  }

  if (!symbol) {
    throw new NotFoundError(
      `No ${options.label} symbol mapping could be resolved for identifier ${identifier}.`,
      { regime: options.regime, identifier }
    );
  }

  const resolvedSymbol: string = symbol;
  const quote = await provider.quote(resolvedSymbol);
  return {
    requestedIdentifier: normalized,
    symbol: resolvedSymbol,
    companyName: quote.longName ?? quote.shortName ?? normalized,
    currency: quote.financialCurrency ?? quote.currency ?? "USD",
    exchange: quote.fullExchangeName ?? ""
  };
}

function buildResponse(input: {
  identifier: string;
  requestedStatement: StatementType;
  frequency: StatementFrequency;
  periods: number;
  includeTtm: boolean;
  view: StatementView;
  regime: StatementSourceRegime;
  resolved: ResolvedSymbol;
  annualRows: ProviderFinancialRow[];
  periodicRows: ProviderFinancialRow[];
  trailingRows: ProviderFinancialRow[];
  qualityFlags: string[];
  asReportedQualityFlags: string[];
}): NormalizedStatementResponse {
  const sectorProfile = inferSector(input.annualRows.length > 0 ? input.annualRows : input.periodicRows);
  const currency = input.resolved.currency;
  const baseQualityFlags = [...input.qualityFlags];
  if (input.view === "as_reported") {
    baseQualityFlags.push(...input.asReportedQualityFlags);
  }

  const orderedRows = [...input.periodicRows].sort(
    (left, right) => left.date.getTime() - right.date.getTime()
  );
  const template = selectTemplate(input.requestedStatement, sectorProfile, currency);
  const selectedRows = trimLeadingEmptyPeriods(
    orderedRows.slice(-input.periods),
    template,
    currency
  );
  const columns = selectedRows.map((row) =>
    input.frequency === "annual" ? annualLabel(row.date) : quarterlyLabel(row.date)
  );
  const periodEnds = selectedRows.map((row) => row.date.toISOString().slice(0, 10));

  const trailingRow =
    input.includeTtm && input.frequency === "quarterly" && input.requestedStatement !== "balance_sheet"
      ? [...input.trailingRows].sort((left, right) => left.date.getTime() - right.date.getTime()).at(-1) ?? null
      : null;

  if (trailingRow) {
    columns.push("TTM");
    periodEnds.push(trailingRow.date.toISOString().slice(0, 10));
  }

  const hierarchyPaths = hierarchyPathsForTemplate(template);

  const rows: StatementRow[] = template.map((definition) => {
    const values = selectedRows.map((row) =>
      definition.rowKind === "metric" && definition.getValue
        ? definition.getValue(row, currency)
        : null
    );

    if (trailingRow) {
      values.push(
        definition.rowKind === "metric" && definition.getValue
          ? definition.getValue(trailingRow, currency)
          : null
      );
    }

    return {
      metricCode: definition.metricCode,
      label: definition.label,
      depth: definition.depth,
      unit: definition.unit,
      rowKind: definition.rowKind,
      values,
      qualityFlags: definition.rowKind === "metric" ? baseQualityFlags : []
    };
  });

  const periods: Record<string, Record<string, number | null>> = {};
  columns.forEach((column, columnIndex) => {
    periods[column] = {};
    for (const row of rows) {
      if (row.rowKind === "metric") {
        periods[column][row.metricCode] = row.values[columnIndex] ?? null;
      }
    }
  });

  const facts: CanonicalFact[] = [];
  rows.forEach((row, rowIndex) => {
    if (row.rowKind !== "metric") {
      return;
    }

    const definition = template[rowIndex];
    row.values.forEach((value, columnIndex) => {
      if (value === null) {
        return;
      }

      const periodLabel = columns[columnIndex];
      const periodType = periodLabel === "TTM"
        ? "ttm"
        : input.frequency === "annual"
          ? "annual"
          : "quarterly";

      facts.push({
        metricCode: row.metricCode,
        displayLabel: row.label,
        statement: input.requestedStatement,
        periodType,
        periodEnd: periodEnds[columnIndex],
        periodLabel,
        view: input.view,
        value,
        unit: row.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: hierarchyPaths[rowIndex],
        depth: row.depth,
        sourceRegime: input.regime,
        sourceConcept: definition.sourceConcept ?? row.metricCode,
        sourceFiling: `public_fundamentals:${input.resolved.symbol}`,
        sourceAccession: `${input.resolved.symbol}:${periodEnds[columnIndex]}:${row.metricCode}`,
        qualityFlags: baseQualityFlags
      });
    });
  });

  const latestAnnual = [...input.annualRows].sort(
    (left, right) => left.date.getTime() - right.date.getTime()
  ).at(-1);

  return {
    meta: {
      ticker: input.identifier.trim().toUpperCase(),
      companyName: input.resolved.companyName,
      statement: input.requestedStatement,
      frequency: input.frequency,
      view: input.view,
      currency,
      fiscalYearEnd: latestAnnual ? formatFiscalYearEnd(latestAnnual.date) : "Unknown",
      titleSlug: `${input.identifier.trim().toUpperCase()}_${titleStatementSlug(input.requestedStatement)}_${input.frequency === "annual" ? "Annual" : "Quarterly"}_${titleViewSlug(input.view)}`,
      sourceRegime: input.regime,
      sectorProfile,
      qualityFlags: baseQualityFlags
    },
    columns,
    rows,
    periods,
    facts
  };
}

export function createRegionalPublicClient(options: RegionalPublicClientOptions) {
  const provider = options.provider ?? createYahooProvider();
  const baseQualityFlags = options.qualityFlags ?? ["beta_public_fundamentals_provider"];
  const asReportedQualityFlags = options.asReportedQualityFlags ?? ["as_reported_proxy_not_filing_based"];

  async function getStatement(input: {
    identifier: string;
    statement: StatementType;
    frequency: StatementFrequency;
    periods: number;
    includeTtm: boolean;
    view: StatementView;
  }): Promise<NormalizedStatementResponse> {
    try {
      const resolved = await resolveSymbol(provider, input.identifier, options);
      const annualRows = await provider.fundamentals(resolved.symbol, {
        type: "annual",
        startDate: startDateForRequest("annual", Math.max(input.periods, 6))
      });
      const periodicRows = await provider.fundamentals(resolved.symbol, {
        type: input.frequency,
        startDate: startDateForRequest(input.frequency, input.periods)
      });
      const trailingRows =
        input.frequency === "quarterly" && input.includeTtm && input.statement !== "balance_sheet"
          ? await provider.fundamentals(resolved.symbol, {
              type: "trailing",
              startDate: startDateForRequest("quarterly", Math.max(input.periods, 4))
            })
          : [];

      if (periodicRows.length === 0) {
        throw new NotFoundError(
          `No ${options.label} financial statement data was available for ${input.identifier}.`,
          { regime: options.regime, identifier: input.identifier, symbol: resolved.symbol }
        );
      }

      return buildResponse({
        identifier: input.identifier,
        requestedStatement: input.statement,
        frequency: input.frequency,
        periods: input.periods,
        includeTtm: input.includeTtm,
        view: input.view,
        regime: options.regime,
        resolved,
        annualRows,
        periodicRows,
        trailingRows,
        qualityFlags: baseQualityFlags,
        asReportedQualityFlags
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      throw new UpstreamError(
        `Failed to fetch ${options.label} statement data for ${input.identifier}.`,
        {
          regime: options.regime,
          identifier: input.identifier,
          cause: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  function getCapabilities(): AdapterCapabilities {
    return {
      regime: options.regime,
      status: "live",
      identifierLabel: options.identifierLabel,
      identifierExample: options.identifierExample,
      statementSupport: "full",
      notes: options.capabilityNotes ?? [
        `Beta ${options.label} statement support is enabled via a public market-statement fallback.`,
        `Official ${options.label} filing-parser integration is still pending.`
      ],
      requiredEnv: options.requiredEnv ?? []
    };
  }

  return {
    getStatement,
    getCapabilities
  };
}
