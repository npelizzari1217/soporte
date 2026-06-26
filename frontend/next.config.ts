import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose server-side env vars to the Next.js runtime.
  // NODE_ENV is automatically available and cannot be overridden here.
  // BACKEND_URL and JWT_SECRET are used by route handlers and middleware (server-side only).
  env: {
    BACKEND_URL: process.env.BACKEND_URL ?? "",
    JWT_SECRET: process.env.JWT_SECRET ?? "",
  },
};

export default nextConfig;
