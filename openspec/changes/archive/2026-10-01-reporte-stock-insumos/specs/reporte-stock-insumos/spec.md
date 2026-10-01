# Delta para reporte-stock-insumos

Fuente de las decisiones: `docs/roadmap-comercial.md`, sección "Decisiones de producto ya cerradas", viñeta "Reporte de stock" (dueño, 2026-10-01). Cada sub-viñeta es un requerimiento (R1 a R9); R10 a R15 cubren lo transversal. Mapa: R1 foto, R2 fila, R3 filtros/universo, R4 sin valorizar, R5 permiso, R6 CSV, R7 pantalla, R8 cantidades, R9 coincidencia con la ficha (implícita en la viñeta de fila).

Alcance fuera de la spec, con motivo: movimientos por período y detalle por serie quedan para otro pedido (decisión del dueño); XLSX, PDF e impresión no se piden; no hay acción de permiso nueva (el dueño eligió `INSUMOS:LECTURA`). La Ayuda está suspendida: se anota la deuda en commit y PR.

## ADDED Requirements

### Requirement: R1 Foto del stock actual con fecha y hora de generación

El reporte DEBE mostrar solo el stock actual y DEBE informar la fecha y hora de generación (hora argentina). NO DEBE ofrecer movimientos por período ni detalle por serie.

#### Scenario: La respuesta lleva el instante de generación

- GIVEN un usuario con `INSUMOS:LECTURA`
- WHEN consulta `GET /insumos/reporte-stock`
- THEN la respuesta incluye la fecha y hora de generación
- AND la pantalla la muestra de forma visible

#### Scenario: El CSV registra la generación

- GIVEN un reporte con al menos una fila
- WHEN se exporta
- THEN el contenido del CSV incluye la fecha y hora de generación en hora argentina

### Requirement: R2 Una fila por insumo con sus columnas

El reporte DEBE devolver una fila por insumo con: código, nombre, familia, tipo (consumible o repuesto), unidad de medida, stock NUEVO, stock USADO, total, punto de reposición y estado de reposición.

#### Scenario: Columnas de una fila

- GIVEN un insumo repuesto "R-1" de la familia "Memorias", unidad "u", NUEVO 3, USADO 2, mínimo 5
- WHEN se genera el reporte
- THEN hay exactamente una fila de "R-1" con tipo repuesto, NUEVO 3, USADO 2, total 5, punto de reposición 5 y estado BAJO_MINIMO

#### Scenario: Insumo sin punto de reposición

- GIVEN un insumo con `stockMinimo` nulo
- WHEN se genera el reporte
- THEN su punto de reposición queda vacío y su estado es SIN_PUNTO_DEFINIDO

### Requirement: R3 Filtros y universo de insumos

El reporte DEBE filtrar por familia, por tipo (consumible o repuesto) y por "solo bajo mínimo". DEBE incluir los insumos deshabilitados, y los de familia deshabilitada, con una columna de estado (habilitado o deshabilitado). DEBE incluir los de stock cero, con la opción "ocultar sin stock". DEBE excluir los insumos con baja lógica (`deletedAt` no nulo). Los filtros DEBEN aplicar igual a la pantalla y a la exportación.

#### Scenario: Filtro por familia y tipo

- GIVEN insumos en las familias "Memorias" (repuesto) y "Tóner" (consumible)
- WHEN se filtra por la familia "Memorias", y luego por tipo consumible
- THEN el primer resultado solo trae insumos de "Memorias" y el segundo solo consumibles

#### Scenario: Solo bajo mínimo

- GIVEN un insumo BAJO_MINIMO, uno SUFICIENTE y uno SIN_PUNTO_DEFINIDO
- WHEN se activa "solo bajo mínimo"
- THEN solo aparece el BAJO_MINIMO

#### Scenario: Deshabilitado incluido con su estado

- GIVEN un insumo deshabilitado con stock 4
- WHEN se genera el reporte sin filtros
- THEN su fila aparece con estado "deshabilitado" y stock 4

#### Scenario: Insumo en familia deshabilitada incluido

- GIVEN un insumo habilitado cuya familia está deshabilitada
- WHEN se genera el reporte
- THEN su fila aparece

#### Scenario: Ocultar sin stock

- GIVEN un insumo con total 0 y otro con total 2
- WHEN se genera el reporte sin filtro, y luego con "ocultar sin stock"
- THEN el primero incluye ambos y el segundo solo el de total 2
- AND un insumo con saldo negativo NO se oculta
- AND un insumo con NUEVO 3 y USADO -3 (total 0) NO se oculta: se oculta solo cuando NUEVO y USADO son ambos 0

