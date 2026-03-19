import { describe, expect, it } from "vitest";
import {
  createIndiaOfficialApi,
  selectPreferredAnnualResults
} from "../../adapters/india/src";
import { createIndiaPlaceholderClient } from "../../adapters/india/src";

function createAnnualXbrl(input: {
  yearEnd: string;
  startDate: string;
  revenue: number;
  otherIncome: number;
  pretaxIncome: number;
  taxExpense: number;
  netIncome: number;
  dilutedEps: number;
  equityCapital: number;
  assets: number;
  currentAssets: number;
  currentInvestments: number;
  cash: number;
  inventory: number;
  receivables: number;
  otherCurrentAssets: number;
  nonCurrentAssets: number;
  ppe: number;
  capex: number;
  liabilities: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;
  borrowingsCurrent: number;
  borrowingsNonCurrent: number;
  tradePayables: number;
  equity: number;
  ownersEquity: number;
  minorityInterest: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  changeInCash: number;
  beginningCash: number;
  endingCash: number;
}): string {
  const basicShares = input.equityCapital / 10;
  return `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin/2020-03-31/in-bse-fin" xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context id="FourD">
    <xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>${input.startDate}</xbrli:startDate><xbrli:endDate>${input.yearEnd}</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <xbrli:context id="OneI">
    <xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>${input.yearEnd}</xbrli:instant></xbrli:period>
  </xbrli:context>
  <in-bse-fin:DateOfStartOfReportingPeriod contextRef="FourD">${input.startDate}</in-bse-fin:DateOfStartOfReportingPeriod>
  <in-bse-fin:DateOfEndOfReportingPeriod contextRef="FourD">${input.yearEnd}</in-bse-fin:DateOfEndOfReportingPeriod>
  <in-bse-fin:RevenueFromOperations contextRef="FourD">${input.revenue}</in-bse-fin:RevenueFromOperations>
  <in-bse-fin:OtherIncome contextRef="FourD">${input.otherIncome}</in-bse-fin:OtherIncome>
  <in-bse-fin:Income contextRef="FourD">${input.revenue + input.otherIncome}</in-bse-fin:Income>
  <in-bse-fin:CostOfMaterialsConsumed contextRef="FourD">${Math.round(input.revenue * 0.35)}</in-bse-fin:CostOfMaterialsConsumed>
  <in-bse-fin:PurchasesOfStockInTrade contextRef="FourD">${Math.round(input.revenue * 0.2)}</in-bse-fin:PurchasesOfStockInTrade>
  <in-bse-fin:ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade contextRef="FourD">-20000000000</in-bse-fin:ChangesInInventoriesOfFinishedGoodsWorkInProgressAndStockInTrade>
  <in-bse-fin:Expenses contextRef="FourD">${input.revenue + input.otherIncome - input.pretaxIncome}</in-bse-fin:Expenses>
  <in-bse-fin:FinanceCosts contextRef="FourD">230000000000</in-bse-fin:FinanceCosts>
  <in-bse-fin:DepreciationDepletionAndAmortisationExpense contextRef="FourD">500000000000</in-bse-fin:DepreciationDepletionAndAmortisationExpense>
  <in-bse-fin:EmployeeBenefitExpense contextRef="FourD">260000000000</in-bse-fin:EmployeeBenefitExpense>
  <in-bse-fin:OtherExpenses contextRef="FourD">1400000000000</in-bse-fin:OtherExpenses>
  <in-bse-fin:ProfitBeforeTax contextRef="FourD">${input.pretaxIncome}</in-bse-fin:ProfitBeforeTax>
  <in-bse-fin:TaxExpense contextRef="FourD">${input.taxExpense}</in-bse-fin:TaxExpense>
  <in-bse-fin:CurrentTax contextRef="FourD">${Math.round(input.taxExpense * 0.8)}</in-bse-fin:CurrentTax>
  <in-bse-fin:DeferredTax contextRef="FourD">${Math.round(input.taxExpense * 0.2)}</in-bse-fin:DeferredTax>
  <in-bse-fin:ProfitOrLossAttributableToOwnersOfParent contextRef="FourD">${input.netIncome}</in-bse-fin:ProfitOrLossAttributableToOwnersOfParent>
  <in-bse-fin:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod contextRef="FourD">12000000000</in-bse-fin:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod>
  <in-bse-fin:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations contextRef="FourD">${input.dilutedEps}</in-bse-fin:BasicEarningsLossPerShareFromContinuingAndDiscontinuedOperations>
  <in-bse-fin:DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations contextRef="FourD">${input.dilutedEps}</in-bse-fin:DilutedEarningsLossPerShareFromContinuingAndDiscontinuedOperations>
  <in-bse-fin:PaidUpValueOfEquityShareCapital contextRef="FourD">${input.equityCapital}</in-bse-fin:PaidUpValueOfEquityShareCapital>
  <in-bse-fin:FaceValueOfEquityShareCapital contextRef="FourD">10</in-bse-fin:FaceValueOfEquityShareCapital>
  <in-bse-fin:Assets contextRef="OneI">${input.assets}</in-bse-fin:Assets>
  <in-bse-fin:CurrentAssets contextRef="OneI">${input.currentAssets}</in-bse-fin:CurrentAssets>
  <in-bse-fin:CurrentInvestments contextRef="OneI">${input.currentInvestments}</in-bse-fin:CurrentInvestments>
  <in-bse-fin:CashAndCashEquivalents contextRef="OneI">${input.cash}</in-bse-fin:CashAndCashEquivalents>
  <in-bse-fin:Inventories contextRef="OneI">${input.inventory}</in-bse-fin:Inventories>
  <in-bse-fin:TradeReceivablesCurrent contextRef="OneI">${input.receivables}</in-bse-fin:TradeReceivablesCurrent>
  <in-bse-fin:OtherCurrentAssets contextRef="OneI">${input.otherCurrentAssets}</in-bse-fin:OtherCurrentAssets>
  <in-bse-fin:NoncurrentAssets contextRef="OneI">${input.nonCurrentAssets}</in-bse-fin:NoncurrentAssets>
  <in-bse-fin:PropertyPlantAndEquipment contextRef="OneI">${input.ppe}</in-bse-fin:PropertyPlantAndEquipment>
  <in-bse-fin:NoncurrentInvestments contextRef="OneI">1000000000000</in-bse-fin:NoncurrentInvestments>
  <in-bse-fin:DeferredTaxAssetsNet contextRef="OneI">10000000000</in-bse-fin:DeferredTaxAssetsNet>
  <in-bse-fin:OtherNoncurrentAssets contextRef="OneI">400000000000</in-bse-fin:OtherNoncurrentAssets>
  <in-bse-fin:Liabilities contextRef="OneI">${input.liabilities}</in-bse-fin:Liabilities>
  <in-bse-fin:CurrentLiabilities contextRef="OneI">${input.currentLiabilities}</in-bse-fin:CurrentLiabilities>
  <in-bse-fin:NoncurrentLiabilities contextRef="OneI">${input.nonCurrentLiabilities}</in-bse-fin:NoncurrentLiabilities>
  <in-bse-fin:BorrowingsCurrent contextRef="OneI">${input.borrowingsCurrent}</in-bse-fin:BorrowingsCurrent>
  <in-bse-fin:BorrowingsNoncurrent contextRef="OneI">${input.borrowingsNonCurrent}</in-bse-fin:BorrowingsNoncurrent>
  <in-bse-fin:TradePayablesCurrent contextRef="OneI">${input.tradePayables}</in-bse-fin:TradePayablesCurrent>
  <in-bse-fin:OtherCurrentLiabilities contextRef="OneI">550000000000</in-bse-fin:OtherCurrentLiabilities>
  <in-bse-fin:OtherNoncurrentLiabilities contextRef="OneI">45000000000</in-bse-fin:OtherNoncurrentLiabilities>
  <in-bse-fin:Equity contextRef="OneI">${input.equity}</in-bse-fin:Equity>
  <in-bse-fin:EquityAttributableToOwnersOfParent contextRef="OneI">${input.ownersEquity}</in-bse-fin:EquityAttributableToOwnersOfParent>
  <in-bse-fin:NonControllingInterest contextRef="OneI">${input.minorityInterest}</in-bse-fin:NonControllingInterest>
  <in-bse-fin:CashFlowsFromUsedInOperatingActivities contextRef="FourD">${input.operatingCashFlow}</in-bse-fin:CashFlowsFromUsedInOperatingActivities>
  <in-bse-fin:AdjustmentsForDecreaseIncreaseInInventories contextRef="FourD">-120000000000</in-bse-fin:AdjustmentsForDecreaseIncreaseInInventories>
  <in-bse-fin:AdjustmentsForDecreaseIncreaseInTradeReceivablesCurrent contextRef="FourD">-150000000000</in-bse-fin:AdjustmentsForDecreaseIncreaseInTradeReceivablesCurrent>
  <in-bse-fin:AdjustmentsForIncreaseDecreaseInTradePayablesCurrent contextRef="FourD">340000000000</in-bse-fin:AdjustmentsForIncreaseDecreaseInTradePayablesCurrent>
  <in-bse-fin:AdjustmentsForDepreciationAndAmortisationExpense contextRef="FourD">500000000000</in-bse-fin:AdjustmentsForDepreciationAndAmortisationExpense>
  <in-bse-fin:AdjustmentsForInterestIncome contextRef="FourD">100000000000</in-bse-fin:AdjustmentsForInterestIncome>
  <in-bse-fin:AdjustmentsForDividendIncome contextRef="FourD">1000000000</in-bse-fin:AdjustmentsForDividendIncome>
  <in-bse-fin:AdjustmentsForUnrealisedForeignExchangeLossesGains contextRef="FourD">-10000000000</in-bse-fin:AdjustmentsForUnrealisedForeignExchangeLossesGains>
  <in-bse-fin:OtherAdjustmentsForWhichCashEffectsAreInvestingOrFinancingCashFlow contextRef="FourD">-15000000000</in-bse-fin:OtherAdjustmentsForWhichCashEffectsAreInvestingOrFinancingCashFlow>
  <in-bse-fin:CashFlowsFromUsedInInvestingActivities contextRef="FourD">${input.investingCashFlow}</in-bse-fin:CashFlowsFromUsedInInvestingActivities>
  <in-bse-fin:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities contextRef="FourD">${input.capex}</in-bse-fin:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities>
  <in-bse-fin:CashFlowsFromUsedInFinancingActivities contextRef="FourD">${input.financingCashFlow}</in-bse-fin:CashFlowsFromUsedInFinancingActivities>
  <in-bse-fin:ProceedsFromBorrowingsClassifiedAsFinancingActivities contextRef="FourD">450000000000</in-bse-fin:ProceedsFromBorrowingsClassifiedAsFinancingActivities>
  <in-bse-fin:RepaymentsOfBorrowingsClassifiedAsFinancingActivities contextRef="FourD">320000000000</in-bse-fin:RepaymentsOfBorrowingsClassifiedAsFinancingActivities>
  <in-bse-fin:DividendsPaidClassifiedAsFinancingActivities contextRef="FourD">60000000000</in-bse-fin:DividendsPaidClassifiedAsFinancingActivities>
  <in-bse-fin:IncreaseDecreaseInCashAndCashEquivalents contextRef="FourD">${input.changeInCash}</in-bse-fin:IncreaseDecreaseInCashAndCashEquivalents>
  <in-bse-fin:CashAndCashEquivalentsCashFlowStatement contextRef="FourD">${input.beginningCash}</in-bse-fin:CashAndCashEquivalentsCashFlowStatement>
  <in-bse-fin:CashAndCashEquivalentsCashFlowStatement contextRef="FourD">${input.endingCash}</in-bse-fin:CashAndCashEquivalentsCashFlowStatement>
</xbrli:xbrl>`;
}

