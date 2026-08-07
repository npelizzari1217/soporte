import { type RequestHandler } from "msw";

// Base handlers — extended per test via server.use(...).
export const handlers: RequestHandler[] = [];
