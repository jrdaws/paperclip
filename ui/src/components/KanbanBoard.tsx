import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { issuesApi, type StatusTransition } from "@/api/issues";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Virtuoso } from "react-virtuoso";
import { generateKeyBetween } from "fractional-indexing";
import { pickTextColorForPillBg } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { Plus, ChevronRight, ChevronDown, Clock, Copy, ExternalLink, FolderOpen, User as UserIcon, TrendingUp, Timer, Activity, BarChart3 } from "lucide-react";
import type { Issue, IssueLabel } from "@paperclipai/shared";

export const ACTIVE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"];
const TERMINAL_STATUSES = ["done", "cancelled"];
export const ALL_BOARD_STATUSES = [...ACTIVE_STATUSES, ...TERMINAL_STATUSES];

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const VIRTUALIZE_THRESHOLD = 50;

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isStale(issue: Issue): boolean {
  if (issue.status !== "in_progress" && issue.status !== "in_review") return false;
  const updated = new Date(issue.updatedAt).getTime();
  return Date.now() - updated > THREE_DAYS_MS;
}

function sortWithinColumn(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const aOrder = a.sortOrder ?? "";
    const bOrder = b.sortOrder ?? "";
    if (aOrder && bOrder) return aOrder < bOrder ? -1 : aOrder > bOrder ? 1 : 0;
    if (aOrder && !bOrder) return -1;
    if (!aOrder && bOrder) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

interface Agent {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export type WipLimits = Record<string, number>;
export type SwimlaneLane = { key: string; label: string; issues: Issue[] };

export interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  projects?: ProjectOption[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  onCreateIssue?: (data: Record<string, unknown>) => void;
  projectId?: string;
  focusedCardId?: string | null;
  wipLimits?: WipLimits;
  onWipLimitChange?: (status: string, limit: number | null) => void;
  swimlaneBy?: "none" | "assignee" | "project";
  selectedCardIds?: Set<string>;
  onToggleCardSelect?: (id: string, shiftKey: boolean) => void;
  collapsedColumns?: Set<string>;
  onToggleColumn?: (status: string) => void;
}

/* ── WIP limit helpers ── */

function wipColorClass(count: number, limit: number | undefined): string {
  if (!limit || limit <= 0) return "";
  if (count > limit) return "text-red-500";
  if (count >= limit) return "text-amber-500";
  return "";
}

function wipBorderClass(count: number, limit: number | undefined): string {
  if (!limit || limit <= 0) return "";
  if (count > limit) return "ring-1 ring-red-500/30";
  return "";
}

/* ── Inline Create ── */

function InlineCreateForm({
  status,
  projectId,
  onCreateIssue,
  onClose,
}: {
  status: string;
  projectId?: string;
  onCreateIssue: (data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      onClose();
      return;
    }
    const data: Record<string, unknown> = { title: trimmed, status };
    if (projectId) data.projectId = projectId;
    onCreateIssue(data);
    setTitle("");
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-md border border-primary/30 bg-card p-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onClose();
        }}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        placeholder="Issue title..."
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        autoFocus
      />
    </div>
  );
}

/* ── WIP Limit Editor ── */

function WipLimitEditor({
  status,
  currentLimit,
  onSave,
}: {
  status: string;
  currentLimit: number | undefined;
  onSave: (limit: number | null) => void;
}) {
  const [value, setValue] = useState(currentLimit?.toString() ?? "");
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        title={`Set WIP limit for ${statusLabel(status)}`}
      >
        {currentLimit ? `/${currentLimit}` : "limit"}
      </button>
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const num = parseInt(value, 10);
          onSave(num > 0 ? num : null);
          setEditing(false);
        }
        if (e.key === "Escape") {
          setValue(currentLimit?.toString() ?? "");
          setEditing(false);
        }
      }}
      onBlur={() => {
        const num = parseInt(value, 10);
        onSave(num > 0 ? num : null);
        setEditing(false);
      }}
      className="w-6 bg-transparent text-[10px] text-center outline-none border-b border-muted-foreground/30"
      autoFocus
      placeholder="#"
    />
  );
}

/* ── Droppable Column ── */

