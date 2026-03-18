import { NotFoundError, UpstreamError } from "../../../core/src";

type FetchLike = typeof fetch;

export interface NseFinancialResultEntry {
  symbol?: string;
  companyName?: string;
  audited?: string;
  cumulative?: string;
  period?: string;
  financialYear?: string;
  filingDate?: string;
  fromDate?: string;
  toDate?: string;
  xbrl?: string;
  consolidated?: string;
  isin?: string;
}

export interface ResolvedNseCompany {
  identifier: string;
  symbol: string;
  exchangeSymbol: string;
}

export interface IndiaOfficialFinancialRow extends Record<string, unknown> {
  date: Date;
  periodType?: string;
}

export interface IndiaOfficialApiOptions {
  fetchImpl?: FetchLike;
}

function browserHeaders(accept: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.9",
    accept,
    referer: "https://www.nseindia.com/",
    ...extra
  };
}

function collectCookies(response: Response): string {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const directCookies = headersWithSetCookie.getSetCookie?.() ?? [];
  if (directCookies.length > 0) {
    return directCookies.map((value) => value.split(";", 1)[0]).join("; ");
  }

  const combined = response.headers.get("set-cookie");
  if (!combined) {
    return "";
  }

  return combined
    .split(/,(?=[^;,]+?=)/)
    .map((value) => value.split(";", 1)[0].trim())
    .filter(Boolean)
    .join("; ");
}

function normalizeIndiaSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^NSE:/, "")
    .replace(/\.NS$/, "")
    .replace(/\.BO$/, "");
}

function parseNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFirstTagValue(xml: string, tagName: string, contextRef?: string): string | null {
  const contextClause = contextRef ? `[^>]*contextRef="${escapeRegex(contextRef)}"` : "";
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${escapeRegex(tagName)}${contextClause}[^>]*>([^<]+)</(?:[A-Za-z0-9_-]+:)?${escapeRegex(tagName)}>`,
    "i"
  );
  const match = xml.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function extractTagValues(xml: string, tagName: string, contextRef?: string): string[] {
  const contextClause = contextRef ? `[^>]*contextRef="${escapeRegex(contextRef)}"` : "";
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_-]+:)?${escapeRegex(tagName)}${contextClause}[^>]*>([^<]+)</(?:[A-Za-z0-9_-]+:)?${escapeRegex(tagName)}>`,
    "gi"
  );
  const values: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    values.push(match[1].trim());
  }
  return values;
}

function sum(...values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) {
    return null;
  }
  return numericValues.reduce((total, value) => total + value, 0);
}

function subtract(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left - right;
}

