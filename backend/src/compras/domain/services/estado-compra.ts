/**
 * Derivación del estado de cabecera de una `Compra` (spec §2) y de sus
 * banderas operativas `comprado`/`cerrado` (spec §3). Función pura, dominio
 * sin Prisma/NestJS.
 *
 * `estado`, `comprado` y `cerrado` NO son columnas: son funciones puras de
 * `(cancelada, items[...])` (spec §6, invariante 4). `CompraEntity` (PR-8)
 * expone estos tres valores como getters que delegan en `derivarEstadoCompra`
 * — así se garantiza que ningún caller re-derive la regla por su cuenta.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §2, §3. Ref design: ADR-C1.
 * Tarea: PR-4.
 */

/**
 * Estados de aprobación de un ítem, en runtime — ÚNICA fuente de verdad: el
 * tipo se deriva de acá, no al revés.
 *
 * Existe como array y no solo como unión porque el CHECK
 * `items_compra_estado_aprobacion_check` enumera los mismos valores en la DB, y
 * una unión de TypeScript se borra al compilar: sin esta constante no hay nada
 * que un test pueda comparar contra la base. La deriva entre ambas listas se
 * verifica en `prisma_tenant/compras-checks.integration.spec.ts`.
 */
export const ESTADOS_APROBACION_ITEM = ['PENDIENTE', 'APROBADO', 'RECHAZADO'] as const;

/** Estado de aprobación de un ítem — máquina de un paso, sin retorno (spec §6.2). */
export type EstadoAprobacionItem = (typeof ESTADOS_APROBACION_ITEM)[number];

/** Estado derivado de la cabecera de una compra (spec §2, tabla de verdad T1-T5 + Regla 0). */
export type EstadoCompra =
  'PENDIENTE' | 'APROBADO' | 'APROBADO_PARCIALMENTE' | 'RECHAZADO' | 'CANCELADO';

/**
 * Vista estructural de un ítem, la mínima necesaria para derivar el estado
 * de la cabecera. `comprado`/`entregado` llegan YA derivados por el ítem
 * (`cantidadComprada >= cantidad OR cerradoConFaltante`, ver `ItemCompraEntity`
 * en PR-6/PR-7): este módulo no conoce cantidades ni aritmética en
 * centésimas (ADR-C3) — esa aritmética vive en la entidad que arma esta
 * vista, no acá.
 */
export interface ItemParaDerivacion {
  readonly estadoAprobacion: EstadoAprobacionItem;
  readonly comprado: boolean;
  readonly entregado: boolean;
}

/**
 * Entrada ESTRUCTURAL para derivar el estado de una compra (ADR-C1): no es
 * la entidad `Compra`, es sólo la forma mínima que la función necesita. Se
 * asume que `items` ya excluye los ítems eliminados (soft-delete resuelto
 * antes de llegar acá).
 */
export interface CompraParaDerivacion {
  readonly cancelada: boolean;
  readonly items: readonly ItemParaDerivacion[];
}

/**
 * Resultado de la derivación: los tres valores viajan JUNTOS (ADR-C1) — así
 * se evita que `comprado`/`cerrado` se calculen sin aplicar antes la
 * Regla 0 o el guard de vacuidad, que es exactamente la trampa que este
 * diseño previene.
 */
export interface EstadoDerivadoCompra {
  readonly estado: EstadoCompra;
  readonly comprado: boolean;
  readonly cerrado: boolean;
}