#### Scenario: Baja lógica excluida, como la ficha

- GIVEN un insumo con `deletedAt` no nulo
- WHEN se genera el reporte
- THEN no aparece
- AND `ConsultarStockInsumoUseCase` lo trata como inexistente (la ficha responde no encontrado)

#### Scenario: Mismos filtros en pantalla y exportación

- GIVEN los filtros familia F, tipo repuesto, solo bajo mínimo y ocultar sin stock
- WHEN se consultan `GET /insumos/reporte-stock` y `GET /insumos/reporte-stock/export` con esos parámetros
- THEN el CSV contiene exactamente las mismas filas, en el mismo orden, que el JSON

### Requirement: R4 Sin valorizar

El reporte NO DEBE incluir costo, precio ni valor de ningún insumo, ni en la respuesta, ni en la pantalla, ni en el CSV.

#### Scenario: Ninguna columna de dinero

- GIVEN un insumo con ítems de compra con monto
- WHEN se genera el reporte y su CSV
- THEN ninguna columna ni campo expresa monto, costo, precio ni moneda

### Requirement: R5 Permiso INSUMOS:LECTURA

La consulta y la exportación DEBEN exigir `INSUMOS:LECTURA` y NO DEBEN requerir ninguna acción nueva.

#### Scenario: Sin permiso, la consulta responde 403

- GIVEN un usuario sin `INSUMOS:LECTURA`
- WHEN llama `GET /insumos/reporte-stock`
- THEN recibe 403

#### Scenario: Sin permiso, la exportación responde 403

- GIVEN un usuario sin `INSUMOS:LECTURA`
- WHEN llama `GET /insumos/reporte-stock/export`
- THEN recibe 403 y no se genera archivo

#### Scenario: Con permiso, ambas responden 200

- GIVEN un usuario con `INSUMOS:LECTURA` y sin otras acciones de insumos
- WHEN llama a las dos rutas
- THEN ambas responden 200

#### Scenario: Las rutas no las captura `:id`

- GIVEN las rutas `GET /insumos/:insumoId/...`
- WHEN se llama `GET /insumos/reporte-stock` y `.../export`
- THEN las atiende el reporte y no una ruta con parámetro

### Requirement: R6 Exportación CSV como el resto de la aplicación

La exportación DEBE ser un CSV de servidor con BOM UTF-8, separador `;`, `Content-Disposition: attachment` y nombre `reporte-stock-insumos-aaaa-mm-dd.csv` con fecha argentina. Si hay más de 5000 filas, DEBE fallar con un error explícito (422) y NO DEBE truncar.

#### Scenario: Formato del archivo

- GIVEN un reporte con filas
- WHEN se exporta
- THEN el cuerpo empieza con el BOM, separa con `;`, y el nombre lleva el día argentino vigente
- AND `Content-Type` es `text/csv; charset=utf-8`

#### Scenario: Más de 5000 filas

- GIVEN 5001 filas tras aplicar los filtros
- WHEN se exporta
- THEN responde 422 con error explícito de exportación demasiado grande
- AND no se entrega ningún CSV parcial

#### Scenario: Exactamente 5000 filas

- GIVEN 5000 filas
- WHEN se exporta
- THEN el CSV las contiene todas

#### Scenario: Botón de la pantalla

- GIVEN la pantalla del reporte
- WHEN el usuario ve las acciones
- THEN existe el botón "Exportar a Excel" que descarga el CSV con los filtros activos

### Requirement: R7 Pantalla dentro de la sección Insumos

La pantalla "Reporte de stock" DEBE vivir dentro de la sección Insumos, con los filtros reflejados en la URL, y NO DEBE ser accesible sin `INSUMOS:LECTURA`.

#### Scenario: Acceso desde Insumos

- GIVEN un usuario con `INSUMOS:LECTURA` en la sección Insumos
- WHEN navega a "Reporte de stock"
- THEN ve la tabla con los filtros y la fecha y hora de generación

#### Scenario: Filtros en la URL

- GIVEN la pantalla con familia y "solo bajo mínimo" elegidos
- WHEN se recarga la página
- THEN los filtros y el resultado se conservan

#### Scenario: Sin permiso

- GIVEN un usuario sin `INSUMOS:LECTURA`
- WHEN intenta abrir la pantalla
- THEN no la ve en el menú ni accede por URL

