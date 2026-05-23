import { startTransition, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { issuesApi } from "../api/issues";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { formatAssigneeUserLabel } from "../lib/assignees";
import { groupBy } from "../lib/groupBy";
import { formatDate, cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { EmptyState } from "./EmptyState";
import { Identity } from "./Identity";
import { IssueRow } from "./IssueRow";
import { PageSkeleton } from "./PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CircleDot, Plus, Filter, ArrowUpDown, Layers, Check, X, ChevronRight, List, Columns3, User, Search, Keyboard, Rows3 } from "lucide-react";
import { KanbanBoard, BoardMetrics, ACTIVE_STATUSES, ALL_BOARD_STATUSES, type WipLimits } from "./KanbanBoard";
import type { Issue } from "@paperclipai/shared";

/* ── Helpers ── */

const statusOrder = ["in_progress", "todo", "backlog", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── View state ── */

export type IssueViewState = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  labels: string[];
  projects: string[];
  sortField: "status" | "priority" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "priority" | "assignee" | "none";
  viewMode: "list" | "board";
  collapsedGroups: string[];
  swimlaneBy: "none" | "assignee" | "project";
};

const defaultViewState: IssueViewState = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  projects: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  viewMode: "list",
  collapsedGroups: [],
  swimlaneBy: "none",
};

const quickFilterPresets = [
  { label: "All", statuses: [] as string[] },
  { label: "Active", statuses: ["todo", "in_progress", "in_review", "blocked"] },
  { label: "Backlog", statuses: ["backlog"] },
  { label: "Done", statuses: ["done", "cancelled"] },
];
const ISSUE_SEARCH_COMMIT_DELAY_MS = 150;

function getViewState(key: string): IssueViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: IssueViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function applyFilters(issues: Issue[], state: IssueViewState, currentUserId?: string | null): Issue[] {
  let result = issues;
  if (state.statuses.length > 0) result = result.filter((i) => state.statuses.includes(i.status));
  if (state.priorities.length > 0) result = result.filter((i) => state.priorities.includes(i.priority));
  if (state.assignees.length > 0) {
    result = result.filter((issue) => {
      for (const assignee of state.assignees) {
        if (assignee === "__unassigned" && !issue.assigneeAgentId && !issue.assigneeUserId) return true;
        if (assignee === "__me" && currentUserId && issue.assigneeUserId === currentUserId) return true;
        if (issue.assigneeAgentId === assignee) return true;
      }
      return false;
    });
  }
  if (state.labels.length > 0) result = result.filter((i) => (i.labelIds ?? []).some((id) => state.labels.includes(id)));
  if (state.projects.length > 0) result = result.filter((i) => i.projectId != null && state.projects.includes(i.projectId));
  return result;
}

function sortIssues(issues: Issue[], state: IssueViewState): Issue[] {
  const sorted = [...issues];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
      case "priority":
        return dir * (priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "created":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "updated":
        return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default:
        return 0;
    }
  });
  return sorted;
}

function countActiveFilters(state: IssueViewState): number {
  let count = 0;
  if (state.statuses.length > 0) count++;
  if (state.priorities.length > 0) count++;
  if (state.assignees.length > 0) count++;
  if (state.labels.length > 0) count++;
  if (state.projects.length > 0) count++;
  return count;
}

/* ── WIP Limits persistence ── */

const WIP_LIMITS_KEY = "paperclip:wip-limits";

