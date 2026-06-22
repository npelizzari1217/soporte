# Handoff de sesión — modelo-datos-tres-flujos

> Escrito porque engram no pudo persistir el resumen (sesión lanzada desde /home/usuario → ambiguous_project).
> **Al reabrir desde `/home/usuario/proyectos/soporte`, engram funciona → guardá este contenido con `mem_save` y seguí.**

## Estado actual
- **Fase 0 COMPLETA (16/16 tareas). 2 de 18 PRs hechos.**
- Rama actual: `feat/pr02-shared-infra-tenancy` (apilada sobre `feat/pr01-...`).
- Todo commiteado, `git status` limpio.

## Decisiones cerradas (NO re-discutir)
- Modo SDD: Interactivo · Artefactos: hybrid · Delivery: **PRs encadenados (18 slices)**, ask-on-risk.
- IDs: **UUIDv7** nativo. Permisos: **RBAC híbrido**. ORM: **Prisma tras puertos** (PrismaService prohibido fuera de `infrastructure/`, fitness rule ESLint activa).
- **Multitenancy: database-per-tenant** (MASTER + 1 DB por cliente, sin cliente_id en tenant). Routing por JWT vía PrismaService factory + TenantContext.
- Máquina de estados Strategy por tipo · archivos con FK (no polimórfica) · porcentaje_avance mantenido por app · enums = tablas de catálogo.
- Strict TDD (Jest, test primero, coverage ≥80%).

## Hecho
- SDD: proposal, design, spec (6 capacidades, 31 tablas, 82 scenarios), tasks (122 tareas).
- Config: CLAUDE.md, openspec/config.yaml, .atl/skill-registry.md (curado), .claude/settings.json (hooks PreToolUse design-system + SessionStart engram), skills/frontend-ui/skill.md.
- **PR-01** (commit `f480cad`): scaffolding NestJS+Jest+ESLint, shared/domain (BaseEntity, Result, IFileStorage), fitness rule. 38 tests.
- **PR-02** (commit `6c80282`): shared/infrastructure (PrismaService factory master+tenant, TenantContext, TenantTransactionRunner), SharedModule, 2 generators Prisma. 58 tests.

## Próximo paso
- **PR-03:** `prisma_master/schema.prisma` DDL completo (clientes, ciclos_vigentes, usuarios, refresh_tokens, RBAC: roles/permisos/roles_permisos/usuarios_roles) + primera migración master. Rama `feat/pr03-master-schema` apilada sobre `feat/pr02-shared-infra-tenancy`.
- Luego PR-04..18 según `tasks.md` (slices al final, sección Review Workload Forecast).

## Gotchas
- **Prisma 7** eliminó `datasourceUrl` del constructor → se usa `@prisma/adapter-pg` + `pg.Pool`.
- Warning inerte del campo `"pnpm"` en package.json → limpiar en PR-03.
- Inyectar SIEMPRE las compact rules de `.atl/skill-registry.md` en cada subagente (clean-arch, repository-pattern, nestjs-modules, error-handling, Project Conventions). sdd-apply a veces reporta `skill_resolution: none` aunque se inyecten como texto — falso negativo, las reglas igual se aplican.

## Cómo retomar en la sesión nueva
Decir: *"Continuá el SDD del cambio modelo-datos-tres-flujos. Estamos en Fase 0 completa, próximo PR-03. Leé openspec/changes/modelo-datos-tres-flujos/ y apply-progress.md."*
