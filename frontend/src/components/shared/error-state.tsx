"use client";

/**
 * ErrorState — premium error placeholder with optional retry.
 * `role="alert"` so assistive tech announces the failure immediately (WCAG AA).
 * Spec: R-M0 primitivas compartidas / ADR-8 (Error = `<ErrorState>` con retry).
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <p className="text-sm text-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-2">
          Reintentar
        </Button>
      )}
    </div>
  );
}
