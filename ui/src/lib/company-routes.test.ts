import { describe, expect, it } from "vitest";
import {
  extractCompanyPrefixFromPath,
  isBoardPathWithoutPrefix,
  isReservedUrlSegment,
} from "./company-routes";

/** Every first segment from `boardRoutes()` in App.tsx must be reserved (see BOARD_ROUTE_ROOTS). */
const BOARD_FIRST_SEGMENTS = [
  "activity",
  "agents",
  "apps",
  "approvals",
  "companies",
  "company",
  "costs",
  "dashboard",
  "design-guide",
  "execution-workspaces",
  "goals",
  "inbox",
  "issues",
  "onboarding",
  "org",
  "plugins",
  "projects",
  "routines",
  "settings",
  "skills",
  "status",
  "tests",
  "usage",
] as const;

describe("company-routes", () => {
  it("treats /status as a board path, not a company prefix", () => {
    expect(extractCompanyPrefixFromPath("/status")).toBeNull();
    expect(isBoardPathWithoutPrefix("/status")).toBe(true);
    expect(isReservedUrlSegment("status")).toBe(true);
  });

  it("still extracts real company prefix", () => {
    expect(extractCompanyPrefixFromPath("/ACME/issues")).toBe("ACME");
  });

  it("reserves every known board first segment (collision guard vs issuePrefix)", () => {
    for (const seg of BOARD_FIRST_SEGMENTS) {
      expect(isReservedUrlSegment(seg), `expected reserved: ${seg}`).toBe(true);
      expect(extractCompanyPrefixFromPath(`/${seg}`), `expected no company from /${seg}`).toBeNull();
    }
  });

  it("reserves nested board roots (first path segment only)", () => {
    expect(extractCompanyPrefixFromPath("/tests/ux/runs")).toBeNull();
    expect(extractCompanyPrefixFromPath("/execution-workspaces/ws-1")).toBeNull();
    expect(extractCompanyPrefixFromPath("/plugins/acme")).toBeNull();
  });
});
