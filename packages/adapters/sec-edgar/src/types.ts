export interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

export interface SecCompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, SecConceptNode>>;
}

export interface SecConceptNode {
  label?: string;
  description?: string;
  units: Record<string, SecFactUnit[]>;
}

export interface SecFactUnit {
  start?: string;
  end?: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

export interface SecSubmissions {
  name: string;
  tickers: string[];
  sic?: string;
  fiscalYearEnd?: string;
  filings: {
    recent: Record<string, string[]>;
  };
}
