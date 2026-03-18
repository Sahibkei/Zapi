import { AuthenticationError, NotFoundError, UpstreamError } from "../../../core/src";

type FetchLike = typeof fetch;

export interface CompaniesHouseSearchItem {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  kind?: string;
}

export interface CompaniesHouseSearchResponse {
  items?: CompaniesHouseSearchItem[];
}

export interface CompaniesHouseProfile {
  company_name?: string;
  company_number?: string;
  company_status?: string;
  type?: string;
}

export interface CompaniesHouseFilingHistoryItem {
  category?: string;
  date?: string;
  description?: string;
  links?: {
    document_metadata?: string;
    self?: string;
  };
  type?: string;
}

export interface CompaniesHouseFilingHistoryResponse {
  items?: CompaniesHouseFilingHistoryItem[];
}

export interface CompaniesHouseDocumentMetadata {
  company_number?: string;
  created_at?: string;
  etag?: string;
  id?: string;
  pages?: number;
  resources?: Record<string, unknown>;
  updated_at?: string;
}

export interface ResolvedCompaniesHouseCompany {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
}

export interface CompaniesHouseOfficialApiOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
}

function createAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function normalizeCompanyNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function extractDocumentId(documentMetadataLink: string): string | null {
  const match = documentMetadataLink.match(/\/document\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export function selectLatestAccountsFiling(
  items: CompaniesHouseFilingHistoryItem[]
): CompaniesHouseFilingHistoryItem | null {
  return [...items]
    .filter((item) =>
      item.category === "accounts" &&
      typeof item.links?.document_metadata === "string" &&
      typeof item.date === "string"
    )
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""))[0] ?? null;
}

export function createCompaniesHouseOfficialApi(
  options: CompaniesHouseOfficialApiOptions
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = createAuthHeader(options.apiKey);

  async function getJson<T>(url: string): Promise<T> {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: authorization,
        Accept: "application/json"
      }
    });

    if (response.status === 401) {
      throw new AuthenticationError("Companies House API key was rejected.");
    }

    if (response.status === 404) {
      throw new NotFoundError(`Companies House resource was not found at ${url}.`);
    }

    if (!response.ok) {
      throw new UpstreamError("Companies House request failed.", {
        url,
        status: response.status,
        body: await response.text()
      });
    }

    return readJson<T>(response);
  }

  return {
    async searchCompanies(query: string, itemsPerPage = 10): Promise<CompaniesHouseSearchItem[]> {
      const url = new URL("https://api.company-information.service.gov.uk/search/companies");
      url.searchParams.set("q", query);
      url.searchParams.set("items_per_page", itemsPerPage.toString());
      const response = await getJson<CompaniesHouseSearchResponse>(url.toString());
      return response.items ?? [];
    },

    async getCompanyProfile(companyNumber: string): Promise<CompaniesHouseProfile> {
      return getJson<CompaniesHouseProfile>(
        `https://api.company-information.service.gov.uk/company/${normalizeCompanyNumber(companyNumber)}`
      );
    },

    async getFilingHistory(
      companyNumber: string,
      itemsPerPage = 25
    ): Promise<CompaniesHouseFilingHistoryItem[]> {
      const url = new URL(
        `https://api.company-information.service.gov.uk/company/${normalizeCompanyNumber(companyNumber)}/filing-history`
      );
      url.searchParams.set("items_per_page", itemsPerPage.toString());
      const response = await getJson<CompaniesHouseFilingHistoryResponse>(url.toString());
      return response.items ?? [];
    },

    async getDocumentMetadata(documentId: string): Promise<CompaniesHouseDocumentMetadata> {
      return getJson<CompaniesHouseDocumentMetadata>(
        `https://document-api.company-information.service.gov.uk/document/${documentId}`
      );
    },

    async resolveCompany(
      identifier: string,
      aliases: Record<string, string> = {}
    ): Promise<ResolvedCompaniesHouseCompany> {
      const normalized = identifier.trim().toUpperCase();
      const aliasedCompanyNumber = aliases[normalized];

      if (aliasedCompanyNumber) {
        const profile = await this.getCompanyProfile(aliasedCompanyNumber);
        return {
          companyNumber: profile.company_number ?? aliasedCompanyNumber,
          companyName: profile.company_name ?? normalized,
          companyStatus: profile.company_status ?? "unknown"
        };
      }

      if (/^[A-Z0-9]{1,8}$/.test(normalized) && /\d/.test(normalized)) {
        const profile = await this.getCompanyProfile(normalized);
        return {
          companyNumber: profile.company_number ?? normalized,
          companyName: profile.company_name ?? normalized,
          companyStatus: profile.company_status ?? "unknown"
        };
      }

      const results = await this.searchCompanies(identifier);
      const preferred = results.find((item) =>
        item.kind === "searchresults#company" &&
        item.company_status === "active" &&
        typeof item.company_number === "string"
      ) ?? results.find((item) => typeof item.company_number === "string");

      if (!preferred?.company_number) {
        throw new NotFoundError(
          `No Companies House company mapping could be resolved for identifier ${identifier}.`,
          { regime: "companies_house", identifier }
        );
      }

      return {
        companyNumber: preferred.company_number,
        companyName: preferred.company_name ?? normalized,
        companyStatus: preferred.company_status ?? "unknown"
      };
    }
  };
}
