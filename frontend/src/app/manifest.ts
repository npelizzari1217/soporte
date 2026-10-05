import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA instalable, solo online).
 *
 * Decisiones del dueño (2026-10-05, docs/roadmap-comercial.md, segunda etapa punto 2):
 * un único ícono para todos los clientes (el manifest es por origen), sin service worker
 * ni soporte offline, e instalación desde el menú del navegador.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Soporte Sesitec",
    short_name: "Soporte",
    description: "Tickets de soporte, compras y reparaciones edilicias",
    start_url: "/tickets",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
