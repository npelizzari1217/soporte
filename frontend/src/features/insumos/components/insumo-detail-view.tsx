"use client";

/**
 * InsumoDetailView — CONTAINER montado por `/insumos/[id]`: la ficha de un
 * insumo del catálogo con su existencia actual.
 *
 * **El insumo se resuelve del CATÁLOGO, no de un endpoint propio.** No existe
 * `GET /insumos/:id` —`InsumosController` solo expone el listado, el alta y los
 * dos `PATCH`—, así que la ficha busca el id dentro de lo que `useInsumos()` ya
 * trajo y cacheó. Eso arrastra a la pantalla entera la trampa de la clase
 * "select con valor fuera de catálogo" del `AGENTS.md`: "este insumo no existe"
 * SOLO se puede concluir cuando la lista YA resolvió. Por eso el `switch` va
 * sobre `resolverDeCatalogo`, que distingue los cuatro desenlaces —cargando,
 * catálogo caído, id ausente y encontrado— en vez de un `find(...)` cuyo
 * `undefined` significaría las cuatro cosas a la vez y mostraría "no se
 * encontró" mientras la red todavía está en vuelo.
 *
 * **El insumo y su existencia son DOS queries independientes**, y pueden
 * fallar por separado: el catálogo es lectura abierta y el stock exige
 * `INSUMOS:LECTURA`. Un stock caído NO tumba la ficha —el usuario tiene que
 * poder ver de qué insumo se trata igual—: el fallo queda acotado al bloque de
 * existencia, que avisa y ofrece reintentar. Al revés no aplica: sin el insumo
 * no hay ficha que mostrar.
 *
 * **El `estadoReposicion` llega RESUELTO del backend y acá SOLO se traduce.**
 * La regla de cuándo hay que reponer es de negocio (`evaluarReposicion`, que
 * compara en centésimas enteras con `<=` para que el punto en cero avise), y
 * escribir un `stock <= stockMinimo` en esta pantalla sería una segunda
 * definición de "bajo el mínimo" que puede discrepar de la del servidor sin que
 * nadie se entere.
 *
 * El gate de la vista es `INSUMOS:LECTURA` y acá SÍ espeja al servidor, a
 * diferencia del listado: el endpoint de stock declara
 * `@RequiereAcciones('INSUMOS:LECTURA')`. El gate del MÓDULO lo aplica
 * `layout.tsx` aguas arriba. La autoridad sigue siendo el backend (ADR-4).
 */
import { useState } from "react";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { useUsuariosTenant } from "@/features/usuarios/hooks/use-usuarios-tenant";
import { useInsumos } from "../hooks/use-insumos";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { useStockInsumo } from "../hooks/use-stock-insumo";
import { useMovimientosInsumo } from "../hooks/use-movimientos-insumo";
import { nombreDeCatalogo } from "../lib/nombre-de-catalogo";
import { nombreDeUsuario } from "../lib/nombre-de-usuario";
import { resolverDeCatalogo } from "../lib/resolucion-de-catalogo";
import { MovimientoEntradaDialog } from "./movimiento-entrada-dialog";
import { MovimientoSalidaDialog } from "./movimiento-salida-dialog";
import type { EstadoReposicionInsumo, Insumo, MovimientoInsumo, TipoMovimientoInsumo } from "../types";

/** Placeholder de la celda sin valor, el mismo que usan los listados. */
const SIN_VALOR = "—";

/**
 * Cómo se lee cada estado de reposición en pantalla. Es traducción, no
 * decisión: el estado ya viene resuelto del backend.
 *
 * El `Record<EstadoReposicionInsumo, …>` es el mecanismo, no una prolijidad: si
 * mañana entra un cuarto estado en `ESTADOS_REPOSICION_INSUMO`, esto rompe el
 * typecheck en vez de renderizar una etiqueta vacía en silencio.
 */
const ETIQUETA_REPOSICION: Record<EstadoReposicionInsumo, string> = {
  SIN_PUNTO_DEFINIDO: "Sin punto de reposición definido",
  SUFICIENTE: "Existencia suficiente",
  BAJO_MINIMO: "Hay que reponer",
};

/** Variante del badge por estado, con la misma cobertura exhaustiva. */
const VARIANTE_REPOSICION: Record<EstadoReposicionInsumo, "outline" | "success" | "destructive"> = {
  SIN_PUNTO_DEFINIDO: "outline",
  SUFICIENTE: "success",
  BAJO_MINIMO: "destructive",
};

