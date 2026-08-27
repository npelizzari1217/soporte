import type { NextConfig } from "next";

/**
 * Lee una variable de entorno requerida y la devuelve sin espacios al borde, o
 * corta el build nombrándola.
 *
 * Espeja a `construirEntorno` del backend (backend/src/config/validar-entorno.ts),
 * que trata ausente, cadena vacía y solo-espacios como el mismo caso. Sin esto
 * las dos mitades dejaban de fallar juntas: el backend se negaba a arrancar
 * mientras el frontend compilaba con `""`, y después `verify.ts` verificaba
 * contra esa cadena vacía — ningún token validaba y TODOS los usuarios
 * rebotaban al login, sin un error en ningún log.
 *
 * Corta en build y no en runtime a propósito: la clave `env` de abajo inlinea
 * el valor en tiempo de build, así que en runtime ya es tarde para revisarlo.
 *
 * @param clave Nombre de la variable, para nombrarla en el error.
 * @param valor Valor crudo leído de `process.env`.
 * @returns El valor sin espacios al borde.
 * @throws {Error} Si el valor falta, es cadena vacía o es solo espacios.
 */
function exigir(clave: string, valor: string | undefined): string {
  const limpio = valor?.trim() ?? "";
  if (limpio === "") {
    throw new Error(
      `[next.config] Falta configurar: ${clave}. Es requerida y no tiene default; ` +
        `el backend tampoco arranca sin ella (ver backend/src/config/entorno.ts).`,
    );
  }
  return limpio;
}

const nextConfig: NextConfig = {
  // OJO CON ESTA CLAVE. `env` NO es un canal server-side: Next inlinea estos
  // valores en el bundle de JavaScript, reemplazando cada `process.env.X` en
  // tiempo de build. Es el reemplazo legacy de `NEXT_PUBLIC_`, no lo contrario.
  //
  // Hoy JWT_SECRET no se filtra al navegador porque su única referencia es
  // `src/shared/auth/verify.ts`, y a ese lo consume solo `src/middleware.ts`
  // (Edge, server). Pero el inlineado ocurre POR REFERENCIA: alcanza con que un
  // componente `"use client"` lea `process.env.JWT_SECRET` para que la clave de
  // firma HMAC viaje a todos los navegadores, sin error de build, sin warning y
  // sin regla de lint que avise. Antes de agregar una referencia nueva,
  // verificá de qué lado corre.
  env: {
    // Trimeado por un motivo propio además del espejo: este valor se interpola
    // en `new URL(...)` (src/app/api/[...path]/route.ts) y en los `fetch` de
    // las rutas de auth, donde un espacio al borde tira.
    // NO pasa por `exigir`: volverla requerida es un cambio de comportamiento
    // propio, fuera del alcance de este work unit. Se trimea nomás.
    BACKEND_URL: process.env.BACKEND_URL?.trim() ?? "",
    JWT_SECRET: exigir("JWT_SECRET", process.env.JWT_SECRET),
  },
};

export default nextConfig;