function negate(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return value === 0 ? 0 : -Math.abs(value);
}

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAnnualXbrl(xml: string): IndiaOfficialFinancialRow {
  const periodEnd = extractFirstTagValue(xml, "DateOfEndOfReportingPeriod") ?? extractFirstTagValue(xml, "DateOfEndOfReportingPeriod", "FourD");
  const date = toDate(periodEnd);

  if (!date) {
    throw new UpstreamError("NSE XBRL did not include an annual reporting-period end date.");
  }

  const operatingRevenue = parseNumber(extractFirstTagValue(xml, "RevenueFromOperations", "FourD"));
  const otherIncome = parseNumber(extractFirstTagValue(xml, "OtherIncome", "FourD"));
  const totalRevenue = parseNumber(extractFirstTagValue(xml, "Income", "FourD")) ?? sum(operatingRevenue, otherIncome);
  const costOfMaterialsConsumed = parseNumber(extractFirstTagValue(xml, "CostOfMaterialsConsumed", "FourD"));
  const purchasesOfStockInTrade = parseNumber(extractFirstTagValue(xml, "PurchasesOfStockInTrade", "FourD"));
  const changesInInventories = parseNumber(extractFirstTagValue(xml, "ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade", "FourD"));
  const costOfRevenue = sum(costOfMaterialsConsumed, purchasesOfStockInTrade, changesInInventories);
  const expenses = parseNumber(extractFirstTagValue(xml, "Expenses", "FourD"));
  const financeCosts = parseNumber(extractFirstTagValue(xml, "FinanceCosts", "FourD"));
  const depreciation = parseNumber(extractFirstTagValue(xml, "DepreciationDepletionAndAmortisationExpense", "FourD"));
  const employeeBenefitExpense = parseNumber(extractFirstTagValue(xml, "EmployeeBenefitExpense", "FourD"));
  const otherExpenses = parseNumber(extractFirstTagValue(xml, "OtherExpenses", "FourD"));
  const operatingExpense = subtract(expenses, costOfRevenue);
  const pretaxIncome = parseNumber(extractFirstTagValue(xml, "ProfitBeforeTax", "FourD"));
  const operatingIncome =
    sum(pretaxIncome, financeCosts) !== null && otherIncome !== null
      ? subtract(sum(pretaxIncome, financeCosts), otherIncome)
      : null;
  const netIncome = parseNumber(extractFirstTagValue(xml, "ProfitOrLossAttributableToOwnersOfParent", "FourD"))
    ?? parseNumber(extractFirstTagValue(xml, "ProfitLossForPeriod", "FourD"));
  const basicEps = parseNumber(extractFirstTagValue(xml, "BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations", "FourD"))
    ?? parseNumber(extractFirstTagValue(xml, "BasicEarningsLossPerShareFromContinuingOperations", "FourD"));
  const dilutedEps = parseNumber(extractFirstTagValue(xml, "DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations", "FourD"))
    ?? parseNumber(extractFirstTagValue(xml, "DilutedEarningsLossPerShareFromContinuingOperations", "FourD"));
  const faceValue = parseNumber(extractFirstTagValue(xml, "FaceValueOfEquityShareCapital", "FourD"))
    ?? parseNumber(extractFirstTagValue(xml, "FaceValueOfEquityShareCapital", "OneD"));
  const equityShareCapital = parseNumber(extractFirstTagValue(xml, "PaidUpValueOfEquityShareCapital", "FourD"))
    ?? parseNumber(extractFirstTagValue(xml, "EquityShareCapital", "OneI"));
  const shareCount = faceValue && faceValue !== 0 && equityShareCapital !== null
    ? equityShareCapital / faceValue
    : null;
  const cashFlowBalances = extractTagValues(xml, "CashAndCashEquivalentsCashFlowStatement", "FourD").map(parseNumber);

  const receivablesChange = sum(
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInTradeReceivablesCurrent", "FourD")),
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInTradeReceivablesNoncurrent", "FourD"))
  );
  const payableChange = sum(
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForIncreaseDecreaseInTradePayablesCurrent", "FourD")),
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForIncreaseDecreaseInTradePayablesNoncurrent", "FourD"))
  );
  const workingCapitalChange = sum(
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInInventories", "FourD")),
    receivablesChange,
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInOtherCurrentAssets", "FourD")),
    payableChange,
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForIncreaseDecreaseInOtherCurrentLiabilities", "FourD"))
  );
  const otherNonCashItems = sum(
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForInterestIncome", "FourD")),
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForDividendIncome", "FourD")),
    parseNumber(extractFirstTagValue(xml, "AdjustmentsForUnrealisedForeignExchangeLossesGains", "FourD")),
    parseNumber(extractFirstTagValue(xml, "OtherAdjustmentsForWhichCashEffectsAreInvestingOrFinancingCashFlow", "FourD"))
  );

  return {
    date,
    periodType: "annual",
    totalRevenue,
    operatingRevenue,
    grossProfit: operatingRevenue !== null && costOfRevenue !== null ? operatingRevenue - costOfRevenue : null,
    costOfRevenue,
    operatingExpense,
    sellingGeneralAndAdministration: otherExpenses,
    researchAndDevelopment: null,
    operatingIncome,
    otherNonOperatingIncomeExpenses: otherIncome !== null || financeCosts !== null
      ? sum(otherIncome, negate(financeCosts))
      : null,
    pretaxIncome,
    taxProvision: parseNumber(extractFirstTagValue(xml, "TaxExpense", "FourD")),
    netIncome,
    netIncomeCommonStockholders: netIncome,
    basicEPS: basicEps,
    dilutedEPS: dilutedEps,
    basicAverageShares: shareCount,
    dilutedAverageShares: shareCount,
    totalAssets: parseNumber(extractFirstTagValue(xml, "Assets", "OneI")),
    currentAssets: parseNumber(extractFirstTagValue(xml, "CurrentAssets", "OneI")),
    cashCashEquivalentsAndShortTermInvestments: sum(
      parseNumber(extractFirstTagValue(xml, "CashAndCashEquivalents", "OneI")),
      parseNumber(extractFirstTagValue(xml, "CurrentInvestments", "OneI"))
    ),
    cashAndCashEquivalents: parseNumber(extractFirstTagValue(xml, "CashAndCashEquivalents", "OneI")),
    cashFinancial: parseNumber(extractFirstTagValue(xml, "CashAndCashEquivalents", "OneI")),
    otherShortTermInvestments: parseNumber(extractFirstTagValue(xml, "CurrentInvestments", "OneI")),
    inventory: parseNumber(extractFirstTagValue(xml, "Inventories", "OneI")),
    receivables: parseNumber(extractFirstTagValue(xml, "TradeReceivablesCurrent", "OneI")),
    accountsReceivable: parseNumber(extractFirstTagValue(xml, "TradeReceivablesCurrent", "OneI")),
    otherCurrentAssets: parseNumber(extractFirstTagValue(xml, "OtherCurrentAssets", "OneI")),
    totalNonCurrentAssets: parseNumber(extractFirstTagValue(xml, "NoncurrentAssets", "OneI")),
    netPPE: parseNumber(extractFirstTagValue(xml, "PropertyPlantAndEquipment", "OneI")),
    grossPPE: sum(
      parseNumber(extractFirstTagValue(xml, "PropertyPlantAndEquipment", "OneI")),
      parseNumber(extractFirstTagValue(xml, "CapitalWorkInProgress", "OneI"))
    ),
    investmentsAndAdvances: parseNumber(extractFirstTagValue(xml, "NoncurrentInvestments", "OneI")),
    nonCurrentDeferredTaxesAssets: parseNumber(extractFirstTagValue(xml, "DeferredTaxAssetsNet", "OneI")),
    otherNonCurrentAssets: parseNumber(extractFirstTagValue(xml, "OtherNoncurrentAssets", "OneI")),
    totalLiabilitiesNetMinorityInterest: parseNumber(extractFirstTagValue(xml, "Liabilities", "OneI")),
    currentLiabilities: parseNumber(extractFirstTagValue(xml, "CurrentLiabilities", "OneI")),
    payablesAndAccruedExpenses: parseNumber(extractFirstTagValue(xml, "TradePayablesCurrent", "OneI")),
    payables: parseNumber(extractFirstTagValue(xml, "TradePayablesCurrent", "OneI")),
    currentDebt: parseNumber(extractFirstTagValue(xml, "BorrowingsCurrent", "OneI")),
    otherCurrentLiabilities: parseNumber(extractFirstTagValue(xml, "OtherCurrentLiabilities", "OneI")),
    totalNonCurrentLiabilitiesNetMinorityInterest: parseNumber(extractFirstTagValue(xml, "NoncurrentLiabilities", "OneI")),
    longTermDebt: parseNumber(extractFirstTagValue(xml, "BorrowingsNoncurrent", "OneI")),
    otherNonCurrentLiabilities: parseNumber(extractFirstTagValue(xml, "OtherNoncurrentLiabilities", "OneI")),
    stockholdersEquity: parseNumber(extractFirstTagValue(xml, "EquityAttributableToOwnersOfParent", "OneI")),
    commonStockEquity: parseNumber(extractFirstTagValue(xml, "EquityAttributableToOwnersOfParent", "OneI")),
    minorityInterest: parseNumber(extractFirstTagValue(xml, "NonControllingInterest", "OneI")),
    totalEquityGrossMinorityInterest: parseNumber(extractFirstTagValue(xml, "Equity", "OneI")),
    operatingCashFlow: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInOperatingActivities", "FourD")),
    cashFlowFromContinuingOperatingActivities: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInOperatingActivities", "FourD")),
    otherNonCashItems,
    depreciationAndAmortization: depreciation,
    reconciledDepreciation: depreciation,
    stockBasedCompensation: parseNumber(extractFirstTagValue(xml, "AdjustmentsForSharebasedPayments", "FourD")),
    changeInWorkingCapital: workingCapitalChange,
    changeInInventory: parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInInventories", "FourD")),
    changeInReceivables: receivablesChange,
    changesInAccountReceivables: receivablesChange,
    changeInOtherCurrentAssets: parseNumber(extractFirstTagValue(xml, "AdjustmentsForDecreaseIncreaseInOtherCurrentAssets", "FourD")),
    changeInPayablesAndAccruedExpense: payableChange,
    changeInPayable: payableChange,
    changeInOtherCurrentLiabilities: parseNumber(extractFirstTagValue(xml, "AdjustmentsForIncreaseDecreaseInOtherCurrentLiabilities", "FourD")),
    investingCashFlow: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInInvestingActivities", "FourD")),
    cashFlowFromContinuingInvestingActivities: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInInvestingActivities", "FourD")),
    purchaseOfPPE: negate(parseNumber(extractFirstTagValue(xml, "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "FourD"))),
    capitalExpenditure: negate(parseNumber(extractFirstTagValue(xml, "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "FourD"))),
    financingCashFlow: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInFinancingActivities", "FourD")),
    cashFlowFromContinuingFinancingActivities: parseNumber(extractFirstTagValue(xml, "CashFlowsFromUsedInFinancingActivities", "FourD")),
    issuanceOfDebt: parseNumber(extractFirstTagValue(xml, "ProceedsFromBorrowingsClassifiedAsFinancingActivities", "FourD")),
    repaymentOfDebt: negate(parseNumber(extractFirstTagValue(xml, "RepaymentsOfBorrowingsClassifiedAsFinancingActivities", "FourD"))),
    longTermDebtPayments: negate(parseNumber(extractFirstTagValue(xml, "RepaymentsOfBorrowingsClassifiedAsFinancingActivities", "FourD"))),
    cashDividendsPaid: negate(parseNumber(extractFirstTagValue(xml, "DividendsPaidClassifiedAsFinancingActivities", "FourD"))),
    commonStockDividendPaid: negate(parseNumber(extractFirstTagValue(xml, "DividendsPaidClassifiedAsFinancingActivities", "FourD"))),
    changesInCash: parseNumber(extractFirstTagValue(xml, "IncreaseDecreaseInCashAndCashEquivalents", "FourD")),
    beginningCashPosition: cashFlowBalances[0] ?? null,
    endCashPosition: cashFlowBalances.at(-1) ?? null
  };
}

export function selectPreferredAnnualResults(
  entries: NseFinancialResultEntry[]
): NseFinancialResultEntry[] {
  const byPeriod = new Map<string, NseFinancialResultEntry[]>();

  for (const entry of entries) {
    if (
      entry.period !== "Annual" ||
      entry.cumulative !== "Cumulative" ||
      typeof entry.toDate !== "string" ||
      typeof entry.xbrl !== "string" ||
      !entry.xbrl.startsWith("http")
    ) {
      continue;
    }

    const key = entry.toDate;
    const bucket = byPeriod.get(key) ?? [];
    bucket.push(entry);
    byPeriod.set(key, bucket);
  }

  const pickScore = (entry: NseFinancialResultEntry): number => {
    let score = 0;
    if (entry.consolidated === "Consolidated") score += 100;
    if (entry.audited === "Audited") score += 10;
    if (entry.xbrl) score += 1;
    return score;
  };

  return [...byPeriod.entries()]
    .map(([, bucket]) =>
      [...bucket].sort((left, right) => {
        const scoreDiff = pickScore(right) - pickScore(left);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return (right.filingDate ?? "").localeCompare(left.filingDate ?? "");
      })[0]
    )
    .sort((left, right) => (left.toDate ?? "").localeCompare(right.toDate ?? ""));
}

export function createIndiaOfficialApi(options: IndiaOfficialApiOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let cookiePromise: Promise<string> | null = null;

  async function ensureCookies(): Promise<string> {
    if (!cookiePromise) {
      cookiePromise = (async () => {
        const response = await fetchImpl("https://www.nseindia.com/", {
          headers: browserHeaders("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        });

        if (!response.ok) {
          throw new UpstreamError("Failed to warm NSE session.", {
            status: response.status,
            body: await response.text()
          });
        }

        return collectCookies(response);
      })();
    }

    return cookiePromise;
  }

  async function getJson<T>(url: string): Promise<T> {
    const cookies = await ensureCookies();
    const response = await fetchImpl(url, {
      headers: {
        ...browserHeaders("application/json,text/plain,*/*"),
        cookie: cookies
      }
    });

    if (response.status === 404) {
      throw new NotFoundError(`NSE resource was not found at ${url}.`, {
        regime: "india_placeholder",
        url
      });
    }

    if (!response.ok) {
      throw new UpstreamError("NSE request failed.", {
        url,
        status: response.status,
        body: await response.text()
      });
    }

    return (await response.json()) as T;
  }

  return {
    resolveCompany(identifier: string, aliases: Record<string, string> = {}): ResolvedNseCompany {
      const normalized = identifier.trim().toUpperCase();
      const aliased = aliases[normalized];
      const exchangeSymbol = normalizeIndiaSymbol(aliased ?? normalized);

      if (!/^[A-Z0-9&.-]+$/.test(exchangeSymbol)) {
        throw new NotFoundError(
          `No NSE symbol mapping could be resolved for identifier ${identifier}.`,
          { regime: "india_placeholder", identifier }
        );
      }

      return {
        identifier: normalized,
        symbol: `${exchangeSymbol}.NS`,
        exchangeSymbol
      };
    },

    async getAnnualFinancialResults(symbol: string): Promise<NseFinancialResultEntry[]> {
      const normalized = normalizeIndiaSymbol(symbol);
      const url = new URL("https://www.nseindia.com/api/corporates-financial-results");
      url.searchParams.set("index", "equities");
      url.searchParams.set("symbol", normalized);
      url.searchParams.set("period", "Annual");
      const entries = await getJson<NseFinancialResultEntry[]>(url.toString());
      return entries.filter((entry) => entry.symbol?.toUpperCase() === normalized);
    },

    async downloadXbrl(url: string): Promise<string> {
      const response = await fetchImpl(url, {
        headers: browserHeaders("application/xml,text/xml,*/*")
      });

      if (!response.ok) {
        throw new UpstreamError("NSE XBRL download failed.", {
          url,
          status: response.status,
          body: await response.text()
        });
      }

      return response.text();
    },

    parseAnnualXbrl
  };
}