function getWipLimits(companyId: string): WipLimits {
  try {
    const raw = localStorage.getItem(`${WIP_LIMITS_KEY}:${companyId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveWipLimits(companyId: string, limits: WipLimits) {
  localStorage.setItem(`${WIP_LIMITS_KEY}:${companyId}`, JSON.stringify(limits));
}

/* ── Collapsed columns persistence ── */

const COLLAPSED_COLS_KEY = "paperclip:board-collapsed";
const DEFAULT_COLLAPSED = ["done", "cancelled"];

function getCollapsedColumns(companyId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${COLLAPSED_COLS_KEY}:${companyId}`);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set(DEFAULT_COLLAPSED);
}

function saveCollapsedColumns(companyId: string, collapsed: Set<string>) {
  localStorage.setItem(`${COLLAPSED_COLS_KEY}:${companyId}`, JSON.stringify([...collapsed]));
}

/* ── Keyboard Shortcuts Overlay ── */

const SHORTCUTS = [
  { key: "J", label: "Move focus down" },
  { key: "K", label: "Move focus up" },
  { key: "H", label: "Move focus left" },
  { key: "L", label: "Move focus right" },
  { key: "[", label: "Jump to previous column" },
  { key: "]", label: "Jump to next column" },
  { key: "Enter", label: "Open focused issue" },
  { key: "N", label: "Create issue in column" },
  { key: "S", label: "Toggle select focused card" },
  { key: "X / Esc", label: "Clear focus & selection" },
  { key: "?", label: "Toggle this overlay" },
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-80 rounded-lg border border-border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Bulk Action Bar ── */

const BULK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];

function BulkActionBar({
  count,
  agents,
  onBatchStatus,
  onBatchAssignee,
  onClear,
}: {
  count: number;
  agents?: { id: string; name: string }[];
  onBatchStatus: (status: string) => void;
  onBatchAssignee: (agentId: string | null) => void;
  onClear: () => void;
}) {
  const [showStatus, setShowStatus] = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 shadow-xl">
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <div className="h-4 w-px bg-border" />

      <div className="relative">
        <button
          className="text-xs px-2.5 py-1 rounded-md bg-accent hover:bg-accent/80 transition-colors"
          onClick={() => { setShowStatus((v) => !v); setShowAssignee(false); }}
        >
          Set Status
        </button>
        {showStatus && (
          <div className="absolute bottom-full left-0 mb-1 w-40 rounded-md border border-border bg-card p-1 shadow-lg">
            {BULK_STATUSES.map((s) => (
              <button
                key={s}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50"
                onClick={() => { onBatchStatus(s); setShowStatus(false); }}
              >
                <StatusIcon status={s} />
                <span>{statusLabel(s)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          className="text-xs px-2.5 py-1 rounded-md bg-accent hover:bg-accent/80 transition-colors"
          onClick={() => { setShowAssignee((v) => !v); setShowStatus(false); }}
        >
          Assign
        </button>
        {showAssignee && (
          <div className="absolute bottom-full left-0 mb-1 w-48 rounded-md border border-border bg-card p-1 shadow-lg max-h-48 overflow-y-auto">
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50"
              onClick={() => { onBatchAssignee(null); setShowAssignee(false); }}
            >
              No assignee
            </button>
            {(agents ?? []).map((agent) => (
              <button
                key={agent.id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent/50"
                onClick={() => { onBatchAssignee(agent.id); setShowAssignee(false); }}
              >
                <Identity name={agent.name} size="sm" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-border" />
      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={onClear}
      >
        Clear
      </button>
    </div>
  );
}

/* ── Component ── */

interface Agent {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface IssuesListProps {
  issues: Issue[];
  isLoading?: boolean;
  error?: Error | null;
  agents?: Agent[];
  projects?: ProjectOption[];
  liveIssueIds?: Set<string>;
  projectId?: string;
  viewStateKey: string;
  issueLinkState?: unknown;
  initialAssignees?: string[];
  initialSearch?: string;
  searchFilters?: {
    participantAgentId?: string;
  };
  onSearchChange?: (search: string) => void;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
}

interface IssuesSearchInputProps {
  initialValue: string;
  onValueCommitted: (value: string) => void;
}

function IssuesSearchInput({ initialValue, onValueCommitted }: IssuesSearchInputProps) {
  const [value, setValue] = useState(initialValue);
  const onValueCommittedRef = useRef(onValueCommitted);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    onValueCommittedRef.current = onValueCommitted;
  }, [onValueCommitted]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onValueCommittedRef.current(value);
    }, ISSUE_SEARCH_COMMIT_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [value]);

  return (
    <div className="relative w-48 sm:w-64 md:w-80">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search issues..."
        className="pl-7 text-xs sm:text-sm"
        aria-label="Search issues"
      />
    </div>
  );
}

export function IssuesList({
  issues,
  isLoading,
  error,
  agents,
  projects,
  liveIssueIds,
  projectId,
  viewStateKey,
  issueLinkState,
  initialAssignees,
  initialSearch,
  searchFilters,
  onSearchChange,
  onUpdateIssue,
}: IssuesListProps) {
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;

  // Scope the storage key per company so folding/view state is independent across companies.
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<IssueViewState>(() => {
    if (initialAssignees) {
      return { ...defaultViewState, assignees: initialAssignees, statuses: [] };
    }
    return getViewState(scopedKey);
  });
  const [assigneePickerIssueId, setAssigneePickerIssueId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState(initialSearch ?? "");
  const normalizedIssueSearch = issueSearch.trim();

  useEffect(() => {
    setIssueSearch(initialSearch ?? "");
  }, [initialSearch]);

  // Reload view state from localStorage when company changes (scopedKey changes).
  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(initialAssignees
        ? { ...defaultViewState, assignees: initialAssignees, statuses: [] }
        : getViewState(scopedKey));
    }
  }, [scopedKey, initialAssignees]);

  const handleIssueSearchCommit = useCallback((nextSearch: string) => {
    startTransition(() => {
      setIssueSearch(nextSearch);
    });
    onSearchChange?.(nextSearch);
  }, [onSearchChange]);

  const updateView = useCallback((patch: Partial<IssueViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: searchedIssues = [] } = useQuery({
    queryKey: [
      ...queryKeys.issues.search(selectedCompanyId!, normalizedIssueSearch, projectId),
      searchFilters ?? {},
    ],
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: normalizedIssueSearch, projectId, ...searchFilters }),
    enabled: !!selectedCompanyId && normalizedIssueSearch.length > 0,
    placeholderData: (previousData) => previousData,
  });

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  const filtered = useMemo(() => {
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issues;
    const filteredByControls = applyFilters(sourceIssues, viewState, currentUserId);
    return sortIssues(filteredByControls, viewState);
  }, [issues, searchedIssues, viewState, normalizedIssueSearch, currentUserId]);

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeFilterCount = countActiveFilters(viewState);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    if (viewState.groupBy === "status") {
      const groups = groupBy(filtered, (i) => i.status);
      return statusOrder
        .filter((s) => groups[s]?.length)
        .map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
    }
    if (viewState.groupBy === "priority") {
      const groups = groupBy(filtered, (i) => i.priority);
      return priorityOrder
        .filter((p) => groups[p]?.length)
        .map((p) => ({ key: p, label: statusLabel(p), items: groups[p]! }));
    }
    // assignee
    const groups = groupBy(
      filtered,
      (issue) => issue.assigneeAgentId ?? (issue.assigneeUserId ? `__user:${issue.assigneeUserId}` : "__unassigned"),
    );
    return Object.keys(groups).map((key) => ({
      key,
      label:
        key === "__unassigned"
          ? "Unassigned"
          : key.startsWith("__user:")
            ? (formatAssigneeUserLabel(key.slice("__user:".length), currentUserId) ?? "User")
            : (agentName(key) ?? key.slice(0, 8)),
      items: groups[key]!,
    }));
  }, [filtered, viewState.groupBy, agents, agentName, currentUserId]);

  const newIssueDefaults = (groupKey?: string) => {
    const defaults: Record<string, string> = {};
    if (projectId) defaults.projectId = projectId;
    if (groupKey) {
      if (viewState.groupBy === "status") defaults.status = groupKey;
      else if (viewState.groupBy === "priority") defaults.priority = groupKey;
      else if (viewState.groupBy === "assignee" && groupKey !== "__unassigned") {
        if (groupKey.startsWith("__user:")) defaults.assigneeUserId = groupKey.slice("__user:".length);
        else defaults.assigneeAgentId = groupKey;
      }
    }
    return defaults;
  };

  const queryClient = useQueryClient();

  const createIssueMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      issuesApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
    },
  });

  const handleBoardCreateIssue = useCallback((data: Record<string, unknown>) => {
    createIssueMutation.mutate(data);
  }, [createIssueMutation]);

  /* ── WIP Limits ── */

  const [wipLimits, setWipLimits] = useState<WipLimits>(() =>
    selectedCompanyId ? getWipLimits(selectedCompanyId) : {}
  );

  useEffect(() => {
    if (selectedCompanyId) setWipLimits(getWipLimits(selectedCompanyId));
  }, [selectedCompanyId]);

  const handleWipLimitChange = useCallback((status: string, limit: number | null) => {
    setWipLimits((prev) => {
      const next = { ...prev };
      if (limit === null) {
        delete next[status];
      } else {
        next[status] = limit;
      }
      if (selectedCompanyId) saveWipLimits(selectedCompanyId, next);
      return next;
    });
  }, [selectedCompanyId]);

  /* ── Collapsed Columns ── */

  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() =>
    selectedCompanyId ? getCollapsedColumns(selectedCompanyId) : new Set(DEFAULT_COLLAPSED)
  );

  useEffect(() => {
    if (selectedCompanyId) setCollapsedColumns(getCollapsedColumns(selectedCompanyId));
  }, [selectedCompanyId]);

  const handleToggleColumn = useCallback((status: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      if (selectedCompanyId) saveCollapsedColumns(selectedCompanyId, next);
      return next;
    });
  }, [selectedCompanyId]);

  /* ── Selection state for bulk ops ── */

  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const handleToggleCardSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRef.current && lastSelectedRef.current !== id) {
        const allIds = filtered.map((i) => i.id);
        const startIdx = allIds.indexOf(lastSelectedRef.current);
        const endIdx = allIds.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = lo; i <= hi; i++) next.add(allIds[i]);
        } else {
          next.has(id) ? next.delete(id) : next.add(id);
        }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      lastSelectedRef.current = id;
      return next;
    });
  }, [filtered]);

  const handleBatchStatus = useCallback((status: string) => {
    for (const id of selectedCardIds) {
      onUpdateIssue(id, { status });
    }
    setSelectedCardIds(new Set());
  }, [selectedCardIds, onUpdateIssue]);

  const handleBatchAssignee = useCallback((agentId: string | null) => {
    for (const id of selectedCardIds) {
      onUpdateIssue(id, { assigneeAgentId: agentId, assigneeUserId: null });
    }
    setSelectedCardIds(new Set());
  }, [selectedCardIds, onUpdateIssue]);

  /* ── Keyboard Navigation ── */

  const navigate = useNavigate();
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const boardContainerRef = useRef<HTMLDivElement>(null);

  const boardColumnData = useMemo(() => {
    if (viewState.viewMode !== "board") return [];
    const cols: { status: string; issueIds: string[] }[] = [];
    for (const status of ALL_BOARD_STATUSES) {
      if (collapsedColumns.has(status)) continue;
      const columnIssues = filtered.filter((i) => i.status === status);
      if (ACTIVE_STATUSES.includes(status) || columnIssues.length > 0) {
        cols.push({ status, issueIds: columnIssues.map((i) => i.id) });
      }
    }
    return cols;
  }, [filtered, viewState.viewMode, collapsedColumns]);

  const handleBoardKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (viewState.viewMode !== "board") return;

    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    if (isInputFocused) return;

    const key = e.key.toLowerCase();

    if (key === "?" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setShowShortcuts((v) => !v);
      return;
    }

    if (key === "escape" || key === "x") {
      e.preventDefault();
      setFocusedCardId(null);
      setSelectedCardIds(new Set());
      return;
    }

    if (key === "s" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (focusedCardId) {
        handleToggleCardSelect(focusedCardId, e.shiftKey);
      }
      return;
    }

    if (!boardColumnData.length) return;

    let currentCol = -1;
    let currentRow = -1;
    if (focusedCardId) {
      for (let c = 0; c < boardColumnData.length; c++) {
        const r = boardColumnData[c].issueIds.indexOf(focusedCardId);
        if (r !== -1) {
          currentCol = c;
          currentRow = r;
          break;
        }
      }
    }

    const moveFocus = (colIdx: number, rowIdx: number) => {
      const col = boardColumnData[colIdx];
      if (!col) return;
      const clamped = Math.max(0, Math.min(rowIdx, col.issueIds.length - 1));
      const id = col.issueIds[clamped];
      if (id) {
        setFocusedCardId(id);
        requestAnimationFrame(() => {
          const el = boardContainerRef.current?.querySelector(`[data-issue-id="${id}"]`);
          el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      }
    };

    switch (key) {
      case "j": {
        e.preventDefault();
        if (currentCol === -1) {
          moveFocus(0, 0);
        } else {
          moveFocus(currentCol, currentRow + 1);
        }
        break;
      }
      case "k": {
        e.preventDefault();
        if (currentCol === -1) {
          moveFocus(0, 0);
        } else {
          moveFocus(currentCol, currentRow - 1);
        }
        break;
      }
      case "h": {
        e.preventDefault();
        if (currentCol <= 0) {
          if (currentCol === -1) moveFocus(0, 0);
        } else {
          moveFocus(currentCol - 1, currentRow);
        }
        break;
      }
      case "l": {
        e.preventDefault();
        if (currentCol === -1) {
          moveFocus(0, 0);
        } else if (currentCol < boardColumnData.length - 1) {
          moveFocus(currentCol + 1, currentRow);
        }
        break;
      }
      case "[": {
        e.preventDefault();
        if (currentCol <= 0) {
          moveFocus(0, 0);
        } else {
          moveFocus(currentCol - 1, 0);
        }
        break;
      }
      case "]": {
        e.preventDefault();
        if (currentCol === -1) {
          moveFocus(0, 0);
        } else if (currentCol < boardColumnData.length - 1) {
          moveFocus(currentCol + 1, 0);
        }
        break;
      }
      case "enter": {
        if (focusedCardId) {
          e.preventDefault();
          const issue = filtered.find((i) => i.id === focusedCardId);
          if (issue) {
            navigate(`/issues/${issue.identifier ?? issue.id}`);
          }
        }
        break;
      }
      case "n": {
        e.preventDefault();
        const defaults: Record<string, string> = {};
        if (projectId) defaults.projectId = projectId;
        if (currentCol >= 0) defaults.status = boardColumnData[currentCol].status;
        openNewIssue(defaults);
        break;
      }
    }
  }, [viewState.viewMode, boardColumnData, focusedCardId, filtered, navigate, projectId, openNewIssue, handleToggleCardSelect]);

  const assignIssue = (issueId: string, assigneeAgentId: string | null, assigneeUserId: string | null = null) => {
    onUpdateIssue(issueId, { assigneeAgentId, assigneeUserId });
    setAssigneePickerIssueId(null);
    setAssigneeSearch("");
  };

  return (
    <div className="space-y-4" ref={boardContainerRef} onKeyDown={handleBoardKeyDown} tabIndex={-1}>
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Button size="sm" variant="outline" onClick={() => openNewIssue(newIssueDefaults())}>
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">New Issue</span>
          </Button>
          <IssuesSearchInput
            initialValue={initialSearch ?? ""}
            onValueCommitted={handleIssueSearchCommit}
          />
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Swimlane picker (board view only) */}
          {viewState.viewMode === "board" && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "p-1.5 transition-colors rounded-md hover:bg-accent/50",
                    viewState.swimlaneBy !== "none" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground",
                  )}
                  title="Swimlanes"
                >
                  <Rows3 className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["none", "None"],
                    ["assignee", "Assignee"],
                    ["project", "Project"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.swimlaneBy === value ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      }`}
                      onClick={() => updateView({ swimlaneBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.swimlaneBy === value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Shortcuts toggle (board view only) */}
          {viewState.viewMode === "board" && (
            <button
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50"
              onClick={() => setShowShortcuts((v) => !v)}
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
          )}

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden mr-1">
            <button
              className={`p-1.5 transition-colors ${viewState.viewMode === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => updateView({ viewMode: "list" })}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              className={`p-1.5 transition-colors ${viewState.viewMode === "board" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                updateView({ viewMode: "board" });
                setFocusedCardId(null);
                setSelectedCardIds(new Set());
              }}
              title="Board view"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={`text-xs ${activeFilterCount > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                <Filter className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                <span className="hidden sm:inline">{activeFilterCount > 0 ? `Filters: ${activeFilterCount}` : "Filter"}</span>
                {activeFilterCount > 0 && (
                  <span className="sm:hidden text-[10px] font-medium ml-0.5">{activeFilterCount}</span>
                )}
                {activeFilterCount > 0 && (
                  <X
                    className="h-3 w-3 ml-1 hidden sm:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateView({ statuses: [], priorities: [], assignees: [], labels: [], projects: [] });
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(480px,calc(100vw-2rem))] p-0">
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Filters</span>
                  {activeFilterCount > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => updateView({ statuses: [], priorities: [], assignees: [], labels: [] })}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Quick filters */}
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Quick filters</span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickFilterPresets.map((preset) => {
                      const isActive = arraysEqual(viewState.statuses, preset.statuses);
                      return (
                        <button
                          key={preset.label}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                          }`}
                          onClick={() => updateView({ statuses: isActive ? [] : [...preset.statuses] })}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* Multi-column filter sections */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {/* Status */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <div className="space-y-0.5">
                      {statusOrder.map((s) => (
                        <label key={s} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={viewState.statuses.includes(s)}
                            onCheckedChange={() => updateView({ statuses: toggleInArray(viewState.statuses, s) })}
                          />
                          <StatusIcon status={s} />
                          <span className="text-sm">{statusLabel(s)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Priority + Assignee stacked in right column */}
                  <div className="space-y-3">
                    {/* Priority */}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Priority</span>
                      <div className="space-y-0.5">
                        {priorityOrder.map((p) => (
                          <label key={p} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                            <Checkbox
                              checked={viewState.priorities.includes(p)}
                              onCheckedChange={() => updateView({ priorities: toggleInArray(viewState.priorities, p) })}
                            />
                            <PriorityIcon priority={p} />
                            <span className="text-sm">{statusLabel(p)}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Assignee */}
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Assignee</span>
                      <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        <label className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                          <Checkbox
                            checked={viewState.assignees.includes("__unassigned")}
                            onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, "__unassigned") })}
                          />
                          <span className="text-sm">No assignee</span>
                        </label>
                        {currentUserId && (
                          <label className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                            <Checkbox
                              checked={viewState.assignees.includes("__me")}
                              onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, "__me") })}
                            />
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">Me</span>
                          </label>
                        )}
                        {(agents ?? []).map((agent) => (
                          <label key={agent.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                            <Checkbox
                              checked={viewState.assignees.includes(agent.id)}
                              onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, agent.id) })}
                            />
                            <span className="text-sm">{agent.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {labels && labels.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Labels</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {labels.map((label) => (
                            <label key={label.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                              <Checkbox
                                checked={viewState.labels.includes(label.id)}
                                onCheckedChange={() => updateView({ labels: toggleInArray(viewState.labels, label.id) })}
                              />
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                              <span className="text-sm">{label.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {projects && projects.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Project</span>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto">
                          {projects.map((project) => (
                            <label key={project.id} className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent/50 cursor-pointer">
                              <Checkbox
                                checked={viewState.projects.includes(project.id)}
                                onCheckedChange={() => updateView({ projects: toggleInArray(viewState.projects, project.id) })}
                              />
                              <span className="text-sm">{project.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Sort</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["title", "Title"],
                    ["created", "Created"],
                    ["updated", "Updated"],
                  ] as const).map(([field, label]) => (
                    <button
                      key={field}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.sortField === field ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      }`}
                      onClick={() => {
                        if (viewState.sortField === field) {
                          updateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc" });
                        } else {
                          updateView({ sortField: field, sortDir: "asc" });
                        }
                      }}
                    >
                      <span>{label}</span>
                      {viewState.sortField === field && (
                        <span className="text-xs text-muted-foreground">
                          {viewState.sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Group (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs">
                  <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                  <span className="hidden sm:inline">Group</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-0">
                <div className="p-2 space-y-0.5">
                  {([
                    ["status", "Status"],
                    ["priority", "Priority"],
                    ["assignee", "Assignee"],
                    ["none", "None"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={`flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-sm ${
                        viewState.groupBy === value ? "bg-accent/50 text-foreground" : "hover:bg-accent/50 text-muted-foreground"
                      }`}
                      onClick={() => updateView({ groupBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.groupBy === value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {isLoading && <PageSkeleton variant="issues-list" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && filtered.length === 0 && viewState.viewMode === "list" && (
        <EmptyState
          icon={CircleDot}
          message="No issues match the current filters or search."
          action="Create Issue"
          onAction={() => openNewIssue(newIssueDefaults())}
        />
      )}

      {viewState.viewMode === "board" ? (
        <>
          <BoardMetrics issues={filtered} companyId={selectedCompanyId ?? undefined} />
          <KanbanBoard
            issues={filtered}
            agents={agents}
            projects={projects}
            liveIssueIds={liveIssueIds}
            onUpdateIssue={onUpdateIssue}
            onCreateIssue={handleBoardCreateIssue}
            projectId={projectId}
            focusedCardId={focusedCardId}
            wipLimits={wipLimits}
            onWipLimitChange={handleWipLimitChange}
            swimlaneBy={viewState.swimlaneBy}
            selectedCardIds={selectedCardIds}
            onToggleCardSelect={handleToggleCardSelect}
            collapsedColumns={collapsedColumns}
            onToggleColumn={handleToggleColumn}
          />
          {selectedCardIds.size > 0 && (
            <BulkActionBar
              count={selectedCardIds.size}
              agents={agents}
              onBatchStatus={handleBatchStatus}
              onBatchAssignee={handleBatchAssignee}
              onClear={() => setSelectedCardIds(new Set())}
            />
          )}
        </>
      ) : (
        groupedContent.map((group) => (
          <Collapsible
            key={group.key}
            open={!viewState.collapsedGroups.includes(group.key)}
            onOpenChange={(open) => {
              updateView({
                collapsedGroups: open
                  ? viewState.collapsedGroups.filter((k) => k !== group.key)
                  : [...viewState.collapsedGroups, group.key],
              });
            }}
          >
            {group.label && (
              <div className="flex items-center py-1.5 pl-1 pr-3">
                <CollapsibleTrigger className="flex items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {group.label}
                  </span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto text-muted-foreground"
                  onClick={() => openNewIssue(newIssueDefaults(group.key))}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              {group.items.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  issueLinkState={issueLinkState}
                  desktopLeadingSpacer
                  mobileLeading={(
                    <span
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <StatusIcon
                        status={issue.status}
                        onChange={(s) => onUpdateIssue(issue.id, { status: s })}
                      />
                    </span>
                  )}
                  desktopMetaLeading={(
                    <>
                      <span
                        className="hidden shrink-0 sm:inline-flex"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <StatusIcon
                          status={issue.status}
                          onChange={(s) => onUpdateIssue(issue.id, { status: s })}
                        />
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {issue.identifier ?? issue.id.slice(0, 8)}
                      </span>
                      {liveIssueIds?.has(issue.id) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 sm:gap-1.5 sm:px-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                          </span>
                          <span className="hidden text-[11px] font-medium text-blue-600 dark:text-blue-400 sm:inline">
                            Live
                          </span>
                        </span>
                      )}
                    </>
                  )}
                  mobileMeta={timeAgo(issue.updatedAt)}
                  desktopTrailing={(
                    <>
                      {(issue.labels ?? []).length > 0 && (
                        <span className="hidden items-center gap-1 overflow-hidden md:flex md:max-w-[240px]">
                          {(issue.labels ?? []).slice(0, 3).map((label) => (
                            <span
                              key={label.id}
                              className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                borderColor: label.color,
                                color: pickTextColorForPillBg(label.color, 0.12),
                                backgroundColor: `${label.color}1f`,
                              }}
                            >
                              {label.name}
                            </span>
                          ))}
                          {(issue.labels ?? []).length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(issue.labels ?? []).length - 3}
                            </span>
                          )}
                        </span>
                      )}
                      <Popover
                        open={assigneePickerIssueId === issue.id}
                        onOpenChange={(open) => {
                          setAssigneePickerIssueId(open ? issue.id : null);
                          if (!open) setAssigneeSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            className="flex w-[180px] shrink-0 items-center rounded-md px-2 py-1 transition-colors hover:bg-accent/50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            {issue.assigneeAgentId && agentName(issue.assigneeAgentId) ? (
                              <Identity name={agentName(issue.assigneeAgentId)!} size="sm" />
                            ) : issue.assigneeUserId ? (
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
                                  <User className="h-3 w-3" />
                                </span>
                                {formatAssigneeUserLabel(issue.assigneeUserId, currentUserId) ?? "User"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
                                  <User className="h-3 w-3" />
                                </span>
                                Assignee
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-56 p-1"
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDownOutside={() => setAssigneeSearch("")}
                        >
                          <input
                            className="mb-1 w-full border-b border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
                            placeholder="Search assignees..."
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto overscroll-contain">
                            <button
                              className={cn(
                                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50",
                                !issue.assigneeAgentId && !issue.assigneeUserId && "bg-accent",
                              )}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                assignIssue(issue.id, null, null);
                              }}
                            >
                              No assignee
                            </button>
                            {currentUserId && (
                              <button
                                className={cn(
                                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50",
                                  issue.assigneeUserId === currentUserId && "bg-accent",
                                )}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  assignIssue(issue.id, null, currentUserId);
                                }}
                              >
                                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span>Me</span>
                              </button>
                            )}
                            {(agents ?? [])
                              .filter((agent) => {
                                if (!assigneeSearch.trim()) return true;
                                return agent.name
                                  .toLowerCase()
                                  .includes(assigneeSearch.toLowerCase());
                              })
                              .map((agent) => (
                                <button
                                  key={agent.id}
                                  className={cn(
                                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50",
                                    issue.assigneeAgentId === agent.id && "bg-accent",
                                  )}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    assignIssue(issue.id, agent.id, null);
                                  }}
                                >
                                  <Identity name={agent.name} size="sm" className="min-w-0" />
                                </button>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </>
                  )}
                  trailingMeta={formatDate(issue.createdAt)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))
      )}
    </div>
  );
}
