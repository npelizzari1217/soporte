# Ciclo Archivado: Stock Usado y Retiro de Componentes con Dos Desenlaces

**Cambio**: `stock-usado-componentes`  
**Fecha de cierre**: 2026-09-30  
**Rama del tracker**: `feat/stock-usado-componentes` (28 commits desde main, incluidos 5 de planificación + 23 de apply)  
**Revisión final**: 47ee1189 (WU-14, tests de cobertura PARTIAL cerrados)

## Resumen Ejecutivo

El ciclo SDD ha finalizado la adición de condición NUEVO/USADO al stock de insumos y el retiro de componentes con dos desenlaces (devolver al stock como USADO o descartar con motivo). Es la segunda de dos entregas encadenadas: se apoya en `componentes-catalogo-unico` (archivado el 2026-09-29), que dejó el retiro como borrado lógico provisional. El tracker está listo para integrar a `main` e ir a producción tras la ventana de deploy acordada (predeploy-dump + deploy.ps1 en el VPS; dos migraciones tenant aditivas, 20260930120000 y 20260930130000, con rollback por detector de solo lectura en el runbook).

**Veredicto final**: PASS WITH WARNINGS (0 CRITICAL, 4 WARNING desde verify, todos resueltos o anotados en apply y cierre).

## Artefactos del Ciclo

| Artefacto | Ubicación | Estado |
|-----------|-----------|--------|
| proposal.md | archivado | ✅ Completado |
| specs/ (2 dominios nuevos/modificados) | archivado | ✅ Completado y sincronizado |
| design.md | archivado | ✅ Completado (9 ADR, 8 ADR completadas) |
| tasks.md | archivado | ✅ Completado (91 casillas de WU-1 a WU-14) |
| apply-progress.md | archivado | ✅ Completado (30 commits ~3.200 líneas) |
| verify-report.md | archivado | ✅ PASS WITH WARNINGS (0 CRITICAL, 4 WARNING, 4 SUGGESTION) |

## Especificaciones Sincronizadas a Fuente de Verdad

### 1. Stock Insumo Condicion (Nueva Capacidad)

**Ubicación**: `openspec/specs/stock-insumo-condicion/spec.md`  
**Acción**: Creado (full spec, no delta)  
**Requerimientos**: 8  
**Escenarios**: 22  

Especificación nueva que define que todo movimiento de stock lleva una condición (NUEVO/USADO), que el saldo se lleva por condición con una única fórmula, y que la reposición se evalúa solo sobre NUEVO. No existía spec anterior de stock; esta cubre únicamente lo que la condición agrega o cambia.

### 2. Componentes Catálogo Único (Modificación de Capacidad Existente)

**Ubicación**: `openspec/specs/componentes-catalogo-unico/spec.md`  
**Acción**: Modificado (merge de delta spec con composición nativa)  
**Requerimientos delta**: 1 MODIFIED + 1 REMOVED + 4 ADDED = 6 cambios  
**Requerimientos finales en merged spec**: 11 (antes 8; -1 REMOVED + 4 ADDED)  
**Escenarios finales**: 31 (antes 21; delta añade 10 + 1 REMOVED vacío = 10 nuevos escenarios)  

Cambios aplicados mediante el comando nativo `gentle-ai sdd-archive-compose`:

**MODIFIED** (1 requerimiento, escenarios ampliados):
- "Un solo flujo de alta con descuento de stock opcional" — ampliado con condición NUEVO/USADO seleccionable, default NUEVO, selector fijo si un solo saldo es mayor que cero.

**REMOVED** (1 requerimiento, junto con su escenario):
- "El retiro sigue siendo el borrado lógico sin movimiento de stock" — reemplazado por los cuatro ADDED.

**ADDED** (4 requerimientos nuevos, 10 escenarios):
- "El retiro de un componente tiene dos desenlaces que elige el usuario" — con STOCK_USADO (ENTRADA USADO 1 unidad) o DESCARTE (motivo obligatorio, máx 500 chars). Permiso EQUIPOS:BORRADO, sin permiso nuevo. Consecuencia asumida: quien tiene BORRADO suma stock USADO sin permisos de insumos. Retiro PUEDE admitir insumo deshabilitado y familia no vigente si el destino es STOCK_USADO (decisión del dueño, 2026-09-30).
- "Un componente que vino con el equipo puede devolverse al stock con motivo obligatorio" — marca derivada "sin salida registrada del depósito" cuando instalacion_movimiento_id es NULL.
- "Reactivar un componente depende del destino de su retiro" — bloqueado tras STOCK_USADO, permitido tras DESCARTE y retiros legados.
- "El componente conserva el registro de su retiro" — columnas en componentes_equipo (destino, motivo, movimiento de devolución, usuario); sin tabla nueva ni tipo de movimiento de dirección cero.

**Verificación de composición**: Diferencial aplicado sin errores; output contrastado contra snapshot de pre-move con diff -r (vacío, solo el archivo archive-report.md es aditivo).

## Síntesis de Implementación

**15 Work Units + 12b + WU-14** (29 commits de apply + 5 de planificación):

