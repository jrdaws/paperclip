// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InstanceExperimentalSettings } from "./InstanceExperimentalSettings";

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockUseMutation = vi.hoisted(() => vi.fn());
const mockUseQueryClient = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

describe("InstanceExperimentalSettings", () => {
  it("renders experimental setting toggles", () => {
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockUseQuery.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        enableIsolatedWorkspaces: false,
        autoRestartDevServerWhenIdle: false,
      },
    });

    const html = renderToStaticMarkup(<InstanceExperimentalSettings />);

    expect(html).toContain("Experimental");
    expect(html).toContain("Enable Isolated Workspaces");
    expect(html).toContain("Auto-Restart Dev Server When Idle");
  });
});
