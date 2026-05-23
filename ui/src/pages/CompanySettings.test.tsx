// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanySettings } from "./CompanySettings";
import { TooltipProvider } from "@/components/ui/tooltip";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseQueryClient = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [{
      id: "company-1",
      name: "Paperclip",
      description: null,
      brandColor: null,
      logoUrl: null,
      status: "active",
      requireBoardApprovalForNewAgents: false,
    }],
    selectedCompany: {
      id: "company-1",
      name: "Paperclip",
      description: null,
      brandColor: null,
      logoUrl: null,
      status: "active",
      requireBoardApprovalForNewAgents: false,
    },
    selectedCompanyId: "company-1",
    setSelectedCompanyId: vi.fn(),
  }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

describe("CompanySettings", () => {
  it("renders core settings sections", () => {
    mockUseQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
    mockUseQuery.mockReturnValue({
      data: {
        companyId: "company-1",
        overrides: {},
        effective: {},
      },
    });
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    });

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <CompanySettings />
      </TooltipProvider>,
    );
    expect(html).toContain("Company Settings");
    expect(html).toContain("General");
    expect(html).toContain("Company name");
    expect(html).toContain("Appearance");
    expect(html).toContain("Hiring");
    expect(html).toContain("Require board approval for new hires");
    expect(html).toContain("Save changes");
  });
});
