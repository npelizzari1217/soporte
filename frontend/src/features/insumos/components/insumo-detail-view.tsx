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
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatearNumeroEsAr } from "@/shared/lib/formato-numero";
import { notifyError } from "@/shared/lib/toast";
import { useInsumos } from "../hooks/use-insumos";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { useStockInsumo } from "../hooks/use-stock-insumo";
import { nombreDeCatalogo } from "../lib/nombre-de-catalogo";
import { resolverDeCatalogo } from "../lib/resolucion-de-catalogo";
import type { EstadoReposicionInsumo, Insumo } from "../types";

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
  const insumosQuery = useInsumos();
  const familiasQuery = useFamiliasInsumo();
  const unidadesQuery = useUnidadesMedida();
  const stockQuery = useStockInsumo(insumoId);

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
          <h2 className="text-sm font-semibold text-foreground">Existencia</h2>
          {existencia()}
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

  return (
    <Can
      permiso="INSUMOS:LECTURA"
      fallback={<ErrorState message="No tiene permiso para ver la ficha del insumo." />}
    >
      {contenido()}
    </Can>
  );
}
