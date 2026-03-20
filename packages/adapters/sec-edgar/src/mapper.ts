import {
  NotFoundError,
  type CanonicalFact,
  type NormalizedStatementResponse,
  type SectorProfile,
  type StatementFrequency,
  type StatementRow,
  type StatementType,
  type StatementView
} from "../../../core/src";
import type { SecCompanyFacts, SecFactUnit, SecSubmissions } from "./types";

interface StatementMetricDefinition {
  metricCode: string;
  label: string;
  hierarchyPath: string[];
  unit: string;
  concepts: string[];
  statement: StatementType;
  kind: "instant" | "duration" | "derived";
  quarterlyStrategy?: "discrete_or_subtract" | "discrete_only";
  ttmStrategy?: "sum" | "average" | "latest_annual" | "none";
  valueTransform?: (value: number) => number;
  derive?: (values: Record<string, number | null>) => number | null;
  deriveDependencies?: string[];
}

interface SourcedFact {
  concept: string;
  fact: SecFactUnit;
}

interface PeriodCell {
  label: string;
  periodType: "annual" | "quarterly" | "ttm";
  end: string;
  value: number;
  concept: string;
  filing: string;
  accession: string;
}

function applyValueTransform(
  cells: PeriodCell[],
  transform: ((value: number) => number) | undefined
): PeriodCell[] {
  if (!transform) {
    return cells;
  }

  return cells.map((cell) => ({
    ...cell,
    value: transform(cell.value)
  }));
}

function isBaseDefinition(
  definition: StatementMetricDefinition
): definition is StatementMetricDefinition & { kind: "instant" | "duration" } {
  return definition.kind === "instant" || definition.kind === "duration";
}

function isDurationStatement(statement: StatementType): boolean {
  return statement === "income_statement" || statement === "cash_flow";
}