/**
 * Deriva `{estado, comprado, cerrado}` de una compra a partir de su
 * cancelación y sus ítems (spec §2 + §3).
 *
 * Orden de evaluación:
 * 1. Regla 0 (prioridad absoluta): `cancelada` → `CANCELADO`, sin importar
 *    nada más — ni siquiera si todos los ítems están aprobados.
 * 2. Estado de cabecera (T1-T5) según los conteos de `estadoAprobacion`.
 * 3. `comprado`/`cerrado`: SÓLO se computan como cuantificador universal
 *    sobre el subconjunto APROBADO cuando el estado resultante es
 *    `APROBADO` o `APROBADO_PARCIALMENTE` (spec §3, tabla). Para
 *    `PENDIENTE`/`RECHAZADO`/`CANCELADO` son `false` SIEMPRE — incluso en
 *    T2 (`PENDIENTE` con `nA>=1`, mezcla de pendientes y aprobados), donde
 *    hay ítems aprobados pero la cabecera sigue `PENDIENTE`: la lectura
 *    ingenua "filtrar aprobados y aplicar `every`" IGNORANDO el estado
 *    daría un resultado sobre esos aprobados aunque la cabecera no esté
 *    aprobada — el gate por `estado` es lo que lo evita. Dentro de ese
 *    gate, con cero aprobados (`nA=0`, estructuralmente imposible en T3/T4
 *    pero verificado igual, defensivo) `every` sobre el conjunto vacío
 *    daría `true` por vacuidad matemática — la spec decide que acá también
 *    es `false` (§3, "la decisión más importante de la fase"): son señales
 *    operativas de progreso, y "Comprado: Sí" sin nada aprobado induce a
 *    error en el listado. Este es el ÚNICO lugar del módulo donde se aplica
 *    la excepción al cuantificador universal — `.every()` no debe
 *    aparecer en ningún otro punto de este archivo, y no debe usarse en
 *    ningún archivo fuera de éste para volver a derivar esta regla.
 *
 * @param compra Vista estructural de la compra a derivar.
 */
export function derivarEstadoCompra(compra: CompraParaDerivacion): EstadoDerivadoCompra {
  if (compra.cancelada) {
    return { estado: 'CANCELADO', comprado: false, cerrado: false };
  }

  const { items } = compra;
  const pendientes = items.filter((item) => item.estadoAprobacion === 'PENDIENTE').length;
  const aprobados = items.filter((item) => item.estadoAprobacion === 'APROBADO');
  const rechazados = items.filter((item) => item.estadoAprobacion === 'RECHAZADO').length;

  const estado = derivarEstadoDesdeConteos(items.length, pendientes, aprobados.length, rechazados);

  // Gate por estado (spec §3): sólo APROBADO/APROBADO_PARCIALMENTE llegan a
  // computar el cuantificador universal. PENDIENTE (incluida la mezcla T2
  // con nA>=1) y RECHAZADO son SIEMPRE false/false.
  if (estado !== 'APROBADO' && estado !== 'APROBADO_PARCIALMENTE') {
    return { estado, comprado: false, cerrado: false };
  }

  // Excepción explícita al cuantificador universal (spec §3): con cero
  // ítems aprobados, `every` sobre el conjunto vacío daría `true` por
  // vacuidad matemática. La spec confirmó que acá es `false`. Defensivo:
  // T3/T4 exigen nA>=1 por construcción, así que esta rama no debería
  // alcanzarse en la práctica, pero es el único lugar donde se verifica.
  if (aprobados.length === 0) {
    return { estado, comprado: false, cerrado: false };
  }

  const comprado = aprobados.every((item) => item.comprado);
  const cerrado = aprobados.every((item) => item.entregado);

  return { estado, comprado, cerrado };
}

/**
 * Aplica la tabla de verdad T1-T5 (spec §2) a partir de los conteos de
 * ítems por `estadoAprobacion`. NO se llama directamente desde fuera de
 * este módulo: `derivarEstadoCompra` es el único punto de entrada público
 * porque `comprado`/`cerrado` dependen del estado que esta función calcula.
 *
 * @param n  Total de ítems no eliminados.
 * @param nP Cantidad de ítems `PENDIENTE`.
 * @param nA Cantidad de ítems `APROBADO`.
 * @param nR Cantidad de ítems `RECHAZADO`.
 */
function derivarEstadoDesdeConteos(n: number, nP: number, nA: number, nR: number): EstadoCompra {
  if (n === 0 || nP >= 1) {
    return 'PENDIENTE'; // T1 ∪ T2
  }
  if (nR === 0 && nA === n) {
    return 'APROBADO'; // T3: nP=0, nR=0, nA=n>=1
  }
  if (nA >= 1 && nR >= 1) {
    return 'APROBADO_PARCIALMENTE'; // T4: nP=0, nA>=1, nR>=1
  }
  return 'RECHAZADO'; // T5: nP=0, nA=0, nR=n>=1
}

