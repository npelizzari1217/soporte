# Listado de reparaciones paginado en el servidor (2026-10-20)

`GET /reparaciones` devuelve hoy la lista completa, ya hidratada (ticket base, tareas, comentarios,
compras, sector), y el filtro "Bloqueo" se aplica en el navegador. Pasa a paginarse en el servidor con
el mismo contrato que `GET /tickets`, y el filtro de bloqueo pasa al servidor.

## Specs
- S1. `GET /reparaciones` acepta `pagina` (entero >= 1, default 1), `porPagina` (entero 1..100,
  default 20) y `bloqueo` (`TODAS` | `BLOQUEADAS` | `NO_BLOQUEADAS`, default `TODAS`). Valores fuera de
  rango o desconocidos → 400 (validación del DTO, igual que tickets).
- S2. Responde `{ items, total, pagina, porPagina }` (forma de `ListTicketsResponseDto`). `items` es la
  página pedida, ordenada como hoy (alta más reciente primero); `total` cuenta todas las reparaciones
  que cumplen el filtro, no solo las de la página.
- S3. Solo se hidratan (ticket base, tareas, comentarios, sectores) las reparaciones de la página. El
  bloqueo se calcula sobre todas antes de cortar, para que el filtro y el `total` sean correctos en
  cualquier página.
- S4. La exportación (`GET /reparaciones/export`) no cambia: sigue trayendo todas, sin filtros.
- S5. Frontend: el listado pide la página al servidor, muestra el paginador (componente `Pagination`
  de Tickets) y guarda `pagina` y `bloqueo` en la URL (`useUrlFilters`, como Tickets). Cambiar el
  filtro vuelve a la página 1. "Limpiar filtros" y el estado vacío filtrado siguen funcionando.
- S6. Las mutaciones que invalidan `["reparaciones"]` (subtareas, comentarios, compras) siguen
  refrescando el listado: la query key nueva conserva ese prefijo.

## Tasks
- T1 [S1-S4] backend: caso de uso paginado + DTO de query + controller + tests. Hecho: 188 tests del
  módulo (unit + e2e HTTP), tsc y lint en verde. commit: 08789721 (junto con T2, ver L3).
- T2 [S5-S6] frontend: hook paginado, filtro de bloqueo en URL, paginador + tests. Hecho: 63 tests de
  Edilicia, tsc y lint en verde; S6 cubierto por "comentar actualiza el contador de la fila sin
  recargar" (invalida el prefijo `["reparaciones"]`). commit: 08789721

## Log
- L1 (pedido original): "El listado de edilicia al igual que el de ticket tenemos que paginarlo ya que
  se generaria muchas filas inecesariamente y haria lento el proceso de entrar al modulo, paginandolo
  solo se trae lo necesario y luego se consulta paginando"
- L2 (exploración): el filtro "Bloqueo" se aplicaba en el cliente y `bloqueada` es derivado de las
  compras vinculadas (`comprasQueBloquean`), no una columna; por eso se calcula en el servidor antes
  de paginar (S3). `ExportarReparacionesUseCase` compone `ListarReparacionesUseCase.execute()` y
  necesita la lista completa: `execute()` se conserva (S4). Tamaño de página y contrato copiados de
  `GET /tickets` (default 20, máximo 100).
- L3 (decisión): T1 y T2 van en un solo commit. El cambio de contrato de `GET /reparaciones` (lista
  plana → página) rompe al front viejo; un commit solo de backend no se puede revertir ni desplegar
  por separado sin dejar el listado roto.
- L4 (evidencia): RED observado en los tres niveles antes de implementar — caso de uso
  (`executePaginado is not a function`, 5 tests), DTO (8 fallidos) y controller (4 fallidos). El test
  viejo "el filtro oculta filas en el cliente SIN volver a consultar" fijaba el comportamiento
  reemplazado y se sustituyó por tests del filtro en el servidor y en la URL. Tamaño de página del
  front: 10, como Tickets (el default del servidor queda en 20, como `GET /tickets`).
- L5 (verificación independiente): PASS en S1-S6. Bloqueante fuera de specs: el artículo de Ayuda
  `backend/ayuda/reparaciones-listado.md` quedó falso (decía que el filtro no consulta al servidor y
  no mencionaba páginas); se corrige porque una Ayuda que miente se arregla aunque la escritura esté
  suspendida. Se suman tests de regresión (huérfano en el total, filtro + página fuera de rango,
  compras consultadas solo para la página sin filtro) y se reubica un JSDoc del DTO. Suites completas
  previas: front 2355, back 9012 en verde.
