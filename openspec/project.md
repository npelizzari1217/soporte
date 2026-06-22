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
| Backend | NestJS (TypeScript) | Modular, JWT, DI, DTOs validados, patrón Repository |
| Frontend | Next.js (TS, app router) | Tailwind + Shadcn/ui o Tremor |
| Mobile (futuro) | — | El backend es 100% agnóstico al cliente |

## Convenciones de arquitectura

- `/backend` y `/frontend` **estrictamente separados** — cero acoplamiento.
- Toda la lógica de negocio vive en el backend; el front es solo consumidor.
- **Auditoría + soft delete** en TODAS las entidades: `created_at`, `updated_at`, `deleted_at`.
- **Respuesta API unificada:** `{ success: true, data: [...] }`.
- Identificadores en `snake_case` ASCII (el DER legacy traía acentos/ñ).
- **Adjuntos:** patrón `IFileStorage` (puerto), NO blobs en DB. Reusar enfoque del proyecto `mensajeria`.
- Patrón Repository para aislar la persistencia de la lógica de negocio.

## Estado de detección (proyecto nuevo)

- Sin código todavía. Estructura `/backend` y `/frontend` a crear.
- **Test runner:** ninguno aún → Strict TDD se activa al scaffoldear el backend (Jest con NestJS).
- Git inicializado (commit base `1bdfd54`).

## Origen del modelo de datos

DER legacy exportado de WinDev/WebDev (`soporte.wda`). Es un **retrato del sistema viejo, NO un esquema Postgres válido**. Ver análisis crítico en la propuesta. Decisión tomada: **diseñar los 3 flujos completos** (Ticket unificado + discriminador `TipoTicket` + tablas satélite por dominio), no migración 1:1.

## Decisiones de diseño fino PENDIENTES (fase sdd-design)

- Estrategia de IDs: `bigint` identity vs `UUIDv7`.
- Modelo de permisos: ACL-legacy (matriz `UsuariosXModulos` AccesoL/A/M/I/B) vs RBAC moderno con guards de Nest.
