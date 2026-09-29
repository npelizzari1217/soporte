# Exploración: catálogo único de componentes (`catalogo-unico-componentes`)

> Producida por `sdd-explore` el 2026-09-29. El ejecutor no contaba con herramienta de
> escritura; el orquestador la persistió sin cambios de contenido, tras verificar por
> muestreo sus referencias principales.

## Decisiones de producto confirmadas (dueño, 2026-09-29)

1. Catálogo único: todo componente instalado en un equipo referencia un repuesto del
   catálogo del tenant (`insumo_id` NOT NULL; familia `es_repuesto`).
2. El tipo del componente se deriva de `insumo.familia`; la columna
   `tipo_componente_codigo` se elimina.
3. Se retira el catálogo MASTER `tipos_componente`, su módulo, sus endpoints y su pantalla.
4. Desaparece el alta de componente en texto libre. Número de serie y capacidad siguen
   siendo datos del componente.
5. Los 9 componentes de texto libre de producción son datos de prueba y pueden borrarse.
6. La migración aborta (fail-closed) si queda una fila no conforme; nunca borra en silencio.

## 1. Estado actual

- Tenant `ComponenteEquipo`: `backend/prisma_tenant/schema.prisma:919-956`.
  `tipoComponenteCodigo` VarChar(50) NOT NULL, referencia blanda a MASTER sin FK (:926),
  con índice (:953). `insumoId` UUID nullable, FK real a `insumos`, `onDelete: Restrict`
  (:941, :950). Migraciones relevantes: `20260810130000_add_componente_tipo_codigo`,
  `20260810140000_contract_tipo_componente`, `20260910130000_add_componente_equipo_insumo_id`.
- `AgregarComponenteUseCase`
  (`backend/src/equipos/application/use-cases/agregar-componente.use-case.ts`): dos ramas.
  La vinculada (:127-163) valida insumo activo y no borrado, familia existente,
  `esRepuesto` y `activo`, y deriva `tipoComponenteCodigo = familia.codigo` (:161). La de
  texto libre (:164-172) exige el código y lo valida contra MASTER (`estaActivo`,
  :178-183). Es la ADR-1 de `repuestos-autoridad-catalogo`: en la rama vinculada el gate
  MASTER ya no corre.
- `InstalarComponenteDesdeDepositoUseCase`
  (`instalar-componente-desde-deposito.use-case.ts:98-150`): en una transacción llama a
  `AgregarComponenteUseCase` con `insumoId` y luego a `RegistrarSalidaInsumoUseCase`
  (cantidad 1, `equipoId` como trazabilidad). Si la salida falla lanza
  `FalloSalidaDeStock` para revertir. No tiene camino de texto libre.
- `EditarComponenteUseCase` (`editar-componente.use-case.ts:70-88`): cambiar el tipo de un
  componente vinculado devuelve `ComponenteVinculadoTipoInmutableError`; en texto libre
  valida contra MASTER.
- `ObtenerEquipoUseCase` (`obtener-equipo.use-case.ts:94-130`): separa el lote por camino.
  Vinculados: `insumoRepo.findFamiliasDeInsumos` (`prisma-insumo.repository.ts:191-216`),
  que no filtra insumos inactivos ni borrados y devuelve `codigo`, `nombre`, `activo` y
  `deletedAt` de la familia. Texto libre: `tipoComponenteMasterChecker.resolver`.
- Ya unificado: alta vinculada, visualización vinculada e inmutabilidad del tipo dependen
  solo de la familia del tenant. Falta: la rama de texto libre, la columna, la lectura de
  MASTER y el catálogo MASTER.
- HTTP (`equipos.controller.ts`): `GET /equipos/tipos-componente` (:244-262),
  `POST :id/componentes` (:373), `POST :id/componentes/instalar-desde-deposito`,
  `PATCH :id/componentes/:componenteId`. Mapeo de errores 422 en :116-140.
