import { Link } from "react-router";
import { AlertCircle } from "lucide-react";
import { useI18n } from "@/i18n";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";

/** Shared safe unavailable / request-error surface for admin detail pages. */
export function DataUnavailable({
  kind,
  onRetry,
  backTo,
  backLabel,
}: {
  kind: "unavailable" | "error";
  onRetry?: () => void;
  backTo?: string;
  backLabel?: string;
}) {
  const { t } = useI18n();
  if (kind === "error") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
        <span className="flex items-center gap-2">
          <AlertCircle className="size-4" aria-hidden />
          {t("common.requestError")}
        </span>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border bg-surface shadow-card">
      <EmptyState
        illustration="unavailable"
        title={t("common.unavailable")}
        body={t("common.unavailableBody")}
        action={
          backTo ? (
            <Link to={backTo}>
              <Button variant="secondary">{backLabel ?? t("common.back")}</Button>
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
