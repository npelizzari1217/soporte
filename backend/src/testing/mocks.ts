import { vi } from 'vitest';

/**
 * Creates a throwing stub for a mocked collaborator method that the spec under
 * test never actually calls.
 *
 * WHY: completing a mock against its real interface (see design D3) means every
 * method must be present, but methods the test never exercises should fail
 * loudly if production code starts calling them instead of silently returning
 * `undefined`. This is what turns a coverage gap into a visible finding instead
 * of a green test that no longer matches the real contract.
 *
 * The return type is inferred as `never` because the function body always
 * throws, which makes it structurally assignable to any collaborator method
 * signature without resorting to `any`.
 *
 * @param name - Human-readable identifier of the unstubbed method, included in
 *   the thrown error message to make the failure traceable to its source.
 */
export const unstubbed = (name: string) =>
  vi.fn(() => {
    throw new Error(`Unstubbed collaborator method: ${name}`);
  });