- Frontend: `componente-create-dialog.tsx` (selector de tipo :149-163, `useEffect` que lo
  limpia :91-93, envío :95-105), `componente-instalar-dialog.tsx` (sin selector de tipo),
  `componente-edit-dialog.tsx` (:47-133, selector de tipo),
  `equipo-componentes-section.tsx:120` (`tipoNombre ?? tipoComponenteCodigo`),
  `schemas.ts:187-222` (refine que exige tipo o insumo), `types.ts:58,78,125-152`,
  `ordenar-componentes.ts`, hook `useTiposComponente` en `hooks/use-equipos.ts`.
  `equipo-detail-view.tsx:65,68` muestra ambos diálogos de alta.
- La exportación de equipos (`exportar-equipos.use-case.ts`) no incluye componentes.
  Ningún reporte ni exportación consume el tipo. Ninguna tabla externa referencia
  `componentes_equipo`.

## 2. Inventario de consumidores

### Backend: se elimina

- Módulo `backend/src/tipos-componente/` completo (unos 30 archivos entre código y specs;
  5 endpoints ROOT con `GlobalAdminGuard`). Solo lo importa `app.module.ts:7`.
- `equipos/application/use-cases/listar-tipos-componente.use-case.ts` (+spec),
  `infrastructure/persistence/prisma/tipo-componente-master.checker.ts` (+spec),
  `domain/ports/i-tipo-componente-master.checker.ts`.
- `equipos.dto.ts`: `TipoComponenteResponseDto` y `toTipoComponenteResponseDto` (:565),
  import en :52.
- `equipos.errors.ts`: `TipoComponenteCodigoRequeridoError` (:121),
  `TipoComponenteInactivoError` (:139) y `ComponenteVinculadoTipoInmutableError` (:282),
  este último si el tipo deja de ser editable.
- `equipos.controller.ts:10,75,84-85,89,105,109,192,244-262` y su spec.
- `backend/scripts/backfill-tipos-componente-codigo.js` (script de una sola vez, ya
  cumplido) y sus menciones en `backend/eslint.config.js:287,343`.
- MASTER: modelo `TipoComponente` (`prisma_master/schema.prisma:172`). Las migraciones
  `20260810120000_add_tipos_componente` y `20260810120100_seed_tipos_componente` no se
  editan: se agrega una migración nueva de DROP.

### Backend: se modifica

- `componente-equipo.entity.ts` (`insumoId` obligatorio, sin tipo), su mapper,
  `agregar-componente.use-case.ts`, `editar-componente.use-case.ts`,
  `obtener-equipo.use-case.ts` (un solo camino), `equipos.module.ts`, `equipos.dto.ts`
  (`CreateComponenteHttpDto` :267, `EditarComponenteHttpDto` :333, `ComponenteResponseDto`
  :409-426, `tipoNombre` :445-455), `prisma-equipos.integration.spec.ts`, specs de use
  cases, e2e de instalación y el spec de concurrencia.
- `prisma_master/seeds/demo-seed.ts:488-500`: siembra componentes de texto libre `RAM` y
  `DISCO`. Hay que sembrar insumos repuesto y dar el alta vía `insumoId`. También
  `demo-seed.integration.spec.ts`.
- `tenant-seeder.adapter.ts:155-167` (`FAMILIAS_INSUMO_REPUESTO`, 11 familias): no cambia;
  garantiza que un tenant nuevo tenga las familias repuesto.

### Frontend

- Se elimina: `features/tipos-componente/` (10 archivos con tests),
  `app/(dashboard)/admin/tipos-componente/{page,layout}.tsx`, la entrada de navegación en
  `shared/nav/nav-config.ts:181-185` y su test; revisar las menciones en
  `shared/auth/root-access.ts` y `root-layout-gate.ts`.
- Se modifica: `componente-create-dialog.tsx` (+test), `componente-edit-dialog.tsx`
  (+test, sin selector de tipo), `equipo-componentes-section.tsx` (+test), `schemas.ts` y
  su test, `types.ts`, `ordenar-componentes.ts` (+test), `hooks/use-equipos.ts`,
  `use-equipo-mutations` (+test).

### Documentación

- `AGENTS.md:216-220` afirma que `tipos-componente` tiene topes de longitud espejados en
  las tres capas; queda falso y se corrige en el mismo cambio.
