/**
 * Tests for formatDate (extracted from TicketsList — PR1 of ticket-detail-page).
 *
 * TDD RED — written before extraction.
 * Atomic unit test: pure function, one input → one output.
 */

import { describe, it, expect } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formats an ISO date string as es-AR dd/mm/yyyy", () => {
    expect(formatDate("2026-01-15T10:00:00Z")).toBe("15/01/2026");
  });

  it("pads single-digit day and month with a leading zero", () => {
    expect(formatDate("2026-03-05T10:00:00Z")).toBe("05/03/2026");
  });
});
