import { describe, expect, it, vi } from "vitest";
import {
  createCompaniesHouseOfficialApi,
  extractDocumentId,
  selectLatestAccountsFiling
} from "../../adapters/companies-house/src/official-api";

describe("Companies House official API helpers", () => {
  it("extracts a document id from a document metadata link", () => {
    expect(
      extractDocumentId("https://document-api.company-information.service.gov.uk/document/abc123")
    ).toBe("abc123");
  });

  it("selects the latest accounts filing with document metadata", () => {
    const filing = selectLatestAccountsFiling([
      {
        category: "confirmation-statement",
        date: "2025-01-01",
        links: { document_metadata: "https://document-api.company-information.service.gov.uk/document/nope" }
      },
      {
        category: "accounts",
        date: "2024-12-31",
        links: { document_metadata: "https://document-api.company-information.service.gov.uk/document/old" }
      },
      {
        category: "accounts",
        date: "2025-12-31",
        links: { document_metadata: "https://document-api.company-information.service.gov.uk/document/new" }
      }
    ]);

    expect(filing?.links?.document_metadata).toContain("/document/new");
  });

  it("resolves a company via alias and fetches its profile with basic auth", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "https://api.company-information.service.gov.uk/company/00054018") {
        expect(init?.headers).toMatchObject({
          Authorization: expect.stringMatching(/^Basic /),
          Accept: "application/json"
        });

        return new Response(
          JSON.stringify({
            company_name: "HSBC Holdings plc",
            company_number: "00054018",
            company_status: "active"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    const api = createCompaniesHouseOfficialApi({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(api.resolveCompany("HSBA", { HSBA: "00054018" })).resolves.toEqual({
      companyNumber: "00054018",
      companyName: "HSBC Holdings plc",
      companyStatus: "active"
    });
  });
});