- `backend/ayuda/equipos-listado.md:13` solo menciona "sus componentes": no se vuelve
  falso. La escritura de la Ayuda está suspendida: se anota la deuda (alta de componente
  desde el catálogo y tipo derivado) en el commit y en el PR.
- `openspec/specs/repuestos-autoridad-catalogo/spec.md`: los requerimientos de texto libre
  y del gate MASTER se retiran; el resto se reescribe.

## 3. Pregunta de diseño principal: ¿unificar "agregar vinculado" e "instalar desde depósito"?

Sin texto libre, "agregar" solo puede vincular; la única diferencia entre ambos flujos es
si se registra una SALIDA de stock. Caso real que justifica el alta sin movimiento: un
equipo comprado con sus componentes ya instalados, que nunca pasaron por el depósito.

| Opción | Descripción | A favor | En contra | Esfuerzo |
|---|---|---|---|---|
| A | Dos endpoints como hoy; `agregar` exige `insumoId` y no mueve stock | Cambio mínimo; cubre los dos flujos | Dos diálogos casi iguales; se puede registrar sin descontar por error | Bajo |
| B (recomendada) | Un alta con `insumoId` obligatorio y `descontarStock` explícito; un diálogo con la casilla "Descontar del depósito" | Un solo camino de UI; el efecto sobre el stock es visible | Cambia el cuerpo de la petición; hay que definir el valor por defecto | Medio |
| C | Un solo camino que siempre registra la SALIDA; lo ya instalado exige una ENTRADA previa | Stock siempre consistente | Obliga a inventar entradas y ensucia el historial | Bajo en código, alto en fricción |
| D | Un solo camino que nunca mueve stock | Máxima simplicidad | Pierde la atomicidad componente + salida del issue #153 | Bajo |

Recomendación: B, conservando en la primera entrega los dos endpoints HTTP y unificando
diálogo y validación. Requiere confirmación del dueño: valor por defecto de
`descontarStock`, si el alta sin descuento necesita permiso o motivo, y si el repuesto de
un componente instalado puede cambiarse por edición (se recomienda que no: baja y alta).

## 4. ¿Campo de comportamiento?

No hace falta ahora. El único ramal de comportamiento es `esRepuesto` y alcanza: el
catálogo único solo necesita saber si la familia es vinculable a un equipo. El patrón de
mercado (seguimiento por serie, lote o cantidad) queda para una fase futura. Se mantiene
la disciplina: ningún código ramifica por `familia.codigo`, que solo se usa para mostrar.

## 5. Estrategia de migración

Tenant (una migración nueva, ejecutada por `migrate-tenants.js` en cada tenant):

1. Guard fail-closed al inicio (`DO $$ ... RAISE EXCEPTION`) si existe alguna fila de
   `componentes_equipo` con `insumo_id IS NULL`, incluidas las borradas lógicamente, que no
   se midieron y también bloquean el NOT NULL.
2. `ALTER COLUMN insumo_id SET NOT NULL`; `DROP INDEX` del índice de
   `tipo_componente_codigo`; `DROP COLUMN tipo_componente_codigo`.
3. La FK `RESTRICT` se conserva. Un tenant nuevo, con la tabla vacía, pasa el guard.

La exigencia de `es_repuesto` entre tablas no es expresable como CHECK: queda como regla
de aplicación.

Cómo se eliminan las 9 filas de prueba:

1. SQL manual previo al deploy, por tenant. Simple, depende de la disciplina del operador.
2. Script de una sola vez en `backend/scripts/`, con recorrido de tenants, dry-run por
   defecto y `--apply`, que informa conteos incluidas las filas borradas lógicamente.
   **Recomendada**, con el guard de la migración como red de seguridad.
3. Que la migración las borre: descartada por la decisión 6.
4. Borrado lógico: no sirve, el NOT NULL las sigue bloqueando.

Antes de la propuesta de deploy hay que medir, en solo lectura, las filas borradas
lógicamente con `insumo_id NULL`, también en tenants inactivos.

MASTER: `DROP TABLE tipos_componente` en una migración propia, en la última unidad de
trabajo del ciclo, después de verificar el tenant. La alternativa de dropear en un release
posterior abarata el rollback pero deja código muerto.

