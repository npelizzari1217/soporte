import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expone variables de entorno server-side a route handlers y middleware.
  // NODE_ENV está disponible automáticamente y no puede sobreescribirse acá.
  env: {
    BACKEND_URL: process.env.BACKEND_URL ?? "",
    JWT_SECRET: process.env.JWT_SECRET ?? "",
  },
};

export default nextConfig;