function KanbanColumn({
  status,
  issues,
  agents,
  projects,
  liveIssueIds,
  onCreateIssue,
  projectId,
  focusedCardId,
  wipLimit,
  onWipLimitChange,
  selectedCardIds,
  onToggleCardSelect,
  onCardContextMenu,
  lanePrefix,
  onCollapse,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  projects?: ProjectOption[];
  liveIssueIds?: Set<string>;
  onCreateIssue?: (data: Record<string, unknown>) => void;
  projectId?: string;
  focusedCardId?: string | null;
  wipLimit?: number;
  onWipLimitChange?: (status: string, limit: number | null) => void;
  selectedCardIds?: Set<string>;
  onToggleCardSelect?: (id: string, shiftKey: boolean) => void;
  onCardContextMenu?: (issue: Issue, x: number, y: number) => void;
  lanePrefix?: string;
  onCollapse?: () => void;
}) {
  const droppableId = lanePrefix ? `${lanePrefix}:${status}` : status;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { status } });
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => sortWithinColumn(issues), [issues]);
  const count = sorted.length;
  const countColorCls = wipColorClass(count, wipLimit);
  const borderCls = wipBorderClass(count, wipLimit);

  return (
    <div className={cn("flex flex-col min-w-[260px] w-[260px] shrink-0", borderCls && "rounded-md " + borderCls)}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-2 mb-1",
          onCollapse && "cursor-pointer rounded-md hover:bg-muted/30 transition-colors",
        )}
        onClick={onCollapse}
        title={onCollapse ? `Collapse ${statusLabel(status)}` : undefined}
      >
        <StatusIcon status={status} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
        <span className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <span className={cn("text-xs tabular-nums", countColorCls || "text-muted-foreground/60")}>
            {count}
          </span>
          {onWipLimitChange && (
            <WipLimitEditor
              status={status}
              currentLimit={wipLimit}
              onSave={(limit) => onWipLimitChange(status, limit)}
            />
          )}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[120px] rounded-md p-1 transition-colors",
          isOver ? "bg-accent/40" : "bg-muted/20",
          count > VIRTUALIZE_THRESHOLD ? "max-h-[calc(100vh-220px)]" : "space-y-1",
        )}
      >
        <SortableContext
          items={sorted.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {count > VIRTUALIZE_THRESHOLD ? (
            <Virtuoso
              data={sorted}
              style={{ height: "100%" }}
              increaseViewportBy={200}
              itemContent={(_index, issue) => (
                <div className="pb-1">
                  <KanbanCard
                    key={issue.id}
                    issue={issue}
                    agents={agents}
                    projects={projects}
                    isLive={liveIssueIds?.has(issue.id)}
                    isFocused={focusedCardId === issue.id}
                    isSelected={selectedCardIds?.has(issue.id)}
                    onToggleSelect={onToggleCardSelect}
                    onCardContextMenu={onCardContextMenu}
                  />
                </div>
              )}
            />
          ) : (
            sorted.map((issue) => (
              <KanbanCard
                key={issue.id}
                issue={issue}
                agents={agents}
                projects={projects}
                isLive={liveIssueIds?.has(issue.id)}
                isFocused={focusedCardId === issue.id}
                isSelected={selectedCardIds?.has(issue.id)}
                onToggleSelect={onToggleCardSelect}
                onCardContextMenu={onCardContextMenu}
              />
            ))
          )}
        </SortableContext>

        {creating && onCreateIssue ? (
          <InlineCreateForm
            status={status}
            projectId={projectId}
            onCreateIssue={onCreateIssue}
            onClose={() => setCreating(false)}
          />
        ) : (
          onCreateIssue && (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground/50 transition-colors hover:bg-accent/30 hover:text-muted-foreground"
            >
              <Plus className="h-3 w-3" />
              <span>New issue</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ── Collapsed Column Strip ── */

function CollapsedColumn({
  status,
  count,
  wipLimit,
  onExpand,
  lanePrefix,
}: {
  status: string;
  count: number;
  wipLimit?: number;
  onExpand: () => void;
  lanePrefix?: string;
}) {
  const droppableId = lanePrefix ? `${lanePrefix}:${status}` : status;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data: { status } });
  const countColorCls = wipColorClass(count, wipLimit);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col items-center shrink-0 w-10 min-h-[200px] rounded-md border border-border/40 cursor-pointer select-none transition-all duration-200",
        isOver ? "bg-accent/40 border-accent" : "bg-muted/10 hover:bg-muted/20",
      )}
      onClick={onExpand}
      title={`Expand ${statusLabel(status)}`}
    >
      <div className="flex flex-col items-center gap-1.5 pt-2 pb-1">
        <StatusIcon status={status} />
        <span className={cn(
          "text-[10px] font-bold tabular-nums",
          countColorCls || "text-muted-foreground/70",
        )}>
          {count}
        </span>
      </div>
      <span
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap"
        style={{ writingMode: "vertical-lr", textOrientation: "mixed" }}
      >
        {statusLabel(status)}
      </span>
    </div>
  );
}

/* ── Draggable Card ── */

