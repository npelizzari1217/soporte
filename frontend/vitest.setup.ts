import "@testing-library/jest-dom";
import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./test/msw/server";

// Polyfill PointerEvent methods that jsdom doesn't implement.
// Required by Radix UI primitives (Select, DropdownMenu, etc.) which use the
// pointer capture API internally for event handling.
// Without this, any Radix component that calls target.hasPointerCapture() in
// jsdom throws "is not a function" — a known jsdom limitation.
if (typeof window !== 'undefined') {
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = () => false
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => undefined
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = () => undefined
  }
  // ResizeObserver polyfill — needed by Radix Select's content positioning
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  // scrollIntoView is not implemented by jsdom — needed by Radix Select when
  // it tries to scroll the selected item into view after the listbox opens.
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = function () {}
  }
}

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
