type PolicySourceBadgeProps = {
  label: string;
  source: "instance default" | "company override" | "loading";
};

export function PolicySourceBadge({ label, source }: PolicySourceBadgeProps) {
  return (
    <p className="inline-flex items-center rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
      {label}: {source}
    </p>
  );
}