function KanbanCard({
  issue,
  agents,
  projects,
  isLive,
  isOverlay,
  isFocused,
  isSelected,
  onToggleSelect,
  onCardContextMenu,
}: {
  issue: Issue;
  agents?: Agent[];
  projects?: ProjectOption[];
  isLive?: boolean;
  isOverlay?: boolean;
  isFocused?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
  onCardContextMenu?: (issue: Issue, x: number, y: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { issue } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const projectName = useMemo(() => {
    if (!issue.projectId || !projects) return null;
    return projects.find((p) => p.id === issue.projectId)?.name ?? null;
  }, [issue.projectId, projects]);

  const issueLabels: IssueLabel[] = issue.labels ?? [];
  const stale = isStale(issue);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-issue-id={issue.id}
      onContextMenu={
        onCardContextMenu
          ? (e) => { e.preventDefault(); onCardContextMenu(issue, e.clientX, e.clientY); }
          : undefined
      }
      className={cn(
        "relative rounded-md border bg-card p-2.5 cursor-grab active:cursor-grabbing transition-shadow group/card",
        isDragging && !isOverlay && "opacity-30",
        isOverlay && "shadow-lg ring-1 ring-primary/20",
        !isOverlay && !isDragging && "hover:shadow-sm",
        isFocused && "ring-2 ring-primary/50",
        isSelected && "ring-2 ring-blue-500/60 bg-blue-500/5",
      )}
    >
      {onToggleSelect && (
        <button
          className={cn(
            "absolute -top-1 -left-1 z-10 h-4 w-4 rounded border border-border bg-card flex items-center justify-center transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover/card:opacity-60",
          )}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect(issue.id, e.shiftKey);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isSelected && <span className="h-2 w-2 rounded-sm bg-blue-500" />}
        </button>
      )}
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        className="block no-underline text-inherit"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
          {stale && (
            <span className="flex items-center gap-0.5 text-amber-500" title="Stale — no updates for 3+ days">
              <Clock className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        <p className="text-sm leading-snug line-clamp-2 mb-1.5">{issue.title}</p>

        {issueLabels.length > 0 && (
          <div className="flex items-center gap-1 mb-1.5 flex-wrap">
            {issueLabels.slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium leading-relaxed"
                style={{
                  borderColor: label.color,
                  color: pickTextColorForPillBg(label.color, 0.12),
                  backgroundColor: `${label.color}1f`,
                }}
              >
                {label.name}
              </span>
            ))}
            {issueLabels.length > 3 && (
              <span className="text-[9px] text-muted-foreground">
                +{issueLabels.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} />
          {projectName && (
            <span className="text-[10px] text-muted-foreground/70 truncate max-w-[100px]">
              {projectName}
            </span>
          )}
          <span className="flex-1" />
          {issue.assigneeAgentId && (() => {
            const name = agentName(issue.assigneeAgentId);
            return name ? (
              <Identity name={name} size="xs" />
            ) : (
              <span className="text-xs text-muted-foreground font-mono">
                {issue.assigneeAgentId.slice(0, 8)}
              </span>
            );
          })()}
        </div>
      </Link>
    </div>
  );
}

/* ── Board Lane (used for both flat + swimlane modes) ── */

function BoardLane({
  issues,
  agents,
  projects,
  liveIssueIds,
  onUpdateIssue,
  onCreateIssue,
  projectId,
  focusedCardId,
  wipLimits,
  onWipLimitChange,
  selectedCardIds,
  onToggleCardSelect,
  lanePrefix,
  collapsedColumns,
  onToggleColumn,
}: {
  issues: Issue[];
  agents?: Agent[];
  projects?: ProjectOption[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  onCreateIssue?: (data: Record<string, unknown>) => void;
  projectId?: string;
  focusedCardId?: string | null;
  wipLimits?: WipLimits;
  onWipLimitChange?: (status: string, limit: number | null) => void;
  selectedCardIds?: Set<string>;
  onToggleCardSelect?: (id: string, shiftKey: boolean) => void;
  lanePrefix?: string;
  collapsedColumns?: Set<string>;
  onToggleColumn?: (status: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(null);

  const handleCardContextMenu = useCallback((issue: Issue, x: number, y: number) => {
    setCtxMenu({ issue, x, y });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const columnIssues = useMemo(() => {
    const grouped: Record<string, Issue[]> = {};
    for (const status of ALL_BOARD_STATUSES) {
      grouped[status] = [];
    }
    for (const issue of issues) {
      if (grouped[issue.status]) {
        grouped[issue.status].push(issue);
      }
    }
    return grouped;
  }, [issues]);

  const activeIssue = useMemo(
    () => (activeId ? issues.find((i) => i.id === activeId) : null),
    [activeId, issues]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const overIdStr = over.id as string;
    const overData = over.data?.current as Record<string, unknown> | undefined;
    const overStatus = (overData?.status as string) ?? null;

    const isColumnDrop = overStatus != null || ALL_BOARD_STATUSES.includes(overIdStr);
    const targetStatusFromColumn = overStatus ?? (ALL_BOARD_STATUSES.includes(overIdStr) ? overIdStr : null);

    if (isColumnDrop && targetStatusFromColumn) {
      if (targetStatusFromColumn !== issue.status) {
        onUpdateIssue(issueId, { status: targetStatusFromColumn });
      }
      return;
    }

    const targetIssue = issues.find((i) => i.id === overIdStr);
    if (!targetIssue) return;

    const sameColumn = targetIssue.status === issue.status;
    const colKey = sameColumn ? issue.status : targetIssue.status;
    const sorted = sortWithinColumn(columnIssues[colKey] ?? []);

    if (sameColumn) {
      const oldIdx = sorted.findIndex((i) => i.id === issueId);
      const newIdx = sorted.findIndex((i) => i.id === targetIssue.id);
      if (oldIdx === newIdx) return;

      const without = sorted.filter((i) => i.id !== issueId);
      const targetIdxInWithout = without.findIndex((i) => i.id === targetIssue.id);

      let before: string | null;
      let after: string | null;
      if (newIdx > oldIdx) {
        before = without[targetIdxInWithout]?.sortOrder ?? null;
        after = targetIdxInWithout + 1 < without.length ? (without[targetIdxInWithout + 1].sortOrder ?? null) : null;
      } else {
        before = targetIdxInWithout > 0 ? (without[targetIdxInWithout - 1].sortOrder ?? null) : null;
        after = without[targetIdxInWithout]?.sortOrder ?? null;
      }

      try {
        const newOrder = generateKeyBetween(before, after);
        onUpdateIssue(issueId, { sortOrder: newOrder });
      } catch {
        onUpdateIssue(issueId, { sortOrder: generateKeyBetween(null, null) });
      }
    } else {
      const targetIdx = sorted.findIndex((i) => i.id === targetIssue.id);
      const before = targetIdx > 0 ? (sorted[targetIdx - 1].sortOrder ?? null) : null;
      const after = sorted[targetIdx]?.sortOrder ?? null;

      try {
        const newOrder = generateKeyBetween(before, after);
        onUpdateIssue(issueId, { status: targetIssue.status, sortOrder: newOrder });
      } catch {
        onUpdateIssue(issueId, { status: targetIssue.status, sortOrder: generateKeyBetween(null, null) });
      }
    }
  }, [issues, columnIssues, onUpdateIssue]);

  const handleDragOver = useCallback((_event: DragOverEvent) => {}, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 items-start">
        {ALL_BOARD_STATUSES.map((status) => {
          const isCollapsed = collapsedColumns?.has(status) ?? false;
          const colIssues = columnIssues[status] ?? [];

          if (isCollapsed) {
            return (
              <CollapsedColumn
                key={status}
                status={status}
                count={colIssues.length}
                wipLimit={wipLimits?.[status]}
                onExpand={() => onToggleColumn?.(status)}
                lanePrefix={lanePrefix}
              />
            );
          }

          return (
            <KanbanColumn
              key={status}
              status={status}
              issues={colIssues}
              agents={agents}
              projects={projects}
              liveIssueIds={liveIssueIds}
              onCreateIssue={onCreateIssue}
              projectId={projectId}
              focusedCardId={focusedCardId}
              wipLimit={wipLimits?.[status]}
              onWipLimitChange={onWipLimitChange}
              selectedCardIds={selectedCardIds}
              onToggleCardSelect={onToggleCardSelect}
              onCardContextMenu={handleCardContextMenu}
              lanePrefix={lanePrefix}
              onCollapse={onToggleColumn ? () => onToggleColumn(status) : undefined}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <KanbanCard issue={activeIssue} agents={agents} projects={projects} isOverlay />
        ) : null}
      </DragOverlay>
      {ctxMenu && (
        <CardContextMenu
          issue={ctxMenu.issue}
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          agents={agents}
          projects={projects}
          onUpdateIssue={onUpdateIssue}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </DndContext>
  );
}

/* ── Swimlane Header ── */

function SwimlaneHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-foreground hover:bg-accent/30 rounded-md transition-colors w-full text-left"
    >
      {collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span>{label}</span>
      <span className="text-xs text-muted-foreground/60 tabular-nums">{count}</span>
    </button>
  );
}

/* ── Card Context Menu ── */

type ContextMenuState = { issue: Issue; x: number; y: number } | null;

function CardContextMenu({
  issue,
  position,
  agents,
  projects,
  onUpdateIssue,
  onClose,
}: {
  issue: Issue;
  position: { x: number; y: number };
  agents?: Agent[];
  projects?: ProjectOption[];
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [submenu, setSubmenu] = useState<"status" | "assign" | "project" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const issueUrl = `${window.location.origin}/issues/${issue.identifier ?? issue.id}`;

  const itemCls =
    "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs hover:bg-accent/50 text-left transition-colors";

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ left: position.x, top: position.y }}
    >
      <div className="relative">
        <button
          className={itemCls}
          onClick={() => setSubmenu(submenu === "status" ? null : "status")}
        >
          <StatusIcon status={issue.status} />
          <span>Set Status</span>
          <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
        </button>
        {submenu === "status" && (
          <div className="absolute left-full top-0 ml-1 min-w-[160px] rounded-lg border border-border bg-card p-1 shadow-lg">
            {ALL_BOARD_STATUSES.map((s) => (
              <button
                key={s}
                className={cn(itemCls, s === issue.status && "bg-accent/30")}
                onClick={() => { onUpdateIssue(issue.id, { status: s }); onClose(); }}
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
          className={itemCls}
          onClick={() => setSubmenu(submenu === "assign" ? null : "assign")}
        >
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Assign</span>
          <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
        </button>
        {submenu === "assign" && (
          <div className="absolute left-full top-0 ml-1 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg max-h-48 overflow-y-auto">
            <button
              className={cn(itemCls, !issue.assigneeAgentId && "bg-accent/30")}
              onClick={() => { onUpdateIssue(issue.id, { assigneeAgentId: null, assigneeUserId: null }); onClose(); }}
            >
              No assignee
            </button>
            {(agents ?? []).map((agent) => (
              <button
                key={agent.id}
                className={cn(itemCls, issue.assigneeAgentId === agent.id && "bg-accent/30")}
                onClick={() => { onUpdateIssue(issue.id, { assigneeAgentId: agent.id, assigneeUserId: null }); onClose(); }}
              >
                <Identity name={agent.name} size="xs" />
              </button>
            ))}
          </div>
        )}
      </div>

      {projects && projects.length > 0 && (
        <div className="relative">
          <button
            className={itemCls}
            onClick={() => setSubmenu(submenu === "project" ? null : "project")}
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Move to Project</span>
            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
          </button>
          {submenu === "project" && (
            <div className="absolute left-full top-0 ml-1 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-lg max-h-48 overflow-y-auto">
              <button
                className={cn(itemCls, !issue.projectId && "bg-accent/30")}
                onClick={() => { onUpdateIssue(issue.id, { projectId: null }); onClose(); }}
              >
                No project
              </button>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={cn(itemCls, issue.projectId === project.id && "bg-accent/30")}
                  onClick={() => { onUpdateIssue(issue.id, { projectId: project.id }); onClose(); }}
                >
                  {project.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="my-1 h-px bg-border" />

      <button
        className={itemCls}
        onClick={() => { navigator.clipboard.writeText(issueUrl); onClose(); }}
      >
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Copy Link</span>
      </button>

      <button
        className={itemCls}
        onClick={() => { window.open(`/issues/${issue.identifier ?? issue.id}`, "_blank"); onClose(); }}
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Open in New Tab</span>
      </button>
    </div>
  );
}

/* ── Board Metrics + Analytics ── */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CFD_DAYS = 30;

const STATUS_COLORS: Record<string, string> = {
  backlog: "#6b7280",
  todo: "#a855f7",
  in_progress: "#3b82f6",
  in_review: "#f59e0b",
  blocked: "#ef4444",
  done: "#22c55e",
  cancelled: "#9ca3af",
};

function useMetrics(issues: Issue[]) {
  return useMemo(() => {
    const now = Date.now();
    const cutoff = now - SEVEN_DAYS_MS;

    const completedRecently = issues.filter(
      (i) => i.completedAt && new Date(i.completedAt).getTime() > cutoff,
    );

    const withCycle = issues.filter((i) => i.startedAt && i.completedAt);
    const avgCycleMs =
      withCycle.length > 0
        ? withCycle.reduce(
            (sum, i) =>
              sum + (new Date(i.completedAt!).getTime() - new Date(i.startedAt!).getTime()),
            0,
          ) / withCycle.length
        : 0;
    const avgCycleDays = Math.round((avgCycleMs / ONE_DAY_MS) * 10) / 10;

    const wipStatuses = new Set(["in_progress", "in_review", "blocked"]);
    const wipIssues = issues.filter((i) => wipStatuses.has(i.status));
    const wipByStatus: Record<string, number> = {};
    for (const i of wipIssues) {
      wipByStatus[i.status] = (wipByStatus[i.status] ?? 0) + 1;
    }

    return { throughput7d: completedRecently.length, avgCycleDays, wipTotal: wipIssues.length, wipByStatus };
  }, [issues]);
}

export function BoardMetrics({ issues, companyId }: { issues: Issue[]; companyId?: string }) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const metrics = useMetrics(issues);

  const wipParts = Object.entries(metrics.wipByStatus)
    .map(([s, n]) => `${n} ${statusLabel(s).toLowerCase()}`)
    .join(" · ");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-lg border border-border/40 bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3" />
          <span className="font-medium text-foreground tabular-nums">{metrics.throughput7d}</span>
          <span>completed (7d)</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5">
          <Timer className="h-3 w-3" />
          <span className="font-medium text-foreground tabular-nums">
            {metrics.avgCycleDays > 0 ? `${metrics.avgCycleDays}d` : "—"}
          </span>
          <span>avg cycle</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          <span className="font-medium text-foreground tabular-nums">{metrics.wipTotal}</span>
          <span>WIP</span>
          {wipParts && <span className="text-muted-foreground/60">({wipParts})</span>}
        </span>
        <button
          className={cn(
            "ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 transition-colors hover:bg-accent/50",
            showAnalytics && "text-foreground bg-accent/30",
          )}
          onClick={() => setShowAnalytics((v) => !v)}
        >
          <BarChart3 className="h-3 w-3" />
          <span className="hidden sm:inline">Analytics</span>
        </button>
      </div>
      {showAnalytics && <BoardAnalytics issues={issues} companyId={companyId} />}
    </div>
  );
}

/* ── Board Analytics Panel ── */

function BoardAnalytics({ issues, companyId }: { issues: Issue[]; companyId?: string }) {
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - CFD_DAYS);
    return d.toISOString();
  }, []);

  const { data: transitions } = useQuery({
    queryKey: ["issue-transitions", companyId, since],
    queryFn: () => issuesApi.listTransitions(companyId!, { since }),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-border/30 bg-card p-3">
      <CumulativeFlowChart issues={issues} transitions={transitions ?? []} />
      <LeadTimeHistogram issues={issues} />
      <AgingWipChart issues={issues} />
    </div>
  );
}

function CumulativeFlowChart({
  issues,
  transitions,
}: {
  issues: Issue[];
  transitions: StatusTransition[];
}) {
  const hasRealData = transitions.length > 0;

  const data = useMemo(() => {
    const now = Date.now();
    const startDate = now - CFD_DAYS * ONE_DAY_MS;
    const phases = ["done", "in_review", "in_progress", "todo", "backlog"] as const;
    const days: { date: string; counts: Record<string, number> }[] = [];

    if (hasRealData) {
      const issueStatusAtDay = new Map<string, string>();
      for (const issue of issues) {
        issueStatusAtDay.set(issue.id, "backlog");
      }

      const sortedTransitions = [...transitions]
        .map((t) => ({ ...t, ts: new Date(t.createdAt).getTime() }))
        .sort((a, b) => a.ts - b.ts);

      let tPtr = 0;
      for (let d = 0; d <= CFD_DAYS; d++) {
        const dayEnd = startDate + (d + 1) * ONE_DAY_MS;
        const dateStr = new Date(startDate + d * ONE_DAY_MS).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        while (tPtr < sortedTransitions.length && sortedTransitions[tPtr].ts <= dayEnd) {
          issueStatusAtDay.set(sortedTransitions[tPtr].issueId, sortedTransitions[tPtr].toStatus);
          tPtr++;
        }

        const counts: Record<string, number> = {};
        for (const p of phases) counts[p] = 0;

        for (const issue of issues) {
          const created = new Date(issue.createdAt).getTime();
          if (created > dayEnd) continue;

          const s = issueStatusAtDay.get(issue.id) ?? "backlog";
          if (s === "done" || s === "cancelled") counts["done"]++;
          else if (s === "in_review") counts["in_review"]++;
          else if (s === "in_progress" || s === "blocked") counts["in_progress"]++;
          else if (s === "todo") counts["todo"]++;
          else counts["backlog"]++;
        }
        days.push({ date: dateStr, counts });
      }
    } else {
      for (let d = 0; d <= CFD_DAYS; d++) {
        const dayTs = startDate + d * ONE_DAY_MS;
        const dateStr = new Date(dayTs).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const counts: Record<string, number> = {};
        for (const p of phases) counts[p] = 0;

        for (const issue of issues) {
          const created = new Date(issue.createdAt).getTime();
          if (created > dayTs) continue;

          const completed = issue.completedAt ? new Date(issue.completedAt).getTime() : null;
          const cancelled = issue.cancelledAt ? new Date(issue.cancelledAt).getTime() : null;
          const started = issue.startedAt ? new Date(issue.startedAt).getTime() : null;

          if ((completed && completed <= dayTs) || (cancelled && cancelled <= dayTs)) {
            counts["done"]++;
          } else if (started && started <= dayTs) {
            const s = issue.status;
            if (s === "in_review") counts["in_review"]++;
            else counts["in_progress"]++;
          } else {
            if (issue.status === "todo") counts["todo"]++;
            else counts["backlog"]++;
          }
        }
        days.push({ date: dateStr, counts });
      }
    }
    return { days, phases };
  }, [issues, transitions, hasRealData]);

  const maxTotal = Math.max(1, ...data.days.map((d) => Object.values(d.counts).reduce((a, b) => a + b, 0)));
  const W = 300;
  const H = 120;

  const paths = useMemo(() => {
    const result: { phase: string; d: string; color: string }[] = [];
    for (const phase of data.phases) {
      const points: string[] = [];
      for (let i = 0; i < data.days.length; i++) {
        const x = (i / (data.days.length - 1)) * W;
        let cumBefore = 0;
        for (const p of data.phases) {
          if (p === phase) break;
          cumBefore += data.days[i].counts[p];
        }
        const cumAfter = cumBefore + data.days[i].counts[phase];
        const y1 = H - (cumBefore / maxTotal) * H;
        const y2 = H - (cumAfter / maxTotal) * H;
        if (points.length === 0) {
          points.push(`M ${x} ${y1}`);
        }
        points.push(`L ${x} ${y2}`);
      }
      for (let i = data.days.length - 1; i >= 0; i--) {
        const x = (i / (data.days.length - 1)) * W;
        let cumBefore = 0;
        for (const p of data.phases) {
          if (p === phase) break;
          cumBefore += data.days[i].counts[p];
        }
        const y1 = H - (cumBefore / maxTotal) * H;
        points.push(`L ${x} ${y1}`);
      }
      points.push("Z");
      result.push({ phase, d: points.join(" "), color: STATUS_COLORS[phase] ?? "#6b7280" });
    }
    return result;
  }, [data, maxTotal]);

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">
        Cumulative Flow (30d)
        {hasRealData && <span className="ml-1 text-[9px] font-normal text-green-500/70">live</span>}
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        {paths.map((p) => (
          <path key={p.phase} d={p.d} fill={p.color} opacity={0.7} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {data.phases.map((p) => (
          <span key={p} className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: STATUS_COLORS[p] }} />
            {statusLabel(p)}
          </span>
        ))}
      </div>
    </div>
  );
}

function LeadTimeHistogram({ issues }: { issues: Issue[] }) {
  const buckets = useMemo(() => {
    const completed = issues.filter((i) => i.completedAt);
    const leadDays = completed.map((i) => {
      const created = new Date(i.createdAt).getTime();
      const done = new Date(i.completedAt!).getTime();
      return Math.max(0, Math.round((done - created) / ONE_DAY_MS));
    });

    if (leadDays.length === 0) return [];

    const maxDay = Math.max(...leadDays, 1);
    const bucketSize = maxDay <= 7 ? 1 : maxDay <= 30 ? 7 : 30;
    const groups: { label: string; count: number }[] = [];

    for (let start = 0; start <= maxDay; start += bucketSize) {
      const end = start + bucketSize;
      const count = leadDays.filter((d) => d >= start && d < end).length;
      const label = bucketSize === 1 ? `${start}d` : `${start}–${end - 1}d`;
      groups.push({ label, count });
    }
    return groups;
  }, [issues]);

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  if (buckets.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2">Lead Time</h4>
        <p className="text-xs text-muted-foreground/50 italic">No completed issues</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Lead Time Distribution</h4>
      <div className="flex items-end gap-1 h-[120px]">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <span className="text-[8px] text-muted-foreground tabular-nums mb-0.5">
              {b.count > 0 ? b.count : ""}
            </span>
            <div
              className="w-full rounded-t bg-blue-500/70 transition-all min-h-[2px]"
              style={{ height: `${(b.count / maxCount) * 100}%` }}
            />
            <span className="text-[8px] text-muted-foreground/60 mt-0.5 truncate w-full text-center">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgingWipChart({ issues }: { issues: Issue[] }) {
  const wipItems = useMemo(() => {
    const now = Date.now();
    const activeStatuses = new Set(["in_progress", "in_review", "blocked"]);
    return issues
      .filter((i) => activeStatuses.has(i.status))
      .map((i) => {
        const start = i.startedAt ? new Date(i.startedAt).getTime() : new Date(i.updatedAt).getTime();
        const ageDays = Math.round(((now - start) / ONE_DAY_MS) * 10) / 10;
        return {
          id: i.id,
          title: i.title,
          identifier: i.identifier ?? i.id.slice(0, 8),
          status: i.status,
          ageDays,
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [issues]);

  const maxAge = Math.max(1, ...wipItems.map((w) => w.ageDays));

  if (wipItems.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-2">Aging WIP</h4>
        <p className="text-xs text-muted-foreground/50 italic">No active WIP items</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">Aging WIP</h4>
      <div className="space-y-1 max-h-[120px] overflow-y-auto">
        {wipItems.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5 text-[10px]">
            <span className="font-mono text-muted-foreground w-14 shrink-0 truncate">
              {item.identifier}
            </span>
            <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: `${Math.min(100, (item.ageDays / maxAge) * 100)}%`,
                  backgroundColor: STATUS_COLORS[item.status] ?? "#6b7280",
                  opacity: item.ageDays > 7 ? 1 : 0.7,
                }}
              />
            </div>
            <span className="text-muted-foreground tabular-nums w-8 text-right shrink-0">
              {item.ageDays}d
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Board ── */

export function KanbanBoard({
  issues,
  agents,
  projects,
  liveIssueIds,
  onUpdateIssue,
  onCreateIssue,
  projectId,
  focusedCardId,
  wipLimits,
  onWipLimitChange,
  swimlaneBy = "none",
  selectedCardIds,
  onToggleCardSelect,
  collapsedColumns,
  onToggleColumn,
}: KanbanBoardProps) {
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());

  const toggleLane = useCallback((key: string) => {
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const swimlanes = useMemo((): SwimlaneLane[] => {
    if (swimlaneBy === "none") return [];

    const grouped: Record<string, Issue[]> = {};

    for (const issue of issues) {
      let key: string;
      if (swimlaneBy === "assignee") {
        key = issue.assigneeAgentId ?? "__unassigned";
      } else {
        key = issue.projectId ?? "__none";
      }
      (grouped[key] ??= []).push(issue);
    }

    return Object.entries(grouped).map(([key, items]) => {
      let label: string;
      if (swimlaneBy === "assignee") {
        if (key === "__unassigned") {
          label = "Unassigned";
        } else {
          label = agents?.find((a) => a.id === key)?.name ?? key.slice(0, 8);
        }
      } else {
        if (key === "__none") {
          label = "No Project";
        } else {
          label = projects?.find((p) => p.id === key)?.name ?? key.slice(0, 8);
        }
      }
      return { key, label, issues: items };
    }).sort((a, b) => {
      if (a.key === "__unassigned" || a.key === "__none") return 1;
      if (b.key === "__unassigned" || b.key === "__none") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [issues, swimlaneBy, agents, projects]);

  if (swimlaneBy === "none") {
    return (
      <BoardLane
        issues={issues}
        agents={agents}
        projects={projects}
        liveIssueIds={liveIssueIds}
        onUpdateIssue={onUpdateIssue}
        onCreateIssue={onCreateIssue}
        projectId={projectId}
        focusedCardId={focusedCardId}
        wipLimits={wipLimits}
        onWipLimitChange={onWipLimitChange}
        selectedCardIds={selectedCardIds}
        onToggleCardSelect={onToggleCardSelect}
        collapsedColumns={collapsedColumns}
        onToggleColumn={onToggleColumn}
      />
    );
  }

  return (
    <div className="space-y-2">
      {swimlanes.map((lane) => {
        const isCollapsed = collapsedLanes.has(lane.key);
        return (
          <div key={lane.key} className="border border-border/30 rounded-lg overflow-hidden">
            <SwimlaneHeader
              label={lane.label}
              count={lane.issues.length}
              collapsed={isCollapsed}
              onToggle={() => toggleLane(lane.key)}
            />
            {!isCollapsed && (
              <div className="px-1 pb-2">
                <BoardLane
                  issues={lane.issues}
                  agents={agents}
                  projects={projects}
                  liveIssueIds={liveIssueIds}
                  onUpdateIssue={onUpdateIssue}
                  onCreateIssue={onCreateIssue}
                  projectId={projectId}
                  focusedCardId={focusedCardId}
                  wipLimits={wipLimits}
                  onWipLimitChange={onWipLimitChange}
                  selectedCardIds={selectedCardIds}
                  onToggleCardSelect={onToggleCardSelect}
                  lanePrefix={lane.key}
                  collapsedColumns={collapsedColumns}
                  onToggleColumn={onToggleColumn}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