/**
 * Convierte una cantidad/monto a centésimas ENTERAS y redondeadas —
 * ADR-C3. Toda comparación y suma de cantidades/montos del módulo de
 * compras pasa por acá, sin excepción.
 *
 * Por qué: JS representa fracciones decimales en binario IEEE-754, así que
 * operaciones tan simples como `0.7 - 0.6` dan `0.09999999999999998` en vez
 * de `0.1` (undershoot) — comparar ese resultado con `>=` contra `0.1` en
 * float directo da un falso negativo. `0.1 + 0.2` da el error simétrico
 * (`0.30000000000000004`, overshoot) que en una comparación `>=` puede
 * pasar desapercibido por casualidad, pero NO es confiable: la única forma
 * de comparar y sumar cantidades/montos sin depender de en qué dirección
 * redondeó el float es hacerlo en una escala entera. `Math.round` (no
 * `Math.floor`/truncado) evita que el propio redondeo a centésimas
 * introduzca un nuevo sesgo sistemático hacia abajo.
 *
 * @param n Valor en unidades "normales" (ej. `cantidad=0.3`, `monto=150000.5`).
 */
export function enCentesimas(n: number): number {
  return Math.round(n * 100);
}

/**
 * Vista mínima de un ítem para derivar si está "comprado" (ADR-C3, §3).
 *
 * `cantidadRecibida` — WU-20 (`compras-tres-etapas-y-sectores`, R1/R3):
 * renombrado desde `cantidadComprada` (mismo campo físico tras el `RENAME
 * COLUMN` de M2, el criterio de "comprado" no cambió — sigue siendo lo que
 * LLEGÓ, ahora nombrado sin ambigüedad frente a la etapa de ORDEN nueva).
 */
export interface ItemParaComprado {
  readonly cantidad: number;
  readonly cantidadRecibida: number;
  readonly cerradoConFaltante: boolean;
}

/**
 * `true` si `cantidadRecibida` alcanza o supera `cantidad`, o si el ítem fue
 * cerrado con faltante — la cláusula OR deliberada de S22: el cierre con
 * faltante marca `comprado=true` PESE a no haber alcanzado la cantidad
 * pedida, porque a partir de ese momento no hay más compra posible sobre
 * ese ítem (S25, terminal). Comparación en centésimas (ADR-C3).
 */
export function itemComprado(item: ItemParaComprado): boolean {
  return (
    enCentesimas(item.cantidadRecibida) >= enCentesimas(item.cantidad) || item.cerradoConFaltante
  );
}

/** Vista mínima de un ítem para derivar si está "entregado" (ADR-C3, §3). */
export interface ItemParaEntregado {
  readonly cantidad: number;
  readonly cantidadEntregada: number;
  readonly cerradoConFaltante: boolean;
}

/**
 * `true` si `cantidadEntregada` alcanza o supera `cantidad`, o si el ítem
 * fue cerrado con faltante — misma cláusula OR que `itemComprado` (S22).
 * Comparación en centésimas (ADR-C3).
 */
export function itemEntregado(item: ItemParaEntregado): boolean {
  return (
    enCentesimas(item.cantidadEntregada) >= enCentesimas(item.cantidad) || item.cerradoConFaltante
  );
}

/**
 * Subtotal de un ítem (`monto × cantidad`) en CENTÉSIMAS enteras — WU-20
 * (`compras-tres-etapas-y-sectores` R6, ADR-T12). ÚNICA implementación de
 * esta fórmula: `ItemCompraEntity.totalItem` y
 * `CompraEntity.totalesPorMoneda` la comparten, en vez de cada uno tener su
 * propia multiplicación en centésimas (que es exactamente como una
 * divergía silenciosa se cuela — S57 lo exige por construcción, no por
 * coincidencia).
 *
 * Misma aritmética que ya usaba `totalesPorMoneda` antes de esta extracción
 * (`compra.entity.ts`, ADR-C3): `monto`/`cantidad` tienen precisión
 * `Decimal(x,2)`, así que `enCentesimas(monto) * enCentesimas(cantidad)` es
 * siempre una multiplicación de enteros — dividir por 100 y redondear da el
 * subtotal en centésimas SIN pasar por una multiplicación de decimales en
 * float.
 *
 * @param monto Precio unitario del ítem (congelado tras decisión, ADR-C3).
 * @param cantidad Cantidad solicitada del ítem (congelada tras decisión).
 * @returns Subtotal en CENTÉSIMAS enteras — el caller divide por 100 para volver a unidades normales.
 */
export function subtotalItemEnCentesimas(monto: number, cantidad: number): number {
  return Math.round((enCentesimas(monto) * enCentesimas(cantidad)) / 100);
}