1. WU-1: Migración, schema, catálogo, entidad movimiento, mapper, constraints
2. WU-2: Saldo por condición, puerto, repo, calcularSaldos, fakes
3. WU-3a/3b: Aplicación (entrada, salida, ajuste, devolución), ADR-6 (USADO solo repuestos), recepción NUEVO
4. WU-4: Borde HTTP (DTOs, controller, respuestas, e2e)
5. WU-5: Migración componentes, schema, entidad, mapper, constraints, reactivar
6. WU-6: Instalación con condición y vínculo a SALIDA
7. WU-7: Retiro, aplicación (RetirarComponenteUseCase, repo retirar, integración atómica y concurrencia)
8. WU-8a/8b: Retiro borde (POST .../baja, borrado DELETE, corrección de Ayuda permisos-y-roles.md)
9. WU-9: Frontend insumos (tipos, ficha con dos saldos, columna condición)
10. WU-10: Frontend insumos (selector de condición en diálogos)
11. WU-11: Frontend equipos (selector en el alta)
12. WU-12/12b: Frontend equipos (diálogo de retiro, rótulos, reactivar condicionado)
13. WU-13: Runbook (rollback del tracker, detector, verificación post-deploy)
14. WU-14: Cierre de verify (escenarios PARTIAL: retiro con insumo deshabilitado/familia no vigente, migración sobre movimientos previos)

**Tamaño y riesgo**: ~3.200 líneas de código y specs (+8019/-420); 400-line budget risk: HIGH. Feature-branch-chain con 16 PR hijo en cadena (WU-1 a WU-13; particiones en 3a/3b, 8a/8b, 12b solo si necesario).

**Veredicto de apply**: Todo en verde (lint cero errores, typecheck cero errores, backend 5815/5815 tests, frontend todos en verde). 18 mutaciones adversariales quedaron muertas. Las decisiones del dueño (A/B/C; a1 b1 c3 d1 e3 f2 g1 h2; O1, O2, D1, D2) están implementadas con test que las mata cada una.

## Verificación y Cierre

| Verificación | Resultado | Detalle |
|---|---|---|
| **Composición de specs** | ✅ Exitosa | Nativo `sdd-archive-compose`: 1 REMOVED + 1 MODIFIED aplicados; 4 ADDED integrados; merged spec = 11 requerimientos |
| **Movimiento a archive** | ✅ Exitosa | `git mv openspec/changes/{change} → openspec/changes/archive/{date}-{change}`. Snapshot + diff -r = vacío |
| **Task Completion Gate** | ✅ Pasa | 91 casillas completadas, 0 unchecked |
| **Verify verdict** | ⚠️ PASS WITH WARNINGS | 0 CRITICAL; 4 WARNING (1 proc., 1 Ayuda, 2 cobertura PARTIAL); todas anotadas y resueltas o documentadas |

### Warnings de Verify (Resueltos)

**W1** (Proceso): WU-5 parte 1 (commit bc938dd) supera 400 líneas (444) sin `size:exception` en el cuerpo. Resto de oversized commits sí lo declaran. Sin impacto en código.

**W2** (Ayuda resuelta): `backend/ayuda/permisos-y-roles.md:150-154` tenía frase inexacta ("cualquier otro movimiento sí necesita ALTAS en Insumos"). Corregida en WU-8a: "…cualquier otra entrada o salida sí necesita ALTAS; el ajuste tiene su propia casilla". Una línea, verdadera ahora.

**W3/W4** (Cobertura PARTIAL, resuelta en WU-14):
- Retiro de repuesto deshabilitado / familia no vigente: prueba unitaria de `registrarDevolucionDeComponente` con fakes; WU-14 agrega integración completa del retiro.
- Migración sobre movimientos previos: no hay test que aplique 20260930120000 sobre filas previas. WU-14 agrega.

## Estado Final del Cambio

**Bloqueos**: Ninguno. El tracker está listo para integrar.

**Pendientes operativos** (fuera del ciclo SDD, a cargo del dueño):
1. Predeploy-dump (verificado antes de ventana)
2. Deploy.ps1 (pull `main`, builds, `migrate:tenants`, arranque)
3. Verificación post-deploy (detector de retiros_usado y movimientos_usado en 0 por tenant)
4. Rollback si es necesario (git reset --hard o restaurar dump, según detector)

**Deuda registrada**: Ayuda de artículos nuevos queda en pausa (decisión del dueño, 2026-09-07). Anotada en commits WU-9, WU-10, WU-11, WU-12, WU-12b. Se redacta cuando la superficie esté estabilizada, no entrega a entrega.

**Conocidos out of scope**: Baja de equipo completo con devolución de partes; seguimiento por serie; reporte/exportación de stock; mínimo de reposición por condición; frontend campos `baja*` opcionales (inocuo); selector sin reset al cambiar repuesto (sugerencia).

## Artefactos Archivados

```
openspec/changes/archive/2026-09-30-stock-usado-componentes/
├── proposal.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
├── state.yaml
└── specs/
    ├── stock-insumo-condicion/spec.md (delta → main spec sincronizado)
    └── componentes-catalogo-unico/spec.md (delta aplicado mediante composición nativa)
```

Todas las líneas del contenido de cambio se han copiado desde la rama `feat/stock-usado-componentes` mediante `git mv`, con verificación de snapshot (diff -r vacío).

## Línea de Tiempo

- **2026-09-29**: Archivado `catalogo-unico-componentes`; inicio de `stock-usado-componentes`
- **2026-09-30 00:00** — **2026-09-30 23:59**: Aplicación de 14 WU + 12b; 28 commits (5 plan + 23 apply)
- **2026-09-30 23:59**: Verificación completa (54/54 escenarios verificados; 18 mutaciones adversariales muertas)
- **2026-09-30 23:59**: Cierre y archivo; listo para deploy

---

**Ciclo completado**: ✅ La entrega de stock con condición NUEVO/USADO y retiro con dos desenlaces ha finalizado su fase de especificación, diseño, implementación y verificación. Queda pendiente el deploy operativo en el VPS (predeploy-dump + deploy.ps1).