/**
 * Cómo se lee cada tipo de asiento en pantalla. Mismo mecanismo que
 * `ETIQUETA_REPOSICION`: el `Record` sobre la unión derivada de
 * `TIPOS_MOVIMIENTO_INSUMO` hace que un quinto tipo rompa el typecheck acá en
 * vez de renderizar una celda vacía en silencio.
 */
const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimientoInsumo, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE_POSITIVO: "Ajuste positivo",
  AJUSTE_NEGATIVO: "Ajuste negativo",
};

/**
 * El signo con el que se muestra la cantidad, derivado del TIPO.
 *
 * `cantidad` siempre llega positiva —el backend lo garantiza con un CHECK—, así
 * que un menos deducido del número sería imposible de producir y, peor, un
 * signo deducido de cualquier otra cosa que no sea el tipo sería una segunda
 * definición de "salida" en el frontend. Es el espejo exacto de
 * `DIRECCION_POR_TIPO_MOVIMIENTO` del dominio, y por eso lo derivan las mismas
 * cuatro claves.
 */
const SIGNO_MOVIMIENTO: Record<TipoMovimientoInsumo, "+" | "-"> = {
  ENTRADA: "+",
  SALIDA: "-",
  AJUSTE_POSITIVO: "+",
  AJUSTE_NEGATIVO: "-",
};

/**
 * De dónde salió el asiento. Es la razón por la que existe esta bitácora: sin
 * esta columna, la entrada que genera la recepción de una compra —que viaja
 * deliberadamente sin `motivo`— se ve idéntica a una carga manual sin motivo.
 *
 * NO se navega a la compra ni se resuelve su número: no hay endpoint que
 * traduzca un `itemCompraId` a una compra, y mostrar el identificador crudo
 * sería el mismo defecto que esta entrega vino a corregir en las otras
 * columnas.
 */
const ETIQUETA_ORIGEN_RECEPCION = "Recepción de compra";
const ETIQUETA_ORIGEN_MANUAL = "Carga manual";

/** Tamaño de página de la bitácora, el mismo que usa el listado de compras. */
const MOVIMIENTOS_POR_PAGINA = 10;

/** Un dato de la ficha: rótulo arriba, valor abajo. Mismo molde que `CompraDetailView`. */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

export interface InsumoDetailViewProps {
  insumoId: string;
}

/**
 * @param insumoId Insumo cuya ficha se muestra, tomado del segmento de la ruta.
 * @returns La ficha del insumo con su existencia, gateada por `INSUMOS:LECTURA`.
 */
