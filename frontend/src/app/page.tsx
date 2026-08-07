import { redirect } from "next/navigation";

/**
 * Home ("/") — server-side redirect a `/tickets` (T6.2, sdd/beta-frontend
 * B6). `/tickets` es la única ruta visible para TODOS los roles
 * (`nav-config.ts`, `visible: () => true`) — el default seguro tras login,
 * a diferencia de `/dashboard` (requiere `ticket:ver_todos`, USUARIO no lo
 * tiene). El middleware ya protege esta ruta (usuario no autenticado nunca
 * la alcanza); `LoginPage` sigue empujando a `/` (ver su test), que ahora
 * reenvía a `/tickets` en vez de mostrar el placeholder de andamiaje Fase 0.
 */
export default function Home() {
  redirect("/tickets");
}