Orden: `predeploy-dump.ps1` deja los servicios detenidos y `deploy.ps1` corre las
migraciones en la misma ventana, así que no hay código viejo contra esquema nuevo. El
código que deja de escribir la columna y la migración que la elimina deben ir en el mismo
release.

## 6. Magnitud y partición (PR encadenados, menos de 400 líneas por unidad)

Unos 118 archivos con menciones, de los que unos 55 son borrado puro. Cambio neto del
código que no se borra: entre 1.200 y 1.800 líneas contando tests.

- WU-1: dominio y casos de uso de equipos (entidad, mapper, alta en un camino, edición,
  obtención derivada de la familia, errores, DTOs, tests). Probablemente se parte en
  WU-1a y WU-1b.
- WU-2: tenant (schema, migración con guard, NOT NULL y drop; script de limpieza con
  dry-run; demo-seed; eliminación del backfill).
- WU-3: frontend de equipos (schema zod, diálogo único, edición sin tipo, sección, tipos,
  hooks, tests).
- WU-4: retiro del módulo `tipos-componente` en backend y frontend, ruta, navegación,
  `GET /equipos/tipos-componente`, checker y puerto. Mayormente borrado; se parte entre
  backend y frontend.
- WU-5: MASTER (migración DROP, modelo Prisma), reescritura del spec
  `repuestos-autoridad-catalogo` y corrección de `AGENTS.md`.

Este cambio no implementa un punto de `docs/roadmap-comercial.md`.

## 7. Riesgos

1. Filas borradas lógicamente con `insumo_id NULL`, no medidas: bloquearían el NOT NULL.
2. Tenants inactivos u otros entornos con componentes de texto libre: el guard aborta; el
   script de limpieza debe correr en cada base.
3. Migración fallida a mitad del recorrido de tenants: mitigado con dry-run y
   `predeploy-dump.ps1`.
4. El DROP de la columna, de la tabla MASTER y el borrado de las 9 filas solo se revierten
   restaurando el dump.
5. Cambio de contrato de API: `tipoComponenteCodigo` deja de aceptarse. Definir si el DTO
   lo ignora o lo rechaza.
6. Una familia deshabilitada o renombrada cambia retroactivamente el tipo mostrado de
   todos sus componentes (comportamiento ya aceptado en la ADR-2).
7. Cambiar `es_repuesto` de una familia con componentes instalados no está impedido en la
   base.
8. `AGENTS.md` queda con una afirmación falsa si no se corrige en el mismo cambio.
9. `demo-seed.ts` usa `RAM` y `DISCO` en texto libre: sin ajuste, el seed y su test fallan.
10. Todo spec nuevo que trunque `soporte_master_test` debe llamar a `usarLockMasterTest()`.

## 8. Preguntas abiertas para el dueño

1. Confirmar la opción B (alta única con `descontarStock`) y su valor por defecto.
2. ¿El repuesto de un componente instalado puede cambiarse por edición, o solo baja y alta?
3. ¿Se dropea MASTER `tipos_componente` en el mismo release o en uno posterior?
4. ¿Cómo se limpian las 9 filas de prueba? (se recomienda el script con dry-run)

## 9. Evidencia de mercado

Entrada del orquestador, relevada el 2026-09-29. Odoo (producto con seguimiento
ninguno/lote/serie y categorías jerárquicas) y ServiceNow (Product Model, categoría y
estrategia de seguimiento) usan un catálogo único, un campo de comportamiento pequeño, una
clasificación libre y unidades serializadas que referencian el ítem. GLPI y Snipe-IT
mantienen taxonomías separadas y no permiten pasar una pieza en stock a componente
instalado. Trampa conocida: que la categoría gobierne el comportamiento.

- https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html
- https://www.servicenow.com/community/sam-forum/model-categories-vs-consumable-models/m-p/1341443
- https://help.glpi-project.org/documentation/modules/assets/consumables
- https://forum.glpi-project.org/viewtopic.php?id=33914
- https://snipe-it.readme.io/docs/overview