function createLegacyBalanceXbrl(input: {
  yearEnd: string;
  startDate: string;
  revenue: number;
  pretaxIncome: number;
  netIncome: number;
  totalAssets: number;
  equityCapital: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:in-bse-fin="http://www.bseindia.com/xbrl/fin/2019-03-31/in-bse-fin" xmlns:xbrli="http://www.xbrl.org/2003/instance">
  <xbrli:context id="FourD">
    <xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>${input.startDate}</xbrli:startDate><xbrli:endDate>${input.yearEnd}</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <xbrli:context id="OneI">
    <xbrli:entity><xbrli:identifier scheme="http://www.nseindia.com/NSESymbol">RELIANCE</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>${input.yearEnd}</xbrli:instant></xbrli:period>
  </xbrli:context>
  <in-bse-fin:DateOfEndOfReportingPeriod contextRef="FourD">${input.yearEnd}</in-bse-fin:DateOfEndOfReportingPeriod>
  <in-bse-fin:Income contextRef="FourD">${input.revenue}</in-bse-fin:Income>
  <in-bse-fin:ProfitBeforeTax contextRef="FourD">${input.pretaxIncome}</in-bse-fin:ProfitBeforeTax>
  <in-bse-fin:ProfitOrLossAttributableToOwnersOfParent contextRef="FourD">${input.netIncome}</in-bse-fin:ProfitOrLossAttributableToOwnersOfParent>
  <in-bse-fin:PaidUpValueOfEquityShareCapital contextRef="FourD">${input.equityCapital}</in-bse-fin:PaidUpValueOfEquityShareCapital>
  <in-bse-fin:FaceValueOfEquityShareCapital contextRef="FourD">10</in-bse-fin:FaceValueOfEquityShareCapital>
  <in-bse-fin:NetSegmentAssets contextRef="OneI">${input.totalAssets}</in-bse-fin:NetSegmentAssets>
  <in-bse-fin:SegmentLiabilities contextRef="OneI">660330000000</in-bse-fin:SegmentLiabilities>
  <in-bse-fin:UnAllocableLiabilities contextRef="OneI">${input.totalAssets - 660330000000}</in-bse-fin:UnAllocableLiabilities>
  <in-bse-fin:NetSegmentLiabilities contextRef="OneI">${input.totalAssets}</in-bse-fin:NetSegmentLiabilities>
</xbrli:xbrl>`;
}

describe("india official api", () => {
  it("prefers consolidated annual entries per fiscal year", () => {
    const selected = selectPreferredAnnualResults([
      { symbol: "RELIANCE", period: "Annual", cumulative: "Cumulative", toDate: "2025-03-31", xbrl: "https://archive.example/standalone.xml", consolidated: "Non-Consolidated", filingDate: "22-Apr-2025 19:40" },
      { symbol: "RELIANCE", period: "Annual", cumulative: "Cumulative", toDate: "2025-03-31", xbrl: "https://archive.example/consolidated.xml", consolidated: "Consolidated", filingDate: "22-Apr-2025 19:47" },
      { symbol: "RELIANCE", period: "Annual", cumulative: "Cumulative", toDate: "2024-03-31", xbrl: "https://archive.example/older.xml", consolidated: "Consolidated", filingDate: "22-Apr-2024 19:47" }
    ]);

    expect(selected.map((entry) => entry.xbrl)).toEqual([
      "https://archive.example/older.xml",
      "https://archive.example/consolidated.xml"
    ]);
  });

  it("parses annual India XBRL into statement rows", () => {
    const api = createIndiaOfficialApi();
    const row = api.parseAnnualXbrl(createAnnualXbrl({
      startDate: "2024-04-01",
      yearEnd: "2025-03-31",
      revenue: 9646930000000,
      otherIncome: 150000000000,
      pretaxIncome: 1060170000000,
      taxExpense: 252300000000,
      netIncome: 696480000000,
      dilutedEps: 51.47,
      equityCapital: 135324105770,
      assets: 19501210000000,
      currentAssets: 4992700000000,
      currentInvestments: 1100000000000,
      cash: 1065020000000,
      inventory: 1527700000000,
      receivables: 316280000000,
      otherCurrentAssets: 558250000000,
      nonCurrentAssets: 14508510000000,
      ppe: 6400000000000,
      capex: 1528830000000,
      liabilities: 9404950000000,
      currentLiabilities: 4537370000000,
      nonCurrentLiabilities: 4867580000000,
      borrowingsCurrent: 1019100000000,
      borrowingsNonCurrent: 2227120000000,
      tradePayables: 1783770000000,
      equity: 10096260000000,
      ownersEquity: 8432000000000,
      minorityInterest: 1664260000000,
      operatingCashFlow: 1787030000000,
      investingCashFlow: -1375350000000,
      financingCashFlow: -318910000000,
      changeInCash: 92770000000,
      beginningCash: 972250000000,
      endingCash: 1065020000000
    }));

    expect(row.totalRevenue).toBe(9796930000000);
    expect(row.netIncomeCommonStockholders).toBe(696480000000);
    expect(row.totalAssets).toBe(19501210000000);
    expect(row.employeeBenefitExpense).toBe(260000000000);
    expect(row.financeCosts).toBe(230000000000);
    expect(row.currentTax).toBe(201840000000);
    expect(row.deferredTax).toBe(50460000000);
    expect(row.equityMethodIncome).toBe(12000000000);
    expect(row.operatingCashFlow).toBe(1787030000000);
    expect(row.purchaseOfPPE).toBe(-1528830000000);
  });

  it("falls back to legacy balance-sheet tags for older NSE XBRL", () => {
    const api = createIndiaOfficialApi();
    const row = api.parseAnnualXbrl(createLegacyBalanceXbrl({
      startDate: "2021-04-01",
      yearEnd: "2022-03-31",
      revenue: 4592470000000,
      pretaxIncome: 467860000000,
      netIncome: 390840000000,
      totalAssets: 8955620000000,
      equityCapital: 67650000000
    }));

    expect(row.totalAssets).toBe(8955620000000);
    expect(row.totalRevenue).toBe(4592470000000);
    expect(row.netIncomeCommonStockholders).toBe(390840000000);
  });

  it("builds annual India statements from official NSE XBRL", async () => {
    const xml2024 = createAnnualXbrl({
      startDate: "2023-04-01",
      yearEnd: "2024-03-31",
      revenue: 9010640000000,
      otherIncome: 120000000000,
      pretaxIncome: 1043400000000,
      taxExpense: 257070000000,
      netIncome: 696210000000,
      dilutedEps: 51.45,
      equityCapital: 135324813700,
      assets: 18501210000000,
      currentAssets: 4701000000000,
      currentInvestments: 1061700000000,
      cash: 972250000000,
      inventory: 1527700000000,
      receivables: 316280000000,
      otherCurrentAssets: 558250000000,
      nonCurrentAssets: 13800210000000,
      ppe: 6060840000000,
      capex: 1528830000000,
      liabilities: 9004950000000,
      currentLiabilities: 3973670000000,
      nonCurrentLiabilities: 4328310000000,
      borrowingsCurrent: 1019100000000,
      borrowingsNonCurrent: 2227120000000,
      tradePayables: 1783770000000,
      equity: 9501260000000,
      ownersEquity: 7934810000000,
      minorityInterest: 1566450000000,
      operatingCashFlow: 1587880000000,
      investingCashFlow: -1143010000000,
      financingCashFlow: -166460000000,
      changeInCash: 278410000000,
      beginningCash: 693840000000,
      endingCash: 972250000000
    });
    const xml2025 = createAnnualXbrl({
      startDate: "2024-04-01",
      yearEnd: "2025-03-31",
      revenue: 9646930000000,
      otherIncome: 140000000000,
      pretaxIncome: 1060170000000,
      taxExpense: 252300000000,
      netIncome: 696480000000,
      dilutedEps: 51.47,
      equityCapital: 135324105800,
      assets: 19501210000000,
      currentAssets: 4992700000000,
      currentInvestments: 1150000000000,
      cash: 1065020000000,
      inventory: 1600000000000,
      receivables: 330000000000,
      otherCurrentAssets: 600000000000,
      nonCurrentAssets: 14508510000000,
      ppe: 6400000000000,
      capex: 1600000000000,
      liabilities: 9404950000000,
      currentLiabilities: 4537370000000,
      nonCurrentLiabilities: 4867580000000,
      borrowingsCurrent: 950000000000,
      borrowingsNonCurrent: 2300000000000,
      tradePayables: 1850000000000,
      equity: 10096260000000,
      ownersEquity: 8432000000000,
      minorityInterest: 1664260000000,
      operatingCashFlow: 1787030000000,
      investingCashFlow: -1375350000000,
      financingCashFlow: -318910000000,
      changeInCash: 92770000000,
      beginningCash: 972250000000,
      endingCash: 1065020000000
    });

    const responses = [
      new Response("<html></html>", {
        status: 200,
        headers: {
          "set-cookie": "ak_bmsc=abc123; Path=/, bm_sv=def456; Path=/"
        }
      }),
      new Response(JSON.stringify([
        {
          symbol: "RELIANCE",
          companyName: "Reliance Industries Limited",
          audited: "Audited",
          cumulative: "Cumulative",
          period: "Annual",
          financialYear: "01-Apr-2023 To 31-Mar-2024",
          filingDate: "22-Apr-2024 19:47",
          fromDate: "01-Apr-2023",
          toDate: "31-Mar-2024",
          xbrl: "https://archive.example/2024.xml",
          consolidated: "Consolidated"
        },
        {
          symbol: "RELIANCE",
          companyName: "Reliance Industries Limited",
          audited: "Audited",
          cumulative: "Cumulative",
          period: "Annual",
          financialYear: "01-Apr-2024 To 31-Mar-2025",
          filingDate: "18-Apr-2025 19:47",
          fromDate: "01-Apr-2024",
          toDate: "31-Mar-2025",
          xbrl: "https://archive.example/2025.xml",
          consolidated: "Consolidated"
        }
      ]), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }),
      new Response(xml2024, { status: 200 }),
      new Response(xml2025, { status: 200 })
    ];

    const fetchImpl: typeof fetch = async () => {
      const next = responses.shift();
      if (!next) {
        throw new Error("Unexpected fetch");
      }
      return next;
    };

    const client = createIndiaPlaceholderClient({ fetchImpl });
    const statement = await client.getStatement({
      identifier: "RELIANCE",
      statement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      view: "restated"
    });

    expect(statement.meta.companyName).toBe("Reliance Industries Limited");
    expect(statement.meta.currency).toBe("INR");
    expect(statement.meta.qualityFlags).toContain("official_nse_xbrl");
    expect(statement.columns).toEqual(["2024", "2025"]);
    expect(statement.periods["2025"].revenue_total).toBe(9786930000000);
    expect(statement.periods["2025"].net_income_available_to_common_stockholders).toBe(696480000000);
  });
});
