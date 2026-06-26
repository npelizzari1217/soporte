/**
 * T1.3 — RootLayout FOUC script + suppressHydrationWarning (RED phase)
 *
 * Strategy: inspect the React element tree returned by RootLayout directly.
 * RTL can't render <html> elements properly in jsdom (they get hoisted/stripped),
 * so we call the layout function and traverse the JSX tree — this is both cleaner
 * and more precise for asserting structure and string content.
 *
 * Assertions:
 * - <html> has suppressHydrationWarning (prevents React hydration mismatch warning)
 * - <html> does NOT have className (the FOUC script manages the class, not SSR)
 * - A <script> element exists with dangerouslySetInnerHTML containing the FOUC logic
 * - The script string contains localStorage.getItem('theme')
 * - The script string contains classList.toggle('dark'
 * - The script string contains prefers-color-scheme
 */
import { describe, it, expect } from "vitest";
import React from "react";
import RootLayout from "./layout";

/**
 * Traverses a React element tree depth-first.
 * Returns the first element whose `type` matches the given HTML tag name.
 */
function findEl(
  node: React.ReactNode,
  type: string,
): React.ReactElement | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node as React.ReactElement;

  const children = (node as React.ReactElement).props?.children;
  if (!children) return null;

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    const found = findEl(child, type);
    if (found) return found;
  }
  return null;
}

describe("RootLayout — FOUC + suppressHydrationWarning", () => {
  // RootLayout is synchronous — call as a plain function to inspect JSX tree
  const tree = RootLayout({ children: <></> });

  it("<html> tiene suppressHydrationWarning para evitar mismatch de hidratación", () => {
    expect(React.isValidElement(tree)).toBe(true);
    const html = tree as React.ReactElement;
    expect(html.props.suppressHydrationWarning).toBe(true);
  });

  it("<html> NO tiene className — el script FOUC es quien gestiona la clase .dark", () => {
    const html = tree as React.ReactElement;
    // className="dark" hardcodeado fue removido; la clase la aplica el script en runtime
    expect(html.props.className).toBeUndefined();
  });

  it("existe un <script> FOUC inline en el árbol del layout", () => {
    const script = findEl(tree, "script");
    expect(script).not.toBeNull();
    expect(script!.props.dangerouslySetInnerHTML).toBeDefined();
  });

  it("el script contiene localStorage.getItem('theme')", () => {
    const script = findEl(tree, "script")!;
    const html = script.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("localStorage.getItem('theme')");
  });

  it("el script contiene classList.toggle('dark'", () => {
    const script = findEl(tree, "script")!;
    const html = script.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("classList.toggle('dark'");
  });

  it("el script contiene prefers-color-scheme", () => {
    const script = findEl(tree, "script")!;
    const html = script.props.dangerouslySetInnerHTML.__html as string;
    expect(html).toContain("prefers-color-scheme");
  });
});
