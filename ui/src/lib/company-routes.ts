/**
 * First URL segment after "/" for board routes mounted under `/:companyPrefix/*`.
 * Must stay in sync with `boardRoutes()` in App.tsx — if a new top-level board path
 * is added, include it here or `/thatWord` will be misread as an `issuePrefix`.
 *
 * Note: `boardRoutes()` also has a catch-all `/:pluginRoutePath` for company-scoped plugins;
 * arbitrary plugin slugs cannot be listed here — avoid choosing an `issuePrefix` that matches a plugin slug.
 */
const BOARD_ROUTE_ROOTS = new Set([
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
]);

const GLOBAL_ROUTE_ROOTS = new Set(["auth", "invite", "board-claim", "cli-auth", "docs", "instance"]);

export function normalizeCompanyPrefix(prefix: string): string {
  return prefix.trim().toUpperCase();
}

function splitPath(path: string): { pathname: string; search: string; hash: string } {
  const match = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match?.[1] ?? path,
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  };
}

function getRootSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ?? null;
}

export function isGlobalPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const root = getRootSegment(pathname);
  if (!root) return true;
  return GLOBAL_ROUTE_ROOTS.has(root.toLowerCase());
}

export function isBoardPathWithoutPrefix(pathname: string): boolean {
  const root = getRootSegment(pathname);
  if (!root) return false;
  return BOARD_ROUTE_ROOTS.has(root.toLowerCase());
}

/** First path segment looks like a board/global route, not a company issue prefix. */
export function isReservedUrlSegment(segment: string): boolean {
  const s = segment.trim().toLowerCase();
  return GLOBAL_ROUTE_ROOTS.has(s) || BOARD_ROUTE_ROOTS.has(s);
}

export function extractCompanyPrefixFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]!.toLowerCase();
  if (GLOBAL_ROUTE_ROOTS.has(first) || BOARD_ROUTE_ROOTS.has(first)) {
    return null;
  }
  return normalizeCompanyPrefix(segments[0]!);
}

export function applyCompanyPrefix(path: string, companyPrefix: string | null | undefined): string {
  const { pathname, search, hash } = splitPath(path);
  if (!pathname.startsWith("/")) return path;
  if (isGlobalPath(pathname)) return path;
  if (!companyPrefix) return path;

  const prefix = normalizeCompanyPrefix(companyPrefix);
  const activePrefix = extractCompanyPrefixFromPath(pathname);
  if (activePrefix) return path;

  return `/${prefix}${pathname}${search}${hash}`;
}

export function toCompanyRelativePath(path: string): string {
  const { pathname, search, hash } = splitPath(path);
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length >= 2) {
    const second = segments[1]!.toLowerCase();
    if (!GLOBAL_ROUTE_ROOTS.has(segments[0]!.toLowerCase()) && BOARD_ROUTE_ROOTS.has(second)) {
      return `/${segments.slice(1).join("/")}${search}${hash}`;
    }
  }

  return `${pathname}${search}${hash}`;
}
