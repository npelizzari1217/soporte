# Proyecto: Soporte — Contexto SDD

> Artefacto de `sdd-init`. Fuente de verdad del contexto del proyecto para todas las fases SDD.

## Identidad

- **Nombre:** Soporte
- **Tipo:** Sistema de Gestión de Tickets (Soporte/IT, Compras, Reparaciones Edilicias)
- **Ruta:** `/home/usuario/proyectos/soporte`
- **Metodología:** SDD multi-agente (Gentle-IA), modo Interactivo, artefactos hybrid, delivery ask-on-risk

## Stack tecnológico (obligatorio)

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Base de datos | PostgreSQL | Relacional, auditoría, concurrencia |
| Backend | NestJS (TypeScript) | Modular, JWT, DI, DTOs validados, patrón Repository. Tests: Vitest |
| Frontend | Next.js (TS, app router) | Tailwind + Shadcn/ui o Tremor. Tests: Vitest |
| Mobile (futuro) | — | El backend es 100% agnóstico al cliente |

## Convenciones de arquitectura

- `/backend` y `/frontend` **estrictamente separados** — cero acoplamiento.
- Toda la lógica de negocio vive en el backend; el front es solo consumidor.
- **Auditoría + soft delete** en TODAS las entidades: `created_at`, `updated_at`, `deleted_at`.
- **Respuesta API unificada:** `{ success: true, data: [...] }`.
- Identificadores en `snake_case` ASCII (el DER legacy traía acentos/ñ).
- **Adjuntos:** patrón `IFileStorage` (puerto), NO blobs en DB. Reusar enfoque del proyecto `mensajeria`.
- Patrón Repository para aislar la persistencia de la lógica de negocio.

## Estado actual del proyecto

- **Backend y frontend scaffoldeados y en marcha.** Módulos de negocio implementados: `tickets`, `compras`, `reparaciones`, `equipos`, `auth`, `clientes`, `reportes` (Screaming Architecture).
- **Test runner:** **Vitest** en backend y frontend, Strict TDD activo (RED→GREEN). Comando: `pnpm test` (= `vitest run`).
- **Modelo de datos vivo:** 31 entidades Prisma (8 master + 23 tenant). Fuente de verdad: `backend/prisma_master/schema.prisma` y `backend/prisma_tenant/schema.prisma`; DER en `docs/der.md`.
- **Changes SDD:** 0 activos, 11 archivados en `openspec/changes/archive/` (proyecto entre unidades de trabajo).
- Git inicializado (commit base `1bdfd54`); remoto en GitHub.

## Origen del modelo de datos

DER legacy exportado de WinDev/WebDev (`soporte.wda`). Es un **retrato del sistema viejo, NO un esquema Postgres válido**. Ver análisis crítico en la propuesta. Decisión tomada: **diseñar los 3 flujos completos** (Ticket unificado + discriminador `TipoTicket` + tablas satélite por dominio), no migración 1:1.

## Decisiones de diseño fino (resueltas)

- **Estrategia de IDs:** `UUIDv7` (anti-IDOR en API pública/mobile, ordenable temporalmente). ✔ decidido.
- **Modelo de permisos:** RBAC híbrido moderno (roles + permisos granulares `recurso:accion`) con guards de Nest encadenados; se descartó la ACL-legacy (`UsuariosXModulos` L/A/M/I/B). ✔ decidido.