export function InsumoDetailView({ insumoId }: InsumoDetailViewProps) {
  /**
   * La página de la bitácora vive en ESTADO LOCAL y no en la URL, a diferencia
   * de los filtros de los listados (ADR-2).
   *
   * El motivo es qué identifica cada URL. `/insumos/[id]` identifica un
   * INSUMO: el `[id]` ya está en la ruta y es lo único que alguien comparte,
   * marca o vuelve a abrir. La página de la bitácora es una posición dentro de
   * un bloque secundario de esa pantalla, no una vista distinta del insumo —
   * nadie deep-linkea "la página 4 de los movimientos del tóner", y un
   * `?pagina=3` viejo pegado en la URL de la ficha dejaría el bloque vacío con
   * la misma trampa que ya mordió en los listados, pero sin el `FilterBar` ni
   * el "Limpiar filtros" con los que un listado se recupera.
   *
   * El argumento del otro lado es real y se descarta a conciencia: en la URL,
   * el botón "atrás" desharía el paso de página. Se pierde eso a cambio de que
   * la URL de la ficha siga significando una sola cosa, y de no tener que
   * decidir de quién es el `?pagina=` el día que la ficha tenga un segundo
   * bloque paginado.
   */
  const [paginaBitacora, setPaginaBitacora] = useState(1);

  const insumosQuery = useInsumos();
  const familiasQuery = useFamiliasInsumo();
  const unidadesQuery = useUnidadesMedida();
  const stockQuery = useStockInsumo(insumoId);
  const movimientosQuery = useMovimientosInsumo(insumoId, {
    pagina: paginaBitacora,
    porPagina: MOVIMIENTOS_POR_PAGINA,
  });
  /**
   * Los nombres de quienes firmaron los asientos. Es un dato ACCESORIO: el
   * endpoint exige `TICKETS:ASIGNAR`, `TICKETS:VER_TODOS` o ser
   * ADMINISTRADOR/ROOT, así que un técnico con solo `INSUMOS:LECTURA` recibe
   * 403 acá. Ese 403 se queda en la columna —`nombreDeUsuario` lo traduce a una
   * etiqueta— y NO se conecta a `notifyError` ni a un reintento: la bitácora se
   * lee igual sin los nombres, y un toast de error por una consulta que el
   * usuario no pidió sería ruido sobre una pantalla que funciona.
   */
  const usuariosQuery = useUsuariosTenant();

  // Los tres catálogos se pasan CRUDOS (`data` sin `?? []`): el `undefined` es
  // el dato que distingue "todavía no resolvió" de "resolvió vacío".
  const resolucion = resolverDeCatalogo(insumoId, {
    entradas: insumosQuery.data,
    cargando: insumosQuery.isLoading,
  });
  const familias = { entradas: familiasQuery.data, cargando: familiasQuery.isLoading };
  const unidades = { entradas: unidadesQuery.data, cargando: unidadesQuery.isLoading };

  function contenido() {
    switch (resolucion.estado) {
      case "CARGANDO":
        return <DetailSkeleton />;
      case "NO_DISPONIBLE":
        // El catálogo no llegó: es un problema de la pantalla. NO se dice nada
        // sobre si el insumo existe, porque no hay con qué saberlo.
        return (
          <ErrorState
            message="No se pudo cargar el insumo."
            onRetry={() => insumosQuery.refetch().catch(notifyError)}
          />
        );
      case "FUERA_DE_CATALOGO":
        // El catálogo resolvió y no lo trae: recién acá la ausencia prueba
        // algo. Es el 404 de pantalla, y no lleva "Reintentar" porque
        // reintentar no lo va a hacer aparecer.
        return <ErrorState message="No se encontró el insumo en el catálogo." />;
      case "ENCONTRADA":
        return ficha(resolucion.entrada);
    }
  }

  function ficha(insumo: Insumo) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={insumo.nombre} description={insumo.codigo} />

        <section className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
          <Campo rotulo="Familia">{nombreDeCatalogo(insumo.familiaId, familias)}</Campo>
          <Campo rotulo="Unidad de medida">{nombreDeCatalogo(insumo.unidadMedidaId, unidades)}</Campo>
          <Campo rotulo="Estado">
            {/* Mismo vocabulario que el listado: acá `activo: false` es
                DESHABILITADO, no "baja" — el insumo con baja lógica ni siquiera
                llega en `GET /insumos`, y por eso su ficha muestra el 404 de
                arriba y no este badge. */}
            {insumo.activo ? (
              <Badge variant="success">Habilitado</Badge>
            ) : (
              <Badge variant="outline">Deshabilitado</Badge>
            )}
          </Campo>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-foreground">Existencia</h2>
            {/* Gate `INSUMOS:ALTAS`, espejo exacto de
                `MovimientosInsumoController.registrarEntrada`/`registrarSalida`
                — comparten esa celda, y la lectura sola (`INSUMOS:LECTURA`,
                gate de la vista) no alcanza para registrar un movimiento.
                Cada diálogo aplica su PROPIA precondición de estado, y son
                DISTINTAS: la entrada exige el insumo habilitado
                (`insumo.activo`, 422 `InsumoError`); la salida exige stock
                (`stockQuery.data?.stock`, 422 `StockInsuficienteError`) — la
                entrada NO mira el stock ni la salida mira `activo`. Los dos
                triggers reflejan su precondición deshabilitándose con un
                `title` que explica por qué, mismo mecanismo `disabled` +
                `title` que `ItemEliminarControl`/`ItemDecisionActions`
                (`features/compras`). */}
            <Can permiso="INSUMOS:ALTAS">
              <div className="flex gap-2">
                <MovimientoEntradaDialog insumoId={insumo.id} activo={insumo.activo} />
                <MovimientoSalidaDialog insumoId={insumo.id} stockDisponible={stockQuery.data?.stock} />
              </div>
            </Can>
          </div>
          {existencia()}
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Movimientos</h2>
          {bitacora()}
        </section>
      </div>
    );
  }

  function existencia() {
    if (stockQuery.isLoading) {
      return (
        <div role="status" aria-busy="true" aria-label="Cargando existencia" className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
      );
    }

    // Acotado al bloque a propósito: el stock es una query aparte del catálogo,
    // y su fallo no puede esconder de qué insumo se trata.
    if (stockQuery.isError || !stockQuery.data) {
      return (
        <ErrorState
          message="No se pudo cargar la existencia del insumo."
          onRetry={() => stockQuery.refetch().catch(notifyError)}
        />
      );
    }

    const stock = stockQuery.data;

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo rotulo="Stock actual">{formatearNumeroEsAr(stock.stock)}</Campo>
        <Campo rotulo="Stock mínimo">
          {/* Acá el guion SÍ es una afirmación sobre el dato, y es correcta: el
              `null` significa "sin punto de reposición definido", no "no se
              pudo cargar" — el error de red ya se manejó arriba. */}
          {stock.stockMinimo === null ? SIN_VALOR : formatearNumeroEsAr(stock.stockMinimo)}
        </Campo>
        <Campo rotulo="Reposición">
          <Badge variant={VARIANTE_REPOSICION[stock.estadoReposicion]}>
            {ETIQUETA_REPOSICION[stock.estadoReposicion]}
          </Badge>
        </Campo>
      </div>
    );
  }

  /**
   * La bitácora del insumo: qué pasó con su existencia, del asiento más
   * reciente al más viejo. Es solo LECTURA — registrar un movimiento es otra
   * pantalla y otro permiso.
   *
   * El orden lo resuelve el servidor y la paginación es server-side: acá NO se
   * reordena ni se recorta la página recibida, porque hacerlo sobre una ventana
   * de 10 filas rompería el orden global de la bitácora.
   */
  function bitacora() {
    const columnas: Column<MovimientoInsumo>[] = [
      // `createdAt` es un instante real (`@db.Timestamptz`), no una fecha de
      // calendario: va con hora, en el reloj de quien mira.
      { key: "createdAt", header: "Fecha", render: (fila) => formatearInstante(fila.createdAt) },
      { key: "tipo", header: "Tipo", render: (fila) => ETIQUETA_TIPO_MOVIMIENTO[fila.tipo] },
      {
        key: "cantidad",
        header: "Cantidad",
        // El signo sale del TIPO. `cantidad` llega siempre positiva.
        render: (fila) => `${SIGNO_MOVIMIENTO[fila.tipo]}${formatearNumeroEsAr(fila.cantidad)}`,
      },
      {
        key: "usuarioId",
        header: "Registrado por",
        render: (fila) =>
          nombreDeUsuario(fila.usuarioId, {
            // Cruda, sin `?? []`: el `undefined` es lo que distingue "todavía
            // no resolvió" de "resolvió y no está".
            entradas: usuariosQuery.data,
            cargando: usuariosQuery.isLoading,
          }),
      },
      {
        key: "motivo",
        header: "Motivo",
        // Acá el guion SÍ afirma algo sobre el dato, y es correcto: la entrada
        // que nace de una recepción viaja sin motivo a propósito, y la columna
        // de origen es la que lo explica.
        render: (fila) => fila.motivo ?? SIN_VALOR,
      },
      {
        key: "itemCompraId",
        header: "Origen",
        render: (fila) =>
          fila.itemCompraId === null ? ETIQUETA_ORIGEN_MANUAL : ETIQUETA_ORIGEN_RECEPCION,
      },
    ];

    return (
      <>
        <DataTable
          columns={columnas}
          data={movimientosQuery.data?.items ?? []}
          getRowKey={(fila) => fila.id}
          isLoading={movimientosQuery.isLoading}
          error={
            movimientosQuery.isError ? "No se pudieron cargar los movimientos del insumo." : undefined
          }
          onRetry={() => movimientosQuery.refetch().catch(notifyError)}
          emptyTitle="Sin movimientos"
          emptyDescription="Todavía no se registraron movimientos para este insumo."
        />
        {/*
          El paginador se dibuja con la ventana EFECTIVA que devolvió el
          servidor y con `total`, que es el universo completo del insumo —
          NUNCA con `items.length`, que daría siempre una sola página y
          escondería toda la historia anterior.
        */}
        {movimientosQuery.data && (
          <Pagination
            page={movimientosQuery.data.pagina}
            pageSize={movimientosQuery.data.porPagina}
            total={movimientosQuery.data.total}
            onPageChange={setPaginaBitacora}
          />
        )}
      </>
    );
  }

  return (
    <Can
      permiso="INSUMOS:LECTURA"
      fallback={<ErrorState message="No tiene permiso para ver la ficha del insumo." />}
    >
      {contenido()}
    </Can>
  );
}
