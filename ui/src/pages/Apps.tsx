import { useEffect, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, ExternalLink, LayoutList, Rocket } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { projectRouteRef } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../components/StatusBadge";
import type { Issue } from "@paperclipai/shared";

const OPEN_STATUSES = new Set(["todo", "in_progress", "blocked", "backlog"]);

function aggregateByProject(issues: Issue[]) {
  const map = new Map<
    string,
    { open: number; done: number }
  >();
  for (const issue of issues) {
    const pid = issue.projectId;
    if (!pid) continue;
    let row = map.get(pid);
    if (!row) {
      row = { open: 0, done: 0 };
      map.set(pid, row);
    }
    if (issue.status === "done" || issue.status === "cancelled") {
      row.done += 1;
    } else if (OPEN_STATUSES.has(issue.status)) {
      row.open += 1;
    } else {
      row.open += 1;
    }
  }
  return map;
}

export function Apps() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Apps" }]);
  }, [setBreadcrumbs]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "apps-launchpad"],
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const statsByProject = useMemo(() => aggregateByProject(issues), [issues]);

  const activeProjects = useMemo(
    () =>
      projects
        .filter((p) => !p.archivedAt)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );

  const loading = projectsLoading || issuesLoading;

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company to view apps.</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Rocket className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Apps & demos</h2>
          <p className="text-sm text-muted-foreground">
            <strong>Canonical:</strong> each card shows only what is saved under{" "}
            <span className="text-foreground/90">Project → Configuration → Product &amp; demo links</span>. There is
            no second registry — edit there so demo URLs never contradict each other. Issue counts come from
            Paperclip issues.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No active projects. Create a project from the sidebar, then add demo URLs under{" "}
          <strong>Project → Configuration → Product &amp; demo links</strong>.
        </div>
      ) : (
        <ul className="space-y-3">
          {activeProjects.map((project) => {
            const ref = projectRouteRef(project);
            const stats = statsByProject.get(project.id) ?? { open: 0, done: 0 };
            const hasAnyLink = Boolean(project.demoSiteUrl?.trim() || project.demoAppUrl?.trim());
            return (
              <li
                key={project.id}
                className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: project.color ?? "#6366f1" }}
                    />
                    <span className="font-medium truncate">{project.name}</span>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.open} open · {stats.done} closed ·{" "}
                    <Link to={`/projects/${ref}/issues`} className="text-foreground/80 hover:underline inline-flex items-center gap-1">
                      <LayoutList className="h-3 w-3" />
                      Issues
                    </Link>
                    {" · "}
                    <Link
                      to={`/projects/${ref}/configuration`}
                      className="text-foreground/80 hover:underline"
                    >
                      Edit links
                    </Link>
                  </p>
                  {hasAnyLink ? (
                    <div className="space-y-0.5 text-[11px] text-muted-foreground">
                      {project.demoSiteUrl ? (
                        <div className="font-mono truncate" title={project.demoSiteUrl}>
                          <span className="text-foreground/70">Demo site:</span> {project.demoSiteUrl}
                        </div>
                      ) : null}
                      {project.demoAppUrl ? (
                        <div className="font-mono truncate" title={project.demoAppUrl}>
                          <span className="text-foreground/70">App link:</span> {project.demoAppUrl}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      No demo URLs yet — add them in project configuration.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {project.demoSiteUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.demoSiteUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Demo site
                      </a>
                    </Button>
                  ) : null}
                  {project.demoAppUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.demoAppUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                        <AppWindow className="h-3.5 w-3.5" />
                        App
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
