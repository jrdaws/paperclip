// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Routines } from "./Routines";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseQueryClient = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../context/ToastContext", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("@/lib/router", () => ({
  useNavigate: () => vi.fn(),
}));

function createQueryValue(data: unknown) {
  return {
    data,
    isLoading: false,
    error: null,
  };
}

function setupQueryMocks() {
  mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
    const key = JSON.stringify(options.queryKey);
    if (key.includes(`["routines","company-1","company-runs"`)) {
      return createQueryValue({
        rows: [],
        summary: { total: 0, returned: 0, hasMore: false },
      });
    }
    if (key.includes(`["routines","company-1","metrics"`)) {
      return createQueryValue({
        totals: { runs: 0, failed: 0, coalesced: 0, skipped: 0 },
        rates: { failureRate: 0, coalescedRate: 0, skippedRate: 0 },
        latencyMs: { p50: 0, p95: 0 },
      });
    }
    if (key.includes(`["routines","company-1","attention"`)) {
      return createQueryValue({ rows: [] });
    }
    if (key.includes(`["routines","company-1","governance"`)) {
      return createQueryValue({
        health: { status: "green", issueCount: 0, failedChecks: [] },
        policy: { issues: [] },
      });
    }
    if (key.includes(`["routines","company-1","governance-drift"`)) {
      return createQueryValue({
        statusTransition: "green->green",
        failureRateDelta: 0,
        regressionChecks: [],
      });
    }
    if (key.includes(`["routines","company-1","templates"`)) {
      return createQueryValue([]);
    }
    if (key.includes(`["companies","company-1","feature-settings","routines"]`)) {
      return createQueryValue({
        companyId: "company-1",
        overrides: {},
        effective: {},
      });
    }
    if (key.includes(`["routines","company-1"]`)) return createQueryValue([]);
    if (key.includes(`["agents","company-1"]`)) return createQueryValue([]);
    if (key.includes(`["projects","company-1"]`)) return createQueryValue([]);
    return createQueryValue(undefined);
  });
}

describe("Routines page", () => {
  it("renders page header and empty state when no routines exist", () => {
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    setupQueryMocks();

    const html = renderToStaticMarkup(<Routines />);

    expect(html).toContain("Routines");
    expect(html).toContain("Beta");
    expect(html).toContain("Create routine");
    expect(html).toContain("No routines yet");
  });
});