### Requirement: R8 Cantidades: coma decimal, enteros sin decimales, negativos visibles

Las cantidades DEBEN mostrarse con coma decimal; en unidades de medida enteras, sin decimales cuando el valor es entero; en las fraccionarias, siempre con dos decimales (la precisión del dato), sin redondear. Un saldo negativo DEBE exportarse como número y resaltarse en pantalla; NUNCA se oculta ni se excluye.

#### Scenario: Unidad entera

- GIVEN un insumo cuya unidad es entera con saldo 3
- WHEN se muestra y se exporta
- THEN aparece "3", no "3,00"

#### Scenario: Unidad fraccionaria

- GIVEN un insumo cuya unidad no es entera con saldo 2,5
- WHEN se muestra y se exporta
- THEN aparece "2,50" con coma decimal

#### Scenario: Negativo en el CSV

- GIVEN un saldo NUEVO de -3
- WHEN se exporta
- THEN la celda es `-3` sin apóstrofo ni comillas de neutralización, interpretable como número

#### Scenario: Negativo en pantalla

- GIVEN un saldo de -3
- WHEN se muestra la tabla
- THEN la celda está resaltada y la fila sigue presente

#### Scenario: Texto sigue neutralizado

- GIVEN un nombre de insumo que empieza con `=`
- WHEN se exporta
- THEN la neutralización de fórmulas sigue aplicándose a ese texto

### Requirement: R9 Coincidencia con la ficha para NINGUNO y SERIE

El saldo NUEVO, USADO y total, y el estado de reposición de cada fila DEBEN ser idénticos a los de `ConsultarStockInsumoUseCase`. Para `SERIE` el saldo DEBE salir de las unidades `EN_DEPOSITO` por condición, incluidas las pendientes de serie; `INSTALADA`, `ENTREGADA` y `DESCARTADA` NO cuentan. Para `NINGUNO`, del libro de movimientos.

#### Scenario: NINGUNO coincide con la ficha

- GIVEN un insumo NINGUNO con entradas, salidas y ajustes en NUEVO y USADO
- WHEN se compara su fila con la ficha
- THEN NUEVO, USADO, total y estado de reposición son iguales

#### Scenario: SERIE coincide con la ficha

- GIVEN un insumo SERIE con unidades EN_DEPOSITO, INSTALADA y DESCARTADA en ambas condiciones
- WHEN se compara su fila con la ficha
- THEN los saldos y el estado son iguales y solo cuentan las EN_DEPOSITO

#### Scenario: Pendientes de serie suman al saldo

- GIVEN un insumo SERIE con 2 unidades EN_DEPOSITO NUEVO, una sin número de serie
- WHEN se genera el reporte
- THEN su saldo NUEVO es 2

#### Scenario: Libro de un SERIE no se usa

- GIVEN un insumo SERIE cuyo libro difiere de sus unidades
- WHEN se genera el reporte
- THEN el saldo sigue a las unidades, como la ficha

### Requirement: R10 Estado de reposición cuenta solo NUEVO

El estado de reposición DEBE evaluarse sobre el saldo NUEVO únicamente: los usados no cubren la falta.

#### Scenario: Usados no tapan el faltante

- GIVEN mínimo 5, NUEVO 2, USADO 10
- WHEN se genera el reporte
- THEN el estado es BAJO_MINIMO y el total es 12

#### Scenario: Saldo igual al mínimo

- GIVEN mínimo 5 y NUEVO 5
- WHEN se genera el reporte
- THEN el estado es BAJO_MINIMO, igual que en la ficha (`evaluarReposicion` marca bajo mínimo con NUEVO menor o igual al mínimo)

### Requirement: R11 Lectura agregada y sin efectos

La generación DEBE ser de solo lectura y NO DEBE ejecutar consultas por insumo (sin N+1) ni modificar datos.

#### Scenario: Cantidad de consultas acotada

- GIVEN 50 insumos entre NINGUNO y SERIE
- WHEN se genera el reporte
- THEN el número de consultas a persistencia no depende de la cantidad de insumos

## Notas para verify

- La decisión de `deletedAt` se confirmó en código: la ficha trata la baja lógica como inexistente (`consultar-stock-insumo.use-case.ts`, comentario de elegibilidad) y el listado filtra `deletedAt: null`; el reporte se alinea con ambos.
- Al cerrar el ciclo, la viñeta del roadmap declara Cumplida o Desviación.
