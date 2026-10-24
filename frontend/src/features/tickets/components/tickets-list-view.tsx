"use client";

/**
 * TicketsListView — CONTAINER client component montado por `/tickets`
 * (ADR-1: la page es un Server Component fino). Filtros viven en la URL
 * (searchParams, ADR-2) — deep-link + back/forward funcionan sin estado
 * cliente duplicado.
 *
 * Deviación de scope (documentada, no bloqueante): la spec R-M1 pide filtro
 * de rango de fechas (popover). B1 implementa estado/tipo/prioridad/
 * asignado/búsqueda — el rango de fechas queda pendiente para un batch
 * posterior (el tipo `TicketsFiltros`/hook `useTickets` ya soportan
 * `fechaDesde`/`fechaHasta`, falta solo el control de UI).
 *
 * Filtro de ciclo (feat/selector-ciclo-tickets): sin `ciclo` en la URL, el
 * backend lista el ciclo activo (`GET /tickets` sin `?ciclo`). Los tickets de
 * ciclos pasados quedaban invisibles porque acá nunca se mandaba ese param —
 * ahora hay un select que lo agrega, con el mismo `useCiclos` que usa el
 * dashboard.
 *
 * Filtro "Borrados" (odd/permisos-por-tipo-ticket, S8): solo para ADMINISTRADOR y
 * ROOT, que son los únicos a quienes el backend se los lista. Muestra solo los
 * tickets borrados, marcados, con la acción "Recuperar"; sin detalle (el detalle
 * de un borrado es 404) ni exportación (exporta solo activos).
 *
 * Filtro "Asignado": sus opciones salen de `GET /tickets/agentes`, que ya trae solo a los técnicos
 * (TECNICO o COLABORADOR) con LECTURA sobre los tipos que la sesión ve, o sobre el tipo filtrado
 * si hay `?tipo=`. Un ticket solo se asigna a quien atiende su tipo: ofrecer a otro sería un filtro
 * que nunca devuelve filas.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useTickets } from "../hooks/use-tickets";
import { useUrlFilters } from "@/shared/hooks/use-url-filters";
import { useSession } from "@/shared/hooks/use-session";
import { useRecuperarTicket } from "../hooks/use-ticket-mutations";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import { puedeVerListaDeUsuarios } from "@/shared/auth/permisos-por-tipo";
import { useTiposTicket, usePrioridades, useEstados } from "../hooks/use-catalogos";
import { useAgentesFiltro } from "../hooks/use-agentes-filtro";
// Mismo hook que usa el dashboard (`features/dashboard/hooks/use-ciclos.ts`)
// para el filtro de ciclo — no se duplica, se reusa cruzando de feature,
// mismo criterio que `dashboard-view.tsx` importando catálogos de `tickets/`.
import { useCiclos } from "@/features/dashboard/hooks/use-ciclos";
import { buildIdToCodigoMap } from "../lib/catalog-map";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketCreateDialog } from "./ticket-create-dialog";
import { ExportarTicketsButton } from "./exportar-tickets-button";
import { StatusBadge, etiquetaOpcionEstado, type TicketEstado } from "@/components/ui/status-badge";
import { Ticket as TicketIcon } from "lucide-react";
import { formatearFechaCalendario, formatearInstante } from "@/shared/lib/formato-fecha";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { notifyError } from "@/shared/lib/toast";
import type { Ticket, TicketsFiltros } from "../types";

const PAGE_SIZE = 10;

export function TicketsListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateFiltros, irAPagina, limpiarFiltros } = useUrlFilters<TicketsFiltros>("pagina");
  const { user, isLoading: sesionCargando, esAdminCliente } = useSession();
  const recuperar = useRecuperarTicket();
  // `?borrados=true` vale solo para ADMINISTRADOR y ROOT: a cualquier otro el backend le responde
  // 403, así que ni se manda (y se saca de la URL más abajo).
  const borrados = esAdminCliente && searchParams.get("borrados") === "true";

  const filtros: TicketsFiltros = useMemo(
    () => ({
      estado: searchParams.get("estado") ?? undefined,
      tipo: searchParams.get("tipo") ?? undefined,
      prioridad: searchParams.get("prioridad") ?? undefined,
      asignado: searchParams.get("asignado") ?? undefined,
      ciclo: searchParams.get("ciclo") ?? undefined,
      busqueda: searchParams.get("busqueda") ?? undefined,
      borrados: borrados ? true : undefined,
      pagina: Number(searchParams.get("pagina") ?? "1"),
      porPagina: PAGE_SIZE,
    }),
    [searchParams, borrados],
  );

  /**
   * La PÁGINA cuenta como filtro cuando es mayor a 1: con pocas filas, una
   * `pagina` vieja pegada en la URL deja el listado vacío para siempre, y ese
   * vacío se leía como "los datos no cargaron" (ver `DataTable.hayFiltrosActivos`).
   */
  const hayFiltrosActivos =
    Boolean(filtros.estado) ||
    Boolean(filtros.tipo) ||
    Boolean(filtros.prioridad) ||
    Boolean(filtros.asignado) ||
    Boolean(filtros.ciclo) ||
    Boolean(filtros.busqueda) ||
    Boolean(filtros.borrados) ||
    (filtros.pagina ?? 1) > 1;

  const tiposQuery = useTiposTicket();
  const permisosPorTipo = usePermisosPorTipo();
  // El listado trae solo tickets de los tipos con LECTURA (odd/permisos-por-tipo-ticket, D5 e):
  // ofrecer otro tipo sería un filtro que nunca devuelve filas. ROOT y ADMINISTRADOR los ven todos.
  const tiposVisibles = permisosPorTipo.tiposCon(tiposQuery.data ?? [], "LECTURA");
  // El alta de este listado es la de soporte general: solo tipos de TICKETS (`moduloRequerido`).
  const puedeCrear = permisosPorTipo.puedeEnModulo("TICKETS", "ALTAS");
  // `GET /tickets/agentes` se abre con la misma regla que `GET /usuarios` (S7): sin ella el
  // filtro no se muestra y la lista ni se pide.
  const puedeFiltrarPorAsignado = puedeVerListaDeUsuarios(permisosPorTipo.permisos);
  const prioridadesQuery = usePrioridades();
  const estadosQuery = useEstados();
  const agentesQuery = useAgentesFiltro(filtros.tipo, puedeFiltrarPorAsignado);
  const agentes = agentesQuery.data ?? [];
  const ciclosQuery = useCiclos();

  // Un `?tipo=` o `?asignado=` que el select no ofrece (link viejo, tipo de otro módulo,
  // usuario final, técnico que no atiende el tipo filtrado) filtra igual pero el select lo
  // muestra vacío: se saca de la URL. Solo con el catálogo ya resuelto; cargando o caído, la
  // ausencia no prueba nada.
  const tipoFueraDeCatalogo =
    Boolean(filtros.tipo) && tiposQuery.isSuccess && !tiposVisibles.some((tipo) => tipo.id === filtros.tipo);
  const asignadoFueraDeCatalogo =
    Boolean(filtros.asignado) &&
    agentesQuery.isSuccess &&
    !agentes.some((agente) => agente.id === filtros.asignado);
  // Un `?borrados=` en la URL de quien no es administrador (link compartido) tampoco se ofrece:
  // solo con la sesión ya resuelta, porque mientras carga todavía no se sabe quién es.
  const borradosNoPermitido =
    searchParams.has("borrados") && !sesionCargando && user !== null && !esAdminCliente;
  useEffect(() => {
    if (!tipoFueraDeCatalogo && !asignadoFueraDeCatalogo && !borradosNoPermitido) return;
    updateFiltros({
      ...(tipoFueraDeCatalogo ? { tipo: undefined } : {}),
      ...(asignadoFueraDeCatalogo ? { asignado: undefined } : {}),
      ...(borradosNoPermitido ? { borrados: undefined } : {}),
    });
  }, [tipoFueraDeCatalogo, asignadoFueraDeCatalogo, borradosNoPermitido, updateFiltros]);

  const ciclos = useMemo(() => ciclosQuery.data?.ciclos ?? [], [ciclosQuery.data]);
  const cicloActivoId = ciclosQuery.data?.cicloActivoId ?? null;

  /**
   * Sin ciclo elegido en la URL, no se manda `ciclo`: el backend ya lista el
   * ciclo activo por defecto (comportamiento actual, sin cambios, R2). Si el
   * tenant NO tiene ciclo activo, ese default del backend deja la lista
   * vacía sin motivo — acá se elige el ciclo más reciente por `fechaInicio`
   * para evitarlo. Con el tenant sin ciclos, no hay de dónde elegir y queda
   * el estado vacío existente.
   */
  const cicloMasRecienteId = useMemo(() => {
    if (ciclos.length === 0) return undefined;
    return ciclos.reduce((masReciente, actual) =>
      new Date(actual.fechaInicio) > new Date(masReciente.fechaInicio) ? actual : masReciente,
    ).id;
  }, [ciclos]);
  const cicloPorDefecto = cicloActivoId === null ? cicloMasRecienteId : undefined;
  const cicloSeleccionado = filtros.ciclo ?? cicloPorDefecto;

  // Filtros REALES con los que se pide el listado y se exporta — puede
  // diferir de `filtros` (URL) solo en `ciclo`, cuando se aplica el default
  // de "sin ciclo activo" de arriba.
  const filtrosEfectivos: TicketsFiltros = useMemo(
    () => ({ ...filtros, ciclo: cicloSeleccionado }),
    [filtros, cicloSeleccionado],
  );

  const ticketsQuery = useTickets(filtrosEfectivos);

  const prioridadCodigoMap = useMemo(
    () => buildIdToCodigoMap(prioridadesQuery.data ?? []),
    [prioridadesQuery.data],
  );
  const estadoCodigoMap = useMemo(() => buildIdToCodigoMap(estadosQuery.data ?? []), [estadosQuery.data]);

  const columns: Column<Ticket>[] = [
    {
      key: "titulo",
      header: "Ticket",
      // Título como dato principal y, debajo, número y alta: lo que se busca
      // primero se lee primero, sin perder la referencia que se dicta por teléfono.
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            {row.titulo}
            {row.borradoEn && <Badge variant="outline">Borrado</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.numero} · {formatearInstante(row.createdAt)}
          </span>
        </div>
      ),
    },
    {
      key: "estadoId",
      header: "Estado",
      render: (row) => <StatusBadge estado={(estadoCodigoMap.get(row.estadoId) as TicketEstado) ?? "NUEVO"} />,
    },
    {
      key: "prioridadId",
      header: "Prioridad",
      render: (row) => <PriorityBadge prioridad={prioridadCodigoMap.get(row.prioridadId) ?? "-"} />,
    },
    {
      key: "asignadoId",
      header: "Responsable",
      // El backend resuelve batch cross-DB `asignadoNombre`/`asignadoApellido`
      // (puede ser null si el ticket no tiene asignado o si el usuario fue
      // removido del tenant); en ambos casos mostramos "Sin asignar".
      render: (row) =>
        row.asignadoId && row.asignadoNombre ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
            >
              {iniciales(row.asignadoNombre, row.asignadoApellido)}
            </span>
            <span>{`${row.asignadoNombre} ${row.asignadoApellido ?? ""}`.trim()}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Sin asignar</span>
        ),
    },
    // odd/ubicacion-sector-ticket (CA4): sin filtros nuevos. El sector por el
    // nombre que resuelve el backend, que incluye los desactivados.
    { key: "ubicacion", header: "Ubicación", render: (row) => row.ubicacion ?? "—" },
    { key: "sectorId", header: "Sector", render: (row) => row.sectorNombre ?? "—" },
    // odd/preventivo-anticipacion: la fecha del ciclo del plan que generó el ticket. Es
    // `@db.Date` (día calendario, no instante) e informativa: no cambia el SLA.
    {
      key: "fechaObjetivo",
      header: "Fecha objetivo",
      render: (row) => (row.fechaObjetivo ? formatearFechaCalendario(row.fechaObjetivo) : "—"),
    },
    ...(borrados
      ? [
          {
            key: "borradoEn",
            header: "Borrado",
            render: (row: Ticket) => (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {row.borradoEn ? formatearInstante(row.borradoEn) : "—"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={`Recuperar ${row.numero}`}
                  isLoading={recuperar.isPending && recuperar.variables === row.id}
                  disabled={recuperar.isPending}
                  onClick={(evento) => {
                    evento.stopPropagation();
                    recuperar.mutate(row.id);
                  }}
                >
                  Recuperar
                </Button>
              </div>
            ),
          } satisfies Column<Ticket>,
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Tickets"
        icon={TicketIcon}
        description="Pedidos de soporte del ciclo, con su estado y responsable"
        actions={
          <>
            {/*
              Recibe el MISMO objeto `filtrosEfectivos` que alimenta
              `useTickets` (incluye el ciclo por default cuando no hay ciclo
              activo): es lo que garantiza que el CSV y la pantalla cuenten
              lo mismo.
            */}
            {/* La exportación trae solo activos: con "Borrados" no coincidiría con la pantalla. */}
            {!borrados && <ExportarTicketsButton filtros={filtrosEfectivos} />}
            {puedeCrear && <TicketCreateDialog />}
          </>
        }
      />

      <FilterBar
        variante="tarjeta"
        searchPlaceholder="Buscar por título o descripción…"
        searchValue={filtros.busqueda ?? ""}
        onSearchChange={(value) => updateFiltros({ busqueda: value })}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-ciclo" className="sr-only">
            Ciclo
          </label>
          <Select
            id="filtro-ciclo"
            value={cicloSeleccionado ?? ""}
            onChange={(e) => updateFiltros({ ciclo: e.target.value || undefined })}
          >
            <option value="">Ciclo activo</option>
            {ciclos.map((ciclo) => (
              <option key={ciclo.id} value={ciclo.id}>
                {ciclo.id === cicloActivoId ? `${ciclo.nombre} (activo)` : ciclo.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-estado" className="sr-only">
            Estado
          </label>
          <Select
            id="filtro-estado"
            value={filtros.estado ?? ""}
            onChange={(e) => updateFiltros({ estado: e.target.value || undefined })}
          >
            <option value="">Todos los estados</option>
            {(estadosQuery.data ?? []).map((estado) => (
              <option key={estado.id} value={estado.id}>
                {etiquetaOpcionEstado(estado.codigo, estado.nombre)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-tipo" className="sr-only">
            Tipo
          </label>
          <Select
            id="filtro-tipo"
            value={filtros.tipo ?? ""}
            onChange={(e) => updateFiltros({ tipo: e.target.value || undefined })}
          >
            <option value="">Todos los tipos</option>
            {tiposVisibles.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-prioridad" className="sr-only">
            Prioridad
          </label>
          <Select
            id="filtro-prioridad"
            value={filtros.prioridad ?? ""}
            onChange={(e) => updateFiltros({ prioridad: e.target.value || undefined })}
          >
            <option value="">Todas las prioridades</option>
            {(prioridadesQuery.data ?? []).map((prioridad) => (
              <option key={prioridad.id} value={prioridad.id}>
                {prioridad.nombre}
              </option>
            ))}
          </Select>
        </div>

        {esAdminCliente && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-borrados" className="sr-only">
              Borrados
            </label>
            <Select
              id="filtro-borrados"
              value={borrados ? "true" : ""}
              onChange={(e) => updateFiltros({ borrados: e.target.value === "true" ? true : undefined })}
            >
              <option value="">Tickets activos</option>
              <option value="true">Borrados</option>
            </Select>
          </div>
        )}

        {puedeFiltrarPorAsignado && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-asignado" className="sr-only">
              Asignado
            </label>
            <Select
              id="filtro-asignado"
              value={filtros.asignado ?? ""}
              onChange={(e) => updateFiltros({ asignado: e.target.value || undefined })}
            >
              <option value="">Cualquier asignado</option>
              {agentes.map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nombre} {usuario.apellido}
                </option>
              ))}
            </Select>
          </div>
        )}
      </FilterBar>

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={ticketsQuery.data?.items ?? []}
          getRowKey={(row) => row.id}
          isLoading={ticketsQuery.isLoading}
          error={ticketsQuery.isError ? "No se pudieron cargar los tickets." : undefined}
          onRetry={() => ticketsQuery.refetch().catch(notifyError)}
          // El detalle de un ticket borrado es 404: en "Borrados" la fila no navega.
          onRowClick={borrados ? undefined : (row) => router.push(`/tickets/${row.id}`)}
          emptyTitle="Sin tickets"
          emptyDescription="Todavía no hay tickets registrados."
          hayFiltrosActivos={hayFiltrosActivos}
          onLimpiarFiltros={limpiarFiltros}
          variante="tarjeta"
        />
      </div>

      {ticketsQuery.data && (
        <Pagination
          page={ticketsQuery.data.pagina}
          pageSize={ticketsQuery.data.porPagina}
          total={ticketsQuery.data.total}
          onPageChange={irAPagina}
        />
      )}
    </div>
  );
}

/** Iniciales del responsable para el avatar; el nombre completo va al lado. */
function iniciales(nombre: string, apellido: string | null | undefined): string {
  return `${nombre.charAt(0)}${apellido?.charAt(0) ?? ""}`.toUpperCase();
}
