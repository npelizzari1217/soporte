-- Migration: 20260813130000_remove_permiso_compra_de_tecnico
-- PR-3 — redisenio-modulo-compras (RBAC master)
-- Ref spec: sdd/redisenio-modulo-compras/spec §4.11 (S38/S39 — TECNICO -> 403
-- en compra:gestionar y compra:aprobar).
-- Ref design: sdd/redisenio-modulo-compras/design (ADR-C4/controller — guards
-- estándar + `compra:gestionar` en gestión, `compra:aprobar` en aprobar/rechazar).
--
-- TECNICO deja de poder gestionar/aprobar compras. Es una migración ADITIVA
-- en el sentido de que NO borra filas de `permisos`: `compra:gestionar` y
-- `compra:aprobar` siguen existiendo como permisos atómicos y los sigue
-- usando el rol ADMINISTRADOR (y COLABORADOR, sin cambios). Lo único que se
-- borra son las DOS filas de `roles_permisos` que vinculaban TECNICO con
-- esos permisos — la desasignación, no el catálogo.
--
-- Idempotencia: un DELETE por codigo/codigo es naturalmente idempotente
-- (re-ejecutarlo sobre filas ya borradas no falla ni cambia nada).
--
-- Totales por rol tras esta migración: USUARIO=2, COLABORADOR=7,
-- TECNICO=13 (15 - compra:gestionar - compra:aprobar), ADMINISTRADOR=21
-- (sin cambios — conserva ambos permisos).
--
-- ┌─ NO "ARREGLAR" ESTO ─────────────────────────────────────────────────┐
-- El RBAC de este proyecto es ACUMULATIVO (USUARIO ⊂ COLABORADOR ⊂
-- TECNICO ⊂ ADMINISTRADOR) y esta migración lo ROMPE A PROPÓSITO:
-- COLABORADOR retiene compra:gestionar/compra:aprobar y TECNICO no, así
-- que un rol inferior puede aprobar compras que el superior tiene
-- prohibidas. Parece un bug. NO lo es.
--
-- El spec (§4.11) sólo definió S38/S39 (TECNICO -> 403) y no se pronunció
-- sobre COLABORADOR. El hueco se elevó al maintainer el 2026-08-13 y la
-- decisión fue explícita: COLABORADOR conserva ambos permisos, TECNICO y
-- USUARIO no. USUARIO ya no los tenía (sólo ticket:crear/ticket:comentar),
-- por eso esta migración no lo toca.
--
-- Antes de "restaurar la jerarquía" quitándole los permisos a COLABORADOR,
-- consultá al maintainer: revertiría una decisión tomada a conciencia.
-- └──────────────────────────────────────────────────────────────────────┘

DELETE FROM roles_permisos rp
USING roles r, permisos p
WHERE rp.rol_id = r.id
  AND rp.permiso_id = p.id
  AND r.codigo = 'TECNICO'
  AND p.codigo IN ('compra:gestionar', 'compra:aprobar');
