"use client";

/**
 * Breadcrumbs — derives a crumb trail from the current pathname (ADR-1,
 * spec §R-M0). Known route roots reuse the `NAV_ITEMS` label (single source
 * of truth); unknown/dynamic segments (e.g. IDs, sub-routes) are humanized
 * (dash→space, capitalized) as a readable fallback.
 */
import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { NAV_ITEMS } from "@/shared/nav/nav-config";

function humanize(segment: string): string {
  const knownLabel = NAV_ITEMS.find((item) => item.href === `/${segment}`)?.label;
  if (knownLabel) return knownLabel;
  return segment
    .split("-")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function Breadcrumbs() {
  const pathname = usePathname() ?? "";
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        const label = humanize(segment);

        return (
          <Fragment key={href}>
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {isLast ? (
              <span aria-current="page" className="font-medium text-foreground">
                {label}
              </span>
            ) : (
              <Link href={href} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