const DEFAULT_STATEMENT_DEFINITIONS: Record<StatementType, StatementMetricDefinition[]> = {
  income_statement: [
    {
      metricCode: "gross_profit",
      label: "Gross Profit",
      hierarchyPath: ["Gross Profit"],
      unit: "USD",
      concepts: ["GrossProfit"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      deriveDependencies: ["revenue_total", "cost_of_revenue", "operating_income", "operating_income_expenses"],
      derive: (values) => {
        const revenue = values.revenue_total;
        const costOfRevenue = values.cost_of_revenue;
        if (revenue !== null && costOfRevenue !== null) {
          return revenue + costOfRevenue;
        }

        const operatingIncome = values.operating_income;
        const operatingExpenses = values.operating_income_expenses;
        if (operatingIncome === null || operatingExpenses === null) {
          return null;
        }

        return operatingIncome - operatingExpenses;
      }
    },
    {
      metricCode: "revenue_total",
      label: "Total Revenue",
      hierarchyPath: ["Gross Profit", "Total Revenue"],
      unit: "USD",
      concepts: [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "Revenues",
        "RevenueNet"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "business_revenue",
      label: "Business Revenue",
      hierarchyPath: ["Gross Profit", "Total Revenue", "Business Revenue"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["revenue_total"],
      derive: (values) => values.revenue_total ?? null
    },
    {
      metricCode: "cost_of_revenue",
      label: "Cost of Revenue",
      hierarchyPath: ["Gross Profit", "Cost of Revenue"],
      unit: "USD",
      concepts: [
        "CostOfGoodsSold",
        "CostOfSales",
        "CostOfRevenue",
        "CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization",
        "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value),
      deriveDependencies: ["gross_profit", "revenue_total"],
      derive: (values) => {
        const grossProfit = values.gross_profit;
        const revenue = values.revenue_total;
        if (grossProfit === null || revenue === null) {
          return null;
        }

        return grossProfit - revenue;
      }
    },
    {
      metricCode: "cost_of_goods_and_services",
      label: "Cost of Goods and Services",
      hierarchyPath: ["Gross Profit", "Cost of Revenue", "Cost of Goods and Services"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cost_of_revenue"],
      derive: (values) => values.cost_of_revenue ?? null
    },
    {
      metricCode: "operating_income_expenses",
      label: "Operating Income/Expenses",
      hierarchyPath: ["Operating Income/Expenses"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: [
        "selling_general_and_administrative_expenses",
        "research_and_development_expenses",
        "depreciation_depletion_and_amortization_expense",
        "restructuring_and_other_charges_net"
      ],
      derive: (values) => {
        const sellingGeneralAndAdministrative =
          values.selling_general_and_administrative_expenses;
        const researchAndDevelopment = values.research_and_development_expenses;
        const depreciationDepletionAndAmortization =
          values.depreciation_depletion_and_amortization_expense;
        const restructuringAndOtherCharges =
          values.restructuring_and_other_charges_net;
        if (
          sellingGeneralAndAdministrative === null &&
          researchAndDevelopment === null &&
          depreciationDepletionAndAmortization === null &&
          restructuringAndOtherCharges === null
        ) {
          return null;
        }

        return (
          (sellingGeneralAndAdministrative ?? 0) +
          (researchAndDevelopment ?? 0) +
          (depreciationDepletionAndAmortization ?? 0) +
          (restructuringAndOtherCharges ?? 0)
        );
      }
    },
    {
      metricCode: "selling_general_and_administrative_expenses",
      label: "Selling, General and Administrative Expenses",
      hierarchyPath: [
        "Operating Income/Expenses",
        "Selling, General and Administrative Expenses"
      ],
      unit: "USD",
      concepts: ["SellingGeneralAndAdministrativeExpense"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "research_and_development_expenses",
      label: "Research and Development Expenses",
      hierarchyPath: [
        "Operating Income/Expenses",
        "Research and Development Expenses"
      ],
      unit: "USD",
      concepts: [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "depreciation_depletion_and_amortization_expense",
      label: "Provision for Depreciation, Depletion, and Amortization",
      hierarchyPath: [
        "Operating Income/Expenses",
        "Provision for Depreciation, Depletion, and Amortization"
      ],
      unit: "USD",
      concepts: [
        "DepreciationDepletionAndAmortization",
        "OtherDepreciationAndAmortization"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "restructuring_and_other_charges_net",
      label: "Restructuring and Other Charges, Net",
      hierarchyPath: [
        "Operating Income/Expenses",
        "Restructuring and Other Charges, Net"
      ],
      unit: "USD",
      concepts: [
        "RestructuringCharges",
        "OtherRestructuringCosts",
        "BusinessExitCosts1"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "total_operating_profit_loss",
      label: "Total Operating Profit/Loss",
      hierarchyPath: ["Total Operating Profit/Loss"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["operating_income"],
      derive: (values) => values.operating_income ?? null
    },
    {
      metricCode: "operating_income",
      label: "Operating Income",
      hierarchyPath: ["Total Operating Profit/Loss", "Operating Income"],
      unit: "USD",
      concepts: ["OperatingIncomeLoss"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      deriveDependencies: ["pretax_income", "non_operating_income_expense_total"],
      derive: (values) => {
        const pretaxIncome = values.pretax_income;
        const nonOperatingIncomeExpense = values.non_operating_income_expense_total;
        if (pretaxIncome === null || nonOperatingIncomeExpense === null) {
          return null;
        }

        return pretaxIncome - nonOperatingIncomeExpense;
      }
    },
    {
      metricCode: "non_operating_income_expense_total",
      label: "Non-Operating Income/Expense, Total",
      hierarchyPath: ["Non-Operating Income/Expense, Total"],
      unit: "USD",
      concepts: ["NonoperatingIncomeExpense", "OtherNonoperatingIncomeExpense"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      deriveDependencies: ["pretax_income", "operating_income"],
      derive: (values) => {
        const pretaxIncome = values.pretax_income;
        const operatingIncome = values.operating_income;
        if (pretaxIncome === null || operatingIncome === null) {
          return null;
        }

        return pretaxIncome - operatingIncome;
      }
    },
    {
      metricCode: "other_income_expense_non_operating",
      label: "Other Income/Expense, Non-Operating",
      hierarchyPath: [
        "Non-Operating Income/Expense, Total",
        "Other Income/Expense, Non-Operating"
      ],
      unit: "USD",
      concepts: ["OtherNonoperatingIncomeExpense"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "pretax_income",
      label: "Pretax Income",
      hierarchyPath: ["Pretax Income"],
      unit: "USD",
      concepts: [
        "IncomeBeforeTaxExpenseBenefit",
        "PretaxIncome",
        "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "provision_for_income_tax",
      label: "Provision for Income Tax",
      hierarchyPath: ["Provision for Income Tax"],
      unit: "USD",
      concepts: ["IncomeTaxExpenseBenefit"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "net_income",
      label: "Net Income before Extraordinary Items and Discontinued Operations",
      hierarchyPath: ["Net Income before Extraordinary Items and Discontinued Operations"],
      unit: "USD",
      concepts: ["NetIncomeLoss"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "net_income_after_extraordinary",
      label: "Net Income after Extraordinary Items and Discontinued Operations",
      hierarchyPath: ["Net Income after Extraordinary Items and Discontinued Operations"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["net_income"],
      derive: (values) => values.net_income ?? null
    },
    {
      metricCode: "net_income_after_non_controlling",
      label: "Net Income after Non-Controlling/Minority Interests",
      hierarchyPath: ["Net Income after Non-Controlling/Minority Interests"],
      unit: "USD",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["net_income_after_extraordinary"],
      derive: (values) => values.net_income_after_extraordinary ?? null
    },
    {
      metricCode: "net_income_available_to_common_stockholders",
      label: "Net Income Available to Common Stockholders",
      hierarchyPath: ["Net Income Available to Common Stockholders"],
      unit: "USD",
      concepts: ["NetIncomeLossAvailableToCommonStockholdersBasic"],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["net_income_after_non_controlling"],
      derive: (values) => values.net_income_after_non_controlling ?? null
    },
    {
      metricCode: "diluted_net_income_available_to_common_stockholders",
      label: "Diluted Net Income Available to Common Stockholders",
      hierarchyPath: ["Diluted Net Income Available to Common Stockholders"],
      unit: "USD",
      concepts: ["NetIncomeLossAvailableToCommonStockholdersDiluted"],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["net_income_available_to_common_stockholders"],
      derive: (values) => values.net_income_available_to_common_stockholders ?? null
    },
    {
      metricCode: "basic_eps",
      label: "Basic EPS",
      hierarchyPath: ["Basic EPS"],
      unit: "USD/shares",
      concepts: ["EarningsPerShareBasic"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_only",
      ttmStrategy: "latest_annual"
    },
    {
      metricCode: "eps_diluted",
      label: "Diluted EPS",
      hierarchyPath: ["Diluted EPS"],
      unit: "USD/shares",
      concepts: ["EarningsPerShareDiluted"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_only",
      ttmStrategy: "latest_annual"
    },
    {
      metricCode: "shares_basic",
      label: "Basic Weighted Average Shares Outstanding",
      hierarchyPath: ["Basic Weighted Average Shares Outstanding"],
      unit: "shares",
      concepts: ["WeightedAverageNumberOfSharesOutstandingBasic"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_only",
      ttmStrategy: "latest_annual"
    },
    {
      metricCode: "shares_diluted",
      label: "Diluted Weighted Average Shares Outstanding",
      hierarchyPath: ["Diluted Weighted Average Shares Outstanding"],
      unit: "shares",
      concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_only",
      ttmStrategy: "latest_annual"
    },
    {
      metricCode: "total_dividend_per_share",
      label: "Total Dividend Per Share",
      hierarchyPath: ["Total Dividend Per Share"],
      unit: "USD/shares",
      concepts: [
        "CommonStockDividendsPerShareDeclared",
        "CommonStockDividendsPerShareCashPaid"
      ],
      statement: "income_statement",
      kind: "duration",
      quarterlyStrategy: "discrete_only",
      ttmStrategy: "latest_annual"
    },
    {
      metricCode: "regular_dividend_per_share_calc",
      label: "Regular Dividend Per Share Calc",
      hierarchyPath: ["Total Dividend Per Share", "Regular Dividend Per Share Calc"],
      unit: "USD/shares",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "latest_annual",
      deriveDependencies: ["total_dividend_per_share"],
      derive: (values) => values.total_dividend_per_share ?? null
    },
    {
      metricCode: "basic_waso",
      label: "Basic WASO",
      hierarchyPath: ["Basic WASO"],
      unit: "shares",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "latest_annual",
      deriveDependencies: ["shares_basic"],
      derive: (values) => values.shares_basic ?? null
    },
    {
      metricCode: "diluted_waso",
      label: "Diluted WASO",
      hierarchyPath: ["Diluted WASO"],
      unit: "shares",
      concepts: [],
      statement: "income_statement",
      kind: "derived",
      ttmStrategy: "latest_annual",
      deriveDependencies: ["shares_diluted"],
      derive: (values) => values.shares_diluted ?? null
    }
  ],
  balance_sheet: [
    {
      metricCode: "total_assets",
      label: "Total Assets",
      hierarchyPath: ["Total Assets"],
      unit: "USD",
      concepts: ["Assets"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_current_assets",
      label: "Total Current Assets",
      hierarchyPath: ["Total Assets", "Total Current Assets"],
      unit: "USD",
      concepts: ["AssetsCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "cash_cash_equivalents_and_short_term_investments",
      label: "Cash, Cash Equivalents and Short Term Investments",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments"
      ],
      unit: "USD",
      concepts: [],
      statement: "balance_sheet",
      kind: "derived",
      ttmStrategy: "none",
      deriveDependencies: ["cash_and_equivalents", "short_term_investments"],
      derive: (values) => {
        const cash = values.cash_and_equivalents;
        const investments = values.short_term_investments;
        if (cash === null && investments === null) {
          return null;
        }

        return (cash ?? 0) + (investments ?? 0);
      }
    },
    {
      metricCode: "cash_and_equivalents",
      label: "Cash and Cash Equivalents",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments",
        "Cash and Cash Equivalents"
      ],
      unit: "USD",
      concepts: ["CashAndCashEquivalentsAtCarryingValue"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "cash",
      label: "Cash",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments",
        "Cash and Cash Equivalents",
        "Cash"
      ],
      unit: "USD",
      concepts: ["Cash"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "cash_equivalents",
      label: "Cash Equivalents",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments",
        "Cash and Cash Equivalents",
        "Cash Equivalents"
      ],
      unit: "USD",
      concepts: ["CashEquivalentsAtCarryingValue"],
      statement: "balance_sheet",
      kind: "derived",
      ttmStrategy: "none",
      deriveDependencies: ["cash_and_equivalents", "cash"],
      derive: (values) => {
        const cashAndEquivalents = values.cash_and_equivalents;
        const cash = values.cash;
        if (cashAndEquivalents === null || cash === null) {
          return null;
        }

        return cashAndEquivalents - cash;
      }
    },
    {
      metricCode: "short_term_investments",
      label: "Short Term Investments",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments",
        "Short Term Investments"
      ],
      unit: "USD",
      concepts: ["AvailableForSaleSecuritiesCurrent", "ShortTermInvestments", "MarketableSecuritiesCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "other_short_term_investments",
      label: "Other Short Term Investments",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Cash, Cash Equivalents and Short Term Investments",
        "Short Term Investments",
        "Other Short Term Investments"
      ],
      unit: "USD",
      concepts: [],
      statement: "balance_sheet",
      kind: "derived",
      ttmStrategy: "none",
      deriveDependencies: ["short_term_investments"],
      derive: (values) => values.short_term_investments ?? null
    },
    {
      metricCode: "inventories",
      label: "Inventories",
      hierarchyPath: ["Total Assets", "Total Current Assets", "Inventories"],
      unit: "USD",
      concepts: ["InventoryNet"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "trade_and_other_receivables_current",
      label: "Trade and Other Receivables, Current",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Trade and Other Receivables, Current"
      ],
      unit: "USD",
      concepts: [],
      statement: "balance_sheet",
      kind: "derived",
      ttmStrategy: "none",
      deriveDependencies: ["trade_accounts_receivable_current", "other_receivables_current"],
      derive: (values) => {
        const trade = values.trade_accounts_receivable_current;
        const other = values.other_receivables_current;
        if (trade === null && other === null) {
          return null;
        }

        return (trade ?? 0) + (other ?? 0);
      }
    },
    {
      metricCode: "trade_accounts_receivable_current",
      label: "Trade/Accounts Receivable, Current",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Trade and Other Receivables, Current",
        "Trade/Accounts Receivable, Current"
      ],
      unit: "USD",
      concepts: ["AccountsReceivableNetCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "gross_trade_accounts_receivable_current",
      label: "Gross Trade/Accounts Receivable, Current",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Trade and Other Receivables, Current",
        "Trade/Accounts Receivable, Current",
        "Gross Trade/Accounts Receivable, Current"
      ],
      unit: "USD",
      concepts: ["AccountsReceivableGrossCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "allowance_adjustments_trade_accounts_receivable_current",
      label: "Allowance/Adjustments for Trade/Accounts Receivable, Current",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Trade and Other Receivables, Current",
        "Trade/Accounts Receivable, Current",
        "Allowance/Adjustments for Trade/Accounts Receivable, Current"
      ],
      unit: "USD",
      concepts: ["AllowanceForDoubtfulAccountsReceivableCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "other_receivables_current",
      label: "Other Receivables, Current",
      hierarchyPath: [
        "Total Assets",
        "Total Current Assets",
        "Trade and Other Receivables, Current",
        "Other Receivables, Current"
      ],
      unit: "USD",
      concepts: ["OtherReceivablesCurrent", "VendorNonTradeReceivablesCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "other_current_assets",
      label: "Other Current Assets",
      hierarchyPath: ["Total Assets", "Total Current Assets", "Other Current Assets"],
      unit: "USD",
      concepts: ["OtherAssetsCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_non_current_assets",
      label: "Total Non-Current Assets",
      hierarchyPath: ["Total Assets", "Total Non-Current Assets"],
      unit: "USD",
      concepts: ["AssetsNoncurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "net_property_plant_equipment",
      label: "Net Property, Plant and Equipment",
      hierarchyPath: ["Total Assets", "Total Non-Current Assets", "Net Property, Plant and Equipment"],
      unit: "USD",
      concepts: ["PropertyPlantAndEquipmentNet"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "gross_property_plant_equipment",
      label: "Gross Property, Plant and Equipment",
      hierarchyPath: [
        "Total Assets",
        "Total Non-Current Assets",
        "Net Property, Plant and Equipment",
        "Gross Property, Plant and Equipment"
      ],
      unit: "USD",
      concepts: ["PropertyPlantAndEquipmentGross"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "accumulated_depreciation_impairment",
      label: "Accumulated Depreciation and Impairment",
      hierarchyPath: [
        "Total Assets",
        "Total Non-Current Assets",
        "Net Property, Plant and Equipment",
        "Accumulated Depreciation and Impairment"
      ],
      unit: "USD",
      concepts: ["AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "total_long_term_investments",
      label: "Total Long Term Investments",
      hierarchyPath: ["Total Assets", "Total Non-Current Assets", "Total Long Term Investments"],
      unit: "USD",
      concepts: ["NoncurrentInvestments", "AvailableForSaleSecuritiesNoncurrent", "LongTermInvestments"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "deferred_tax_assets_non_current",
      label: "Deferred Tax Assets, Non-Current",
      hierarchyPath: ["Total Assets", "Total Non-Current Assets", "Deferred Tax Assets, Non-Current"],
      unit: "USD",
      concepts: ["DeferredTaxAssetsNetNoncurrent", "DeferredTaxAssetsNoncurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "other_non_current_assets",
      label: "Other Non-Current Assets",
      hierarchyPath: ["Total Assets", "Total Non-Current Assets", "Other Non-Current Assets"],
      unit: "USD",
      concepts: ["OtherAssetsNoncurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_liabilities",
      label: "Total Liabilities",
      hierarchyPath: ["Total Liabilities"],
      unit: "USD",
      concepts: ["Liabilities"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_current_liabilities",
      label: "Total Current Liabilities",
      hierarchyPath: ["Total Liabilities", "Total Current Liabilities"],
      unit: "USD",
      concepts: ["LiabilitiesCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "trade_accounts_payable_current",
      label: "Trade/Accounts Payable, Current",
      hierarchyPath: [
        "Total Liabilities",
        "Total Current Liabilities",
        "Payables and Accrued Expenses, Current",
        "Trade and Other Payables, Current",
        "Trade/Accounts Payable, Current"
      ],
      unit: "USD",
      concepts: ["AccountsPayableCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "other_current_liabilities",
      label: "Other Current Liabilities",
      hierarchyPath: ["Total Liabilities", "Total Current Liabilities", "Other Current Liabilities"],
      unit: "USD",
      concepts: ["OtherLiabilitiesCurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_non_current_liabilities",
      label: "Total Non-Current Liabilities",
      hierarchyPath: ["Total Liabilities", "Total Non-Current Liabilities"],
      unit: "USD",
      concepts: ["LiabilitiesNoncurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "long_term_debt",
      label: "Long Term Debt",
      hierarchyPath: [
        "Total Liabilities",
        "Total Non-Current Liabilities",
        "Financial Liabilities, Non-Current",
        "Long Term Debt and Capital Lease Obligation",
        "Long Term Debt"
      ],
      unit: "USD",
      concepts: ["LongTermDebtNoncurrent"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_equity",
      label: "Total Equity",
      hierarchyPath: ["Total Equity"],
      unit: "USD",
      concepts: ["StockholdersEquity"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "paid_in_capital",
      label: "Paid in Capital",
      hierarchyPath: ["Total Equity", "Equity Attributable to Parent Stockholders", "Paid in Capital"],
      unit: "USD",
      concepts: ["CommonStocksIncludingAdditionalPaidInCapital", "AdditionalPaidInCapital", "CommonStockValue"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "retained_earnings_accumulated_deficit",
      label: "Retained Earnings/Accumulated Deficit",
      hierarchyPath: ["Total Equity", "Equity Attributable to Parent Stockholders", "Retained Earnings/Accumulated Deficit"],
      unit: "USD",
      concepts: ["RetainedEarningsAccumulatedDeficit"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "reserves_accumulated_comprehensive_income_losses",
      label: "Reserves/Accumulated Comprehensive Income/Losses",
      hierarchyPath: [
        "Total Equity",
        "Equity Attributable to Parent Stockholders",
        "Reserves/Accumulated Comprehensive Income/Losses"
      ],
      unit: "USD",
      concepts: ["AccumulatedOtherComprehensiveIncomeLossNetOfTax"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    }
  ],
  cash_flow: [
    {
      metricCode: "cash_flow_operating_indirect",
      label: "Cash Flow from Operating Activities, Indirect",
      hierarchyPath: ["Cash Flow from Operating Activities, Indirect"],
      unit: "USD",
      concepts: ["NetCashProvidedByUsedInOperatingActivities"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "net_cash_flow_from_continuing_operating_activities_indirect",
      label: "Net Cash Flow from Continuing Operating Activities, Indirect",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_flow_operating_indirect"],
      derive: (values) => values.cash_flow_operating_indirect ?? null
    },
    {
      metricCode: "cash_generated_from_operating_activities",
      label: "Cash Generated from Operating Activities",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_flow_operating_indirect"],
      derive: (values) => values.cash_flow_operating_indirect ?? null
    },
    {
      metricCode: "income_loss_before_non_cash_adjustment",
      label: "Income/Loss before Non-Cash Adjustment",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Income/Loss before Non-Cash Adjustment"
      ],
      unit: "USD",
      concepts: ["NetIncomeLoss"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "total_adjustments_for_non_cash_items",
      label: "Total Adjustments for Non-Cash Items",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Total Adjustments for Non-Cash Items"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: [
        "cash_generated_from_operating_activities",
        "income_loss_before_non_cash_adjustment",
        "changes_in_operating_capital"
      ],
      derive: (values) => {
        const generated = values.cash_generated_from_operating_activities;
        const income = values.income_loss_before_non_cash_adjustment;
        const changes = values.changes_in_operating_capital;
        if (generated === null || income === null || changes === null) {
          return null;
        }

        return generated - income - changes;
      }
    },
    {
      metricCode: "depreciation_and_amortization_non_cash_adjustment",
      label: "Depreciation and Amortization, Non-Cash Adjustment",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Total Adjustments for Non-Cash Items",
        "Depreciation, Amortization and Depletion, Non-Cash Adjustment",
        "Depreciation and Amortization, Non-Cash Adjustment"
      ],
      unit: "USD",
      concepts: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "stock_based_compensation_non_cash_adjustment",
      label: "Stock-Based Compensation, Non-Cash Adjustment",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Total Adjustments for Non-Cash Items",
        "Stock-Based Compensation, Non-Cash Adjustment"
      ],
      unit: "USD",
      concepts: ["ShareBasedCompensation"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "other_non_cash_items",
      label: "Other Non-Cash Items",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Total Adjustments for Non-Cash Items",
        "Other Non-Cash Items"
      ],
      unit: "USD",
      concepts: ["OtherNoncashIncomeExpense"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "change_in_inventories",
      label: "Change in Inventories",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Inventories"
      ],
      unit: "USD",
      concepts: ["IncreaseDecreaseInInventories"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "changes_in_operating_capital",
      label: "Changes in Operating Capital",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: [
        "change_in_inventories",
        "change_in_trade_and_other_receivables",
        "change_in_other_current_assets",
        "change_in_payables_and_accrued_expenses",
        "change_in_other_current_liabilities"
      ],
      derive: (values) => {
        const parts = [
          values.change_in_inventories,
          values.change_in_trade_and_other_receivables,
          values.change_in_other_current_assets,
          values.change_in_payables_and_accrued_expenses,
          values.change_in_other_current_liabilities
        ];
        if (parts.every((part) => part === null)) {
          return null;
        }

        return parts.reduce<number>((total, part) => total + (part ?? 0), 0);
      }
    },
    {
      metricCode: "change_in_trade_and_other_receivables",
      label: "Change in Trade and Other Receivables",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Trade and Other Receivables"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["change_in_trade_accounts_receivable"],
      derive: (values) => values.change_in_trade_accounts_receivable ?? null
    },
    {
      metricCode: "change_in_trade_accounts_receivable",
      label: "Change in Trade/Accounts Receivable",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Trade and Other Receivables",
        "Change in Trade/Accounts Receivable"
      ],
      unit: "USD",
      concepts: ["IncreaseDecreaseInAccountsReceivable"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "change_in_other_current_assets",
      label: "Change in Other Current Assets",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Other Current Assets"
      ],
      unit: "USD",
      concepts: ["IncreaseDecreaseInOtherOperatingAssets"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "change_in_trade_accounts_payable",
      label: "Change in Trade/Accounts Payable",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Payables and Accrued Expenses",
        "Change in Trade and Other Payables",
        "Change in Trade/Accounts Payable"
      ],
      unit: "USD",
      concepts: ["IncreaseDecreaseInAccountsPayable"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "change_in_payables_and_accrued_expenses",
      label: "Change in Payables and Accrued Expenses",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Payables and Accrued Expenses"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["change_in_trade_and_other_payables"],
      derive: (values) => values.change_in_trade_and_other_payables ?? null
    },
    {
      metricCode: "change_in_trade_and_other_payables",
      label: "Change in Trade and Other Payables",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Payables and Accrued Expenses",
        "Change in Trade and Other Payables"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["change_in_trade_accounts_payable"],
      derive: (values) => values.change_in_trade_accounts_payable ?? null
    },
    {
      metricCode: "change_in_other_current_liabilities",
      label: "Change in Other Current Liabilities",
      hierarchyPath: [
        "Cash Flow from Operating Activities, Indirect",
        "Net Cash Flow from Continuing Operating Activities, Indirect",
        "Cash Generated from Operating Activities",
        "Changes in Operating Capital",
        "Change in Other Current Liabilities"
      ],
      unit: "USD",
      concepts: ["IncreaseDecreaseInOtherOperatingLiabilities"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "cash_flow_investing_activities",
      label: "Cash Flow from Investing Activities",
      hierarchyPath: ["Cash Flow from Investing Activities"],
      unit: "USD",
      concepts: ["NetCashProvidedByUsedInInvestingActivities"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "cash_flow_continuing_investing_activities",
      label: "Cash Flow from Continuing Investing Activities",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_flow_investing_activities"],
      derive: (values) => values.cash_flow_investing_activities ?? null
    },
    {
      metricCode: "purchase_sale_ppe_net",
      label: "Purchase/Sale and Disposal of Property, Plant and Equipment, Net",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities",
        "Purchase/Sale and Disposal of Property, Plant and Equipment, Net"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["purchase_property_plant_equipment"],
      derive: (values) => values.purchase_property_plant_equipment ?? null
    },
    {
      metricCode: "purchase_property_plant_equipment",
      label: "Purchase of Property, Plant and Equipment",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities",
        "Purchase/Sale and Disposal of Property, Plant and Equipment, Net",
        "Purchase of Property, Plant and Equipment"
      ],
      unit: "USD",
      concepts: ["PaymentsToAcquirePropertyPlantAndEquipment"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "purchase_sale_investments_net",
      label: "Purchase/Sale of Investments, Net",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities",
        "Purchase/Sale of Investments, Net"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["purchase_of_investments", "sale_of_investments"],
      derive: (values) => {
        const purchase = values.purchase_of_investments;
        const sale = values.sale_of_investments;
        if (purchase === null && sale === null) {
          return null;
        }

        return (purchase ?? 0) + (sale ?? 0);
      }
    },
    {
      metricCode: "purchase_of_investments",
      label: "Purchase of Investments",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities",
        "Purchase/Sale of Investments, Net",
        "Purchase of Investments"
      ],
      unit: "USD",
      concepts: ["PaymentsToAcquireAvailableForSaleSecuritiesDebt", "PaymentsToAcquireInvestments"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "sale_of_investments",
      label: "Sale of Investments",
      hierarchyPath: [
        "Cash Flow from Investing Activities",
        "Cash Flow from Continuing Investing Activities",
        "Purchase/Sale of Investments, Net",
        "Sale of Investments"
      ],
      unit: "USD",
      concepts: [
        "ProceedsFromSaleOfAvailableForSaleSecuritiesDebt",
        "ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities",
        "ProceedsFromSaleAndMaturityOfOtherInvestments"
      ],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "cash_flow_financing_activities",
      label: "Cash Flow from Financing Activities",
      hierarchyPath: ["Cash Flow from Financing Activities"],
      unit: "USD",
      concepts: ["NetCashProvidedByUsedInFinancingActivities"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "cash_flow_continuing_financing_activities",
      label: "Cash Flow from Continuing Financing Activities",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_flow_financing_activities"],
      derive: (values) => values.cash_flow_financing_activities ?? null
    },
    {
      metricCode: "issuance_payments_common_stock_net",
      label: "Issuance of/Payments for Common Stock, Net",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Payments for Common Stock, Net"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["payments_for_common_stock", "proceeds_from_issuance_of_common_stock"],
      derive: (values) => {
        const payments = values.payments_for_common_stock;
        const proceeds = values.proceeds_from_issuance_of_common_stock;
        if (payments === null && proceeds === null) {
          return null;
        }

        return (payments ?? 0) + (proceeds ?? 0);
      }
    },
    {
      metricCode: "payments_for_common_stock",
      label: "Payments for Common Stock",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Payments for Common Stock, Net",
        "Payments for Common Stock"
      ],
      unit: "USD",
      concepts: ["PaymentsForRepurchaseOfCommonStock"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "proceeds_from_issuance_of_common_stock",
      label: "Proceeds from Issuance of Common Stock",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Payments for Common Stock, Net",
        "Proceeds from Issuance of Common Stock"
      ],
      unit: "USD",
      concepts: ["ProceedsFromStockOptionsExercised", "ProceedsFromIssuanceOfCommonStock"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "proceeds_from_issuance_of_long_term_debt",
      label: "Proceeds from Issuance of Long Term Debt",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Repayments for Debt, Net",
        "Issuance of/Repayments for Long Term Debt, Net",
        "Proceeds from Issuance of Long Term Debt"
      ],
      unit: "USD",
      concepts: ["ProceedsFromIssuanceOfLongTermDebt"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "issuance_repayments_debt_net",
      label: "Issuance of/Repayments for Debt, Net",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Repayments for Debt, Net"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["proceeds_from_issuance_of_long_term_debt", "repayments_for_long_term_debt"],
      derive: (values) => {
        const proceeds = values.proceeds_from_issuance_of_long_term_debt;
        const repayments = values.repayments_for_long_term_debt;
        if (proceeds === null && repayments === null) {
          return null;
        }

        return (proceeds ?? 0) + (repayments ?? 0);
      }
    },
    {
      metricCode: "repayments_for_long_term_debt",
      label: "Repayments for Long Term Debt",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Issuance of/Repayments for Debt, Net",
        "Issuance of/Repayments for Long Term Debt, Net",
        "Repayments for Long Term Debt"
      ],
      unit: "USD",
      concepts: ["RepaymentsOfLongTermDebt"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "cash_dividends_paid",
      label: "Cash Dividends Paid",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Cash Dividends and Interest Paid",
        "Cash Dividends Paid"
      ],
      unit: "USD",
      concepts: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "cash_dividends_and_interest_paid",
      label: "Cash Dividends and Interest Paid",
      hierarchyPath: [
        "Cash Flow from Financing Activities",
        "Cash Flow from Continuing Financing Activities",
        "Cash Dividends and Interest Paid"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_dividends_paid"],
      derive: (values) => values.cash_dividends_paid ?? null
    },
    {
      metricCode: "cash_and_cash_equivalents_end_of_period",
      label: "Cash and Cash Equivalents, End of Period",
      hierarchyPath: ["Cash and Cash Equivalents, End of Period"],
      unit: "USD",
      concepts: ["CashAndCashEquivalentsAtCarryingValue"],
      statement: "cash_flow",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "change_in_cash",
      label: "Change in Cash",
      hierarchyPath: [
        "Cash and Cash Equivalents, End of Period",
        "Change in Cash"
      ],
      unit: "USD",
      concepts: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecrease"],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: [
        "cash_flow_operating_indirect",
        "cash_flow_investing_activities",
        "cash_flow_financing_activities"
      ],
      derive: (values) => {
        const operating = values.cash_flow_operating_indirect;
        const investing = values.cash_flow_investing_activities;
        const financing = values.cash_flow_financing_activities;
        if (operating === null || financing === null || investing === null) {
          return null;
        }

        return operating + financing + investing;
      }
    },
    {
      metricCode: "cash_flow_supplemental_section",
      label: "Cash Flow Supplemental Section",
      hierarchyPath: ["Cash Flow Supplemental Section"],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum"
    },
    {
      metricCode: "income_tax_paid_supplemental",
      label: "Income Tax Paid, Supplemental",
      hierarchyPath: [
        "Cash Flow Supplemental Section",
        "Income Tax Paid, Supplemental"
      ],
      unit: "USD",
      concepts: ["IncomeTaxesPaidNet"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "interest_paid_supplemental",
      label: "Interest Paid, Supplemental",
      hierarchyPath: [
        "Cash Flow Supplemental Section",
        "Interest Paid, Supplemental"
      ],
      unit: "USD",
      concepts: ["InterestPaidNet"],
      statement: "cash_flow",
      kind: "duration",
      quarterlyStrategy: "discrete_or_subtract",
      ttmStrategy: "sum",
      valueTransform: (value) => -Math.abs(value)
    },
    {
      metricCode: "change_in_cash_as_reported_supplemental",
      label: "Change in Cash as Reported, Supplemental",
      hierarchyPath: [
        "Cash Flow Supplemental Section",
        "Change in Cash as Reported, Supplemental"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["change_in_cash"],
      derive: (values) => values.change_in_cash ?? null
    },
    {
      metricCode: "cash_and_cash_equivalents_beginning_of_period",
      label: "Cash and Cash Equivalents, Beginning of Period",
      hierarchyPath: [
        "Cash and Cash Equivalents, End of Period",
        "Cash and Cash Equivalents, Beginning of Period"
      ],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
      deriveDependencies: ["cash_and_cash_equivalents_end_of_period", "change_in_cash"],
      derive: (values) => {
        const ending = values.cash_and_cash_equivalents_end_of_period;
        const change = values.change_in_cash;
        if (ending === null || change === null) {
          return null;
        }

        return ending - change;
      }
    }
  ]
};

const BANK_INCOME_STATEMENT_DEFINITIONS: StatementMetricDefinition[] = [
  {
    metricCode: "interest_income_net",
    label: "Net Interest Income",
    hierarchyPath: ["Revenue", "Net Interest Income"],
    unit: "USD",
    concepts: ["InterestIncomeExpenseNet"],
    statement: "income_statement",
    kind: "duration",
    quarterlyStrategy: "discrete_or_subtract",
    ttmStrategy: "sum"
  },
  {
    metricCode: "noninterest_income",
    label: "Noninterest Income",
    hierarchyPath: ["Revenue", "Noninterest Income"],
    unit: "USD",
    concepts: ["NoninterestIncome"],
    statement: "income_statement",
    kind: "duration",
    quarterlyStrategy: "discrete_or_subtract",
    ttmStrategy: "sum"
  },
  {
    metricCode: "revenue_total",
    label: "Total Revenue",
    hierarchyPath: ["Revenue", "Total Revenue"],
    unit: "USD",
    concepts: [],
    statement: "income_statement",
    kind: "derived",
    ttmStrategy: "sum",
    deriveDependencies: ["interest_income_net", "noninterest_income"],
    derive: (values) => {
      const interestIncomeNet = values.interest_income_net;
      const noninterestIncome = values.noninterest_income;
      if (interestIncomeNet === null || noninterestIncome === null) {
        return null;
      }

      return interestIncomeNet + noninterestIncome;
    }
  },
  {
    metricCode: "net_income",
    label: "Net Income",
    hierarchyPath: ["Profitability", "Net Income"],
    unit: "USD",
    concepts: ["NetIncomeLoss"],
    statement: "income_statement",
    kind: "duration",
    quarterlyStrategy: "discrete_or_subtract",
    ttmStrategy: "sum"
  },
  {
    metricCode: "eps_diluted",
    label: "Diluted EPS",
    hierarchyPath: ["Per Share", "Diluted EPS"],
    unit: "USD/shares",
    concepts: ["EarningsPerShareDiluted"],
    statement: "income_statement",
    kind: "duration",
    quarterlyStrategy: "discrete_only",
    ttmStrategy: "latest_annual"
  },
  {
    metricCode: "shares_diluted",
    label: "Weighted Avg. Diluted Shares",
    hierarchyPath: ["Per Share", "Weighted Avg. Diluted Shares"],
    unit: "shares",
    concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    statement: "income_statement",
    kind: "duration",
    quarterlyStrategy: "discrete_only",
    ttmStrategy: "latest_annual"
  }
];

function getStatementDefinitions(
  statement: StatementType,
  sectorProfile: SectorProfile
): StatementMetricDefinition[] {
  if (statement === "income_statement" && sectorProfile === "bank") {
    return BANK_INCOME_STATEMENT_DEFINITIONS;
  }

  return DEFAULT_STATEMENT_DEFINITIONS[statement];
}

function detectSectorProfile(sic: string | undefined): SectorProfile {
  if (!sic) {
    return "unknown";
  }

  if (sic.startsWith("6")) {
    return "bank";
  }

  if (sic.startsWith("63") || sic.startsWith("64")) {
    return "insurer";
  }

  return "industrial";
}

function formatFiscalYearEnd(rawValue: string | undefined): string {
  if (!rawValue || rawValue.length !== 4) {
    return "Unknown";
  }

  const month = Number(rawValue.slice(0, 2));
  const day = Number(rawValue.slice(2, 4));
  const date = new Date(Date.UTC(2025, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function getConceptNode(companyFacts: SecCompanyFacts, concept: string) {
  return companyFacts.facts["us-gaap"]?.[concept] ?? companyFacts.facts["dei"]?.[concept];
}

function getDurationDays(fact: SecFactUnit): number {
  if (!fact.start || !fact.end) {
    return 0;
  }

  return Math.round(
    (Date.parse(fact.end) - Date.parse(fact.start)) / (1000 * 60 * 60 * 24)
  );
}

function getYearLabel(end: string | undefined): string {
  return String(new Date(end ?? "").getUTCFullYear());
}

function getQuarterLabel(end: string | undefined): string {
  const date = new Date(end ?? "");
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function isStale(end: string | undefined, thresholdDays = 400): boolean {
  if (!end) {
    return true;
  }

  const ageMs = Date.now() - Date.parse(end);
  return ageMs / (1000 * 60 * 60 * 24) > thresholdDays;
}

function chooseBestFact(
  facts: SecFactUnit[],
  view: StatementView
): SecFactUnit | undefined {
  return [...facts].sort((left, right) => {
    const rightFiled = Date.parse(right.filed ?? right.end ?? "");
    const leftFiled = Date.parse(left.filed ?? left.end ?? "");
    if (rightFiled !== leftFiled) {
      return view === "restated" ? rightFiled - leftFiled : leftFiled - rightFiled;
    }

    const rightEnd = Date.parse(right.end ?? "");
    const leftEnd = Date.parse(left.end ?? "");
    return rightEnd - leftEnd;
  })[0];
}

function collectSourcedFacts(
  companyFacts: SecCompanyFacts,
  definition: StatementMetricDefinition
): SourcedFact[] {
  return definition.concepts.flatMap((concept) =>
    Object.values(getConceptNode(companyFacts, concept)?.units ?? {})
      .flat()
      .map((fact) => ({ concept, fact }))
  );
}

function selectAnnualSourcedFacts(
  facts: SourcedFact[],
  kind: "instant" | "duration"
): SourcedFact[] {
  return facts.filter(({ fact }) => {
    if (!fact.end || !fact.form) {
      return false;
    }

    const annualForm = ["10-K", "10-K/A", "20-F", "40-F"].includes(fact.form);
    if (!annualForm) {
      return false;
    }

    if (kind === "instant") {
      return fact.fp === "FY" || !fact.start;
    }

    return getDurationDays(fact) >= 300;
  });
}

function buildAnnualSeries(
  sourcedFacts: SourcedFact[],
  periods: number,
  view: StatementView
): PeriodCell[] {
  const grouped = new Map<string, SourcedFact[]>();
  for (const sourcedFact of sourcedFacts) {
    const year = getYearLabel(sourcedFact.fact.end);
    grouped.set(year, [...(grouped.get(year) ?? []), sourcedFact]);
  }

  const cells: PeriodCell[] = [];
  for (const [label, candidates] of grouped.entries()) {
    const best = chooseBestFact(
      candidates.map((candidate) => candidate.fact),
      view
    );
    const source = candidates.find((candidate) => candidate.fact === best);
    if (!best || !source) {
      continue;
    }

    cells.push({
      label,
      periodType: "annual",
      end: best.end ?? "",
      value: best.val,
      concept: source.concept,
      filing: best.form ?? "10-K",
      accession: best.accn
    });
  }

  return cells
    .sort((left, right) => Number(left.label) - Number(right.label))
    .slice(-periods);
}

function buildInstantQuarterlySeries(
  sourcedFacts: SourcedFact[],
  periods: number,
  view: StatementView
): PeriodCell[] {
  const filtered = sourcedFacts.filter(({ fact }) => {
    if (!fact.end || !fact.form) {
      return false;
    }

    return ["10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "40-F"].includes(fact.form);
  });

  const grouped = new Map<string, SourcedFact[]>();
  for (const sourcedFact of filtered) {
    const step = sourcedFact.fact.fp === "FY" ? "Q4" : sourcedFact.fact.fp;
    if (!step || !["Q1", "Q2", "Q3", "Q4"].includes(step)) {
      continue;
    }

    const label = getQuarterLabel(sourcedFact.fact.end);
    grouped.set(label, [...(grouped.get(label) ?? []), sourcedFact]);
  }

  const cells: PeriodCell[] = [];
  for (const [label, candidates] of grouped.entries()) {
    const best = chooseBestFact(
      candidates.map((candidate) => candidate.fact),
      view
    );
    const source = candidates.find((candidate) => candidate.fact === best);
    if (!best || !source) {
      continue;
    }

    cells.push({
      label,
      periodType: "quarterly",
      end: best.end ?? "",
      value: best.val,
      concept: source.concept,
      filing: best.form ?? "10-Q",
      accession: best.accn
    });
  }

  return cells
    .sort((left, right) => Date.parse(left.end) - Date.parse(right.end))
    .slice(-periods);
}

function buildDurationQuarterlySeries(
  definition: StatementMetricDefinition & { kind: "duration" },
  sourcedFacts: SourcedFact[],
  periods: number,
  view: StatementView
): PeriodCell[] {
  const groupedByYear = new Map<string, Record<string, SourcedFact[]>>();

  for (const sourcedFact of sourcedFacts) {
    const { fact } = sourcedFact;
    if (!fact.end || !fact.form || !fact.fp) {
      continue;
    }

    if (!["10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "40-F"].includes(fact.form)) {
      continue;
    }

    if (!["Q1", "Q2", "Q3", "Q4", "FY"].includes(fact.fp)) {
      continue;
    }

    const year = getYearLabel(fact.end);
    const bucket = groupedByYear.get(year) ?? {};
    bucket[fact.fp] = [...(bucket[fact.fp] ?? []), sourcedFact];
    groupedByYear.set(year, bucket);
  }

  const quarterlyCells: PeriodCell[] = [];

  for (const [year, bucket] of groupedByYear.entries()) {
    const q1Candidates = bucket.Q1 ?? [];
    const q2Candidates = bucket.Q2 ?? [];
    const q3Candidates = bucket.Q3 ?? [];
    const q4Candidates = bucket.Q4 ?? [];
    const fyCandidates = bucket.FY ?? [];

    const directQ1 = chooseBestFact(
      q1Candidates
        .filter(({ fact }) => {
          const durationDays = getDurationDays(fact);
          return durationDays === 0 || durationDays <= 120;
        })
        .map(({ fact }) => fact),
      view
    );
    const directQ2 = chooseBestFact(
      q2Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact),
      view
    );
    const directQ3 = chooseBestFact(
      q3Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact),
      view
    );
    const directQ4 = chooseBestFact(
      q4Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact),
      view
    );

    const ytdQ1 = chooseBestFact(q1Candidates.map(({ fact }) => fact), view);
    const ytdQ2 = chooseBestFact(q2Candidates.map(({ fact }) => fact), view);
    const ytdQ3 = chooseBestFact(q3Candidates.map(({ fact }) => fact), view);
    const annual = chooseBestFact(fyCandidates.map(({ fact }) => fact), view);

    const sourceFor = (target: SecFactUnit | undefined, candidates: SourcedFact[]) =>
      candidates.find((candidate) => candidate.fact === target);

    const q1Value = directQ1?.val ?? ytdQ1?.val ?? null;
    const q1Source = sourceFor(directQ1 ?? ytdQ1, q1Candidates);
    if (q1Value !== null && q1Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ1 ?? ytdQ1)?.end),
        periodType: "quarterly",
        end: (directQ1 ?? ytdQ1)?.end ?? "",
        value: q1Value,
        concept: q1Source.concept,
        filing: (directQ1 ?? ytdQ1)?.form ?? "10-Q",
        accession: (directQ1 ?? ytdQ1)?.accn ?? ""
      });
    }

    const q2Value = directQ2?.val ?? (
      definition.quarterlyStrategy === "discrete_or_subtract" && ytdQ2 && q1Value !== null
        ? ytdQ2.val - q1Value
        : null
    );
    const q2Source = sourceFor(directQ2 ?? ytdQ2, q2Candidates);
    if (q2Value !== null && q2Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ2 ?? ytdQ2)?.end),
        periodType: "quarterly",
        end: (directQ2 ?? ytdQ2)?.end ?? "",
        value: q2Value,
        concept: q2Source.concept,
        filing: (directQ2 ?? ytdQ2)?.form ?? "10-Q",
        accession: (directQ2 ?? ytdQ2)?.accn ?? ""
      });
    }

    const q3Value = directQ3?.val ?? (
      definition.quarterlyStrategy === "discrete_or_subtract" &&
      ytdQ3 &&
      q1Value !== null &&
      q2Value !== null
        ? ytdQ3.val - q1Value - q2Value
        : null
    );
    const q3Source = sourceFor(directQ3 ?? ytdQ3, q3Candidates);
    if (q3Value !== null && q3Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ3 ?? ytdQ3)?.end),
        periodType: "quarterly",
        end: (directQ3 ?? ytdQ3)?.end ?? "",
        value: q3Value,
        concept: q3Source.concept,
        filing: (directQ3 ?? ytdQ3)?.form ?? "10-Q",
        accession: (directQ3 ?? ytdQ3)?.accn ?? ""
      });
    }

    const q4Value = directQ4?.val ?? (
      definition.quarterlyStrategy === "discrete_or_subtract" &&
      annual &&
      q1Value !== null &&
      q2Value !== null &&
      q3Value !== null
        ? annual.val - q1Value - q2Value - q3Value
        : null
    );
    const q4Source = sourceFor(directQ4, q4Candidates) ?? sourceFor(annual, fyCandidates);
    if (q4Value !== null && q4Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ4 ?? annual)?.end),
        periodType: "quarterly",
        end: (directQ4 ?? annual)?.end ?? "",
        value: q4Value,
        concept: q4Source.concept,
        filing: (directQ4 ?? annual)?.form ?? "10-K",
        accession: (directQ4 ?? annual)?.accn ?? ""
      });
    }
  }

  return quarterlyCells
    .sort((left, right) => Date.parse(left.end) - Date.parse(right.end))
    .slice(-periods);
}

function buildTtmCell(
  definition: StatementMetricDefinition,
  quarterlyCells: PeriodCell[],
  annualCells: PeriodCell[]
): PeriodCell | null {
  if (definition.ttmStrategy === "none" || quarterlyCells.length < 4) {
    if (definition.ttmStrategy !== "latest_annual") {
      return null;
    }
  }

  if (definition.ttmStrategy === "latest_annual") {
    const latestAnnual = annualCells.at(-1);
    if (!latestAnnual) {
      return null;
    }

    return {
      label: "TTM",
      periodType: "ttm",
      end: latestAnnual.end,
      value: latestAnnual.value,
      concept: latestAnnual.concept,
      filing: "TTM",
      accession: latestAnnual.accession
    };
  }

  const lastFour = quarterlyCells.slice(-4);
  if (lastFour.length < 4) {
    return null;
  }

  let value: number;
  if (definition.ttmStrategy === "average") {
    value =
      lastFour.reduce((sum, cell) => sum + cell.value, 0) / lastFour.length;
  } else {
    value = lastFour.reduce((sum, cell) => sum + cell.value, 0);
  }

  return {
    label: "TTM",
    periodType: "ttm",
    end: lastFour[lastFour.length - 1]?.end ?? "",
    value,
    concept: lastFour.map((cell) => cell.concept).join("|"),
    filing: "TTM",
    accession: lastFour.map((cell) => cell.accession).join("|")
  };
}

function buildMetricSeries(
  definition: StatementMetricDefinition & { kind: "instant" | "duration" },
  companyFacts: SecCompanyFacts,
  frequency: StatementFrequency,
  periods: number,
  view: StatementView
): {
  displayCells: PeriodCell[];
  annualCells: PeriodCell[];
  quarterlyCells: PeriodCell[];
  currency: string;
} {
  const sourcedFacts = collectSourcedFacts(companyFacts, definition);
  const baseFacts = selectAnnualSourcedFacts(sourcedFacts, definition.kind);
  const annualCells = applyValueTransform(
    buildAnnualSeries(baseFacts, periods, view),
    definition.valueTransform
  );

  let quarterlyCells: PeriodCell[] = [];
  if (definition.kind === "instant") {
    quarterlyCells = applyValueTransform(
      buildInstantQuarterlySeries(sourcedFacts, periods + 4, view),
      definition.valueTransform
    );
  } else if (definition.kind === "duration") {
    quarterlyCells = applyValueTransform(
      buildDurationQuarterlySeries(
        definition as StatementMetricDefinition & { kind: "duration" },
        sourcedFacts,
        periods + 4,
        view
      ),
      definition.valueTransform
    );
  }

  const displayCells = frequency === "annual"
    ? annualCells
    : quarterlyCells.slice(-periods);

  const currency = definition.unit.startsWith("USD") ? "USD" : "USD";

  return {
    displayCells,
    annualCells,
    quarterlyCells,
    currency
  };
}

function buildDisplayRows(
  definitions: StatementMetricDefinition[],
  columns: string[],
  metricValues: Record<string, Record<string, number | null>>
): StatementRow[] {
  const rows: StatementRow[] = [];
  const seenSections = new Set<string>();

  for (const definition of definitions) {
    const sectionParts = definition.hierarchyPath.slice(0, -1);
    for (let index = 0; index < sectionParts.length; index += 1) {
      const sectionKey = sectionParts.slice(0, index + 1).join(" > ");
      if (seenSections.has(sectionKey)) {
        continue;
      }

      if (
        rows.some((row) =>
          row.label === (sectionParts[index] ?? sectionKey) &&
          row.depth === index &&
          row.rowKind === "metric"
        )
      ) {
        seenSections.add(sectionKey);
        continue;
      }

      seenSections.add(sectionKey);
      rows.push({
        metricCode: `section_${sectionKey.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        label: sectionParts[index] ?? sectionKey,
        depth: index,
        unit: "",
        rowKind: "section",
        values: columns.map(() => null),
        qualityFlags: []
      });
    }

    const metricRow = {
      metricCode: definition.metricCode,
      label: definition.label,
      depth: definition.hierarchyPath.length - 1,
      unit: definition.unit,
      rowKind: "metric",
      values: columns.map((column) => metricValues[definition.metricCode]?.[column] ?? null),
      qualityFlags: columns.every(
        (column) => metricValues[definition.metricCode]?.[column] === null
      )
        ? ["missing_metric"]
        : []
    } satisfies StatementRow;

    const existingSectionIndex = rows.findIndex(
      (row) =>
        row.label === metricRow.label &&
        row.depth === metricRow.depth &&
        row.rowKind === "section"
    );

    if (existingSectionIndex >= 0) {
      rows[existingSectionIndex] = metricRow;
      continue;
    }

    rows.push(metricRow);
  }

  return rows;
}

export function mapStatement(input: {
  ticker: string;
  requestedStatement: StatementType;
  frequency: StatementFrequency;
  view: StatementView;
  periods: number;
  includeTtm: boolean;
  companyFacts: SecCompanyFacts;
  submissions: SecSubmissions;
}): NormalizedStatementResponse {
  const sectorProfile = detectSectorProfile(input.submissions.sic);
  const definitions = getStatementDefinitions(input.requestedStatement, sectorProfile);
  const baseDefinitions = definitions.filter(isBaseDefinition);
  if (baseDefinitions.length === 0) {
    throw new NotFoundError(
      `No base metric definitions were found for ${input.requestedStatement}.`
    );
  }

  const metricValues: Record<string, Record<string, number | null>> = {};
  const facts: CanonicalFact[] = [];
  let outputColumns: string[] = [];
  let currency = "USD";
  const preparedSeries = baseDefinitions.map((definition) => ({
    definition,
    ...buildMetricSeries(
      definition,
      input.companyFacts,
      input.frequency,
      input.periods,
      input.view
    )
  }));

  const referenceSeries = preparedSeries
    .filter((series) => series.displayCells.length > 0)
    .sort((left, right) => {
      const rightEnd = Date.parse(right.displayCells.at(-1)?.end ?? "");
      const leftEnd = Date.parse(left.displayCells.at(-1)?.end ?? "");
      if (rightEnd !== leftEnd) {
        return rightEnd - leftEnd;
      }

      return right.displayCells.length - left.displayCells.length;
    })[0];

  if (!referenceSeries) {
    throw new NotFoundError(
      `No ${input.frequency} ${input.requestedStatement} data was found for ${input.ticker}.`
    );
  }

  outputColumns = referenceSeries.displayCells.map((cell) => cell.label);
  const hasAnyTtm =
    input.includeTtm &&
    input.frequency === "quarterly" &&
    isDurationStatement(input.requestedStatement) &&
    preparedSeries.some((series) =>
      buildTtmCell(series.definition, series.quarterlyCells, series.annualCells) !== null
    );
  if (hasAnyTtm) {
    outputColumns.push("TTM");
  }

  for (const series of preparedSeries) {
    const {
      definition,
      displayCells,
      annualCells,
      quarterlyCells,
      currency: metricCurrency
    } = series;

    metricValues[definition.metricCode] = Object.fromEntries(
      displayCells.map((cell) => [cell.label, cell.value])
    );

    for (const cell of displayCells) {
      facts.push({
        metricCode: definition.metricCode,
        displayLabel: definition.label,
        statement: definition.statement,
        periodType: cell.periodType,
        periodEnd: cell.end,
        periodLabel: cell.label,
        view: input.view,
        value: cell.value,
        unit: definition.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: definition.hierarchyPath,
        depth: definition.hierarchyPath.length - 1,
        sourceRegime: "sec_edgar",
        sourceConcept: cell.concept,
        sourceFiling: cell.filing,
        sourceAccession: cell.accession,
        qualityFlags: []
      });
    }

    if (
      input.includeTtm &&
      input.frequency === "quarterly" &&
      isDurationStatement(input.requestedStatement)
    ) {
      const ttmCell = buildTtmCell(definition, quarterlyCells, annualCells);
      if (ttmCell) {
        metricValues[definition.metricCode].TTM = ttmCell.value;
        facts.push({
          metricCode: definition.metricCode,
          displayLabel: definition.label,
          statement: definition.statement,
          periodType: "ttm",
          periodEnd: ttmCell.end,
          periodLabel: "TTM",
          view: input.view,
          value: ttmCell.value,
          unit: definition.unit,
          signPolicy: "natural_source_sign",
          hierarchyPath: definition.hierarchyPath,
          depth: definition.hierarchyPath.length - 1,
          sourceRegime: "sec_edgar",
          sourceConcept: ttmCell.concept,
          sourceFiling: ttmCell.filing,
          sourceAccession: ttmCell.accession,
          qualityFlags: []
        });
      }
    }

    currency = metricCurrency;
  }

  const computedDefinitions = definitions.filter((item) => item.derive);
  for (let pass = 0; pass < computedDefinitions.length; pass += 1) {
    let changed = false;

    for (const definition of computedDefinitions) {
      const previousValues = metricValues[definition.metricCode] ?? {};
      const nextValues = Object.fromEntries(
        outputColumns.map((column) => {
          const existingValue = previousValues[column] ?? null;
          if (existingValue !== null) {
            return [column, existingValue];
          }

          const inputs = Object.fromEntries(
            (definition.deriveDependencies ?? []).map((dependency) => [
              dependency,
              metricValues[dependency]?.[column] ?? null
            ])
          );
          return [column, definition.derive?.(inputs) ?? null];
        })
      );

      metricValues[definition.metricCode] = nextValues;

      if (JSON.stringify(previousValues) !== JSON.stringify(nextValues)) {
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  const factKeys = new Set(
    facts.map((fact) => `${fact.metricCode}:${fact.periodLabel}`)
  );

  for (const definition of computedDefinitions) {
    for (const column of outputColumns) {
      const value = metricValues[definition.metricCode]?.[column] ?? null;
      const factKey = `${definition.metricCode}:${column}`;
      if (value === null || factKeys.has(factKey)) {
        continue;
      }

      factKeys.add(factKey);
      facts.push({
        metricCode: definition.metricCode,
        displayLabel: definition.label,
        statement: definition.statement,
        periodType: column === "TTM" ? "ttm" : input.frequency,
        periodEnd: column === "TTM" ? facts.at(-1)?.periodEnd ?? "" : "",
        periodLabel: column,
        view: input.view,
        value,
        unit: definition.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: definition.hierarchyPath,
        depth: definition.hierarchyPath.length - 1,
        sourceRegime: "sec_edgar",
        sourceConcept: "derived",
        sourceFiling: column === "TTM" ? "TTM" : "derived",
        sourceAccession: "derived",
        qualityFlags: []
      });
    }
  }

  const rows = buildDisplayRows(definitions, outputColumns, metricValues);
  const fiscalYearEnd = formatFiscalYearEnd(input.submissions.fiscalYearEnd);
  const frequencyLabel = input.frequency === "annual" ? "Annual" : "Quarterly";
  const viewLabel = input.view === "restated" ? "Restated" : "AsReported";
  const qualityFlags: string[] = [];
  const returnedPeriods = input.frequency === "annual"
    ? outputColumns.filter((column) => column !== "TTM").length
    : outputColumns.filter((column) => column !== "TTM").length;
  const historyCoverage = returnedPeriods < input.periods ? "partial" : "full";
  const historyNote = historyCoverage === "partial"
    ? `Returned ${returnedPeriods} of ${input.periods} requested ${input.frequency} periods from sec_edgar.`
    : undefined;

  if (
    rows.some((row) => row.rowKind === "metric" && row.qualityFlags.length > 0)
  ) {
    qualityFlags.push("partial_statement");
  }

  if (isStale(referenceSeries.displayCells.at(-1)?.end)) {
    qualityFlags.push("stale_reference_period");
  }

  return {
    meta: {
      ticker: input.ticker,
      companyName: input.submissions.name,
      statement: input.requestedStatement,
      frequency: input.frequency,
      view: input.view,
      currency,
      fiscalYearEnd,
      titleSlug: `${input.ticker}_${input.requestedStatement.replaceAll("_", "-")}_${frequencyLabel}_${viewLabel}`,
      sourceRegime: "sec_edgar",
      sectorProfile,
      requestedPeriods: input.periods,
      returnedPeriods,
      historyCoverage,
      historyNote,
      qualityFlags
    },
    columns: outputColumns,
    rows,
    periods: Object.fromEntries(
      outputColumns.map((column) => [
        column,
        Object.fromEntries(
          rows
            .filter((row) => row.rowKind === "metric")
            .map((row) => [row.metricCode, metricValues[row.metricCode]?.[column] ?? null])
        )
      ])
    ),
    facts
  };
}
