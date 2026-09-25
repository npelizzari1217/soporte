/**
 * tenant.ts — lado TENANT del cargador: ciclos del cliente, tickets, sus
 * satélites y sus comentarios. Todo en UNA transacción: o entra el paquete
 * entero o no entra nada.
 *
 * Inserta directo con Prisma, sin los casos de uso de tickets: esos publican
 * eventos que calculan SLA, mandan correos y emiten encuestas CSAT, y nada de
 * eso tiene sentido para un ticket histórico.
 */
import { uuidv7 } from 'uuidv7';
import type { Prisma } from '.prisma/tenant';
import type { TenantPrismaClient } from '../../src/shared/infrastructure/persistence/prisma-clients';
import { fechaDia, type PaqueteLegacy, type TicketPaquete } from './paquete';
import { comentariosDeTicket, separarTickets, type CicloExistente, type PlanCiclo } from './plan';

type Tenant = InstanceType<typeof TenantPrismaClient>;
type Tx = Parameters<Parameters<Tenant['$transaction']>[0]>[0];

/** Código de `tipo_operacion` con el que el alta normal registra un comentario. */
export const CODIGO_OPERACION_COMENTARIO = 'COMENTARIO';

/**
 * Cohorte de SLA de los tickets importados. `CORRIDO` es la de los tickets
 * que ya existían al introducirse el cálculo hábil; un ticket legacy es
 * histórico igual que ellos. Igual nacen con `sla_vence_at = NULL`.
 */
export const SLA_REGLA_IMPORTADOS = 'CORRIDO';

export interface CatalogosTenant {
  tipos: Map<string, string>;
  estados: Map<string, string>;
  /** Por NOMBRE: el paquete trae el nombre visible ("Media"), no el código. */
  prioridades: Map<string, string>;
  tipoComentarioId: string | null;
}

export interface EstadoTenant {
  catalogos: CatalogosTenant;
  ciclosCliente: CicloExistente[];
  numerosExistentes: Set<string>;
}

/** Incluye tickets borrados: `numero` es UNIQUE sin filtro de borrado. */
async function numerosExistentes(db: Tenant | Tx, p: PaqueteLegacy): Promise<Set<string>> {
  const numeros = p.tickets.map((t) => t.numero);
  const filas = await db.ticket.findMany({
    where: { numero: { in: numeros } },
    select: { numero: true },
  });
  return new Set(filas.map((f) => f.numero));
}

export async function leerTenant(tenant: Tenant, paquete: PaqueteLegacy): Promise<EstadoTenant> {
  const [tipos, estados, prioridades, tipoComentario, ciclos] = await Promise.all([
    tenant.tipoTicket.findMany({ where: { deletedAt: null } }),
    tenant.estado.findMany({ where: { deletedAt: null } }),
    tenant.prioridad.findMany({ where: { deletedAt: null } }),
    tenant.tipoOperacion.findFirst({
      where: { codigo: CODIGO_OPERACION_COMENTARIO, deletedAt: null },
    }),
    tenant.cicloCliente.findMany({ where: { deletedAt: null } }),
  ]);
  return {
    catalogos: {
      tipos: new Map(tipos.map((t) => [t.codigo, t.id])),
      estados: new Map(estados.map((t) => [t.codigo, t.id])),
      prioridades: new Map(prioridades.map((t) => [t.nombre, t.id])),
      tipoComentarioId: tipoComentario?.id ?? null,
    },
    ciclosCliente: ciclos.map((c) => ({
      id: c.id,
      fechaInicio: c.fechaInicio.toISOString().slice(0, 10),
      fechaFin: c.fechaFin.toISOString().slice(0, 10),
      activo: c.activo,
    })),
    numerosExistentes: await numerosExistentes(tenant, paquete),
  };
}

/** Códigos del paquete que el catálogo del tenant no tiene: bloquean `--aplicar`. */
export function conflictosDeCatalogo(paquete: PaqueteLegacy, c: CatalogosTenant): string[] {
  const faltan = (
    que: string,
    catalogo: Map<string, string>,
    valor: (t: TicketPaquete) => string,
  ) =>
    [...new Set(paquete.tickets.map(valor))]
      .filter((v) => !catalogo.has(v))
      .map((v) => `${que} "${v}" no existe en el tenant`);
  const sinComentario = `tipo de operacion ${CODIGO_OPERACION_COMENTARIO} no existe en el tenant`;
  return [
    ...faltan('tipo de ticket', c.tipos, (t) => t.tipoCodigo),
    ...faltan('estado', c.estados, (t) => t.estadoCodigo),
    ...faltan('prioridad', c.prioridades, (t) => t.prioridadNombre),
    ...(c.tipoComentarioId === null ? [sinComentario] : []),
  ];
}

export interface EntradaTenant {
  paquete: PaqueteLegacy;
  planCiclos: PlanCiclo[];
  vigenteIdPorLegacy: Map<string, string>;
  usuarioIdPorLegacy: Map<string, string>;
  catalogos: CatalogosTenant;
}

export interface ResultadoTenant {
  ciclosCreados: number;
  ticketsInsertados: number;
  comentariosInsertados: number;
  yaExistian: string[];
}

const exigir = <T>(valor: T | undefined | null, que: string): T => {
  if (valor === undefined || valor === null) throw new Error(`sin resolver: ${que}`);
  return valor;
};

export async function aplicarTenant(tenant: Tenant, e: EntradaTenant): Promise<ResultadoTenant> {
  return tenant.$transaction(
    async (tx) => {
      const cicloIdPorLegacy = new Map<string, string>();
      let ciclosCreados = 0;
      for (const c of e.planCiclos) {
        if (c.cliente.accion === 'reusar') {
          cicloIdPorLegacy.set(c.legacyId, c.cliente.id);
          continue;
        }
        const fila = await tx.cicloCliente.create({
          data: {
            cicloVigenteId: exigir(
              e.vigenteIdPorLegacy.get(c.legacyId),
              `ciclo vigente ${c.legacyId}`,
            ),
            nombre: c.nombre,
            fechaInicio: fechaDia(c.fechaInicio),
            fechaFin: fechaDia(c.fechaFin),
            // Nunca activo: un solo activo por tenant, y es el de cada ticket nuevo.
            activo: false,
          },
        });
        cicloIdPorLegacy.set(c.legacyId, fila.id);
        ciclosCreados += 1;
      }

      // Se relee DENTRO de la transacción: es lo que hace idempotente la corrida.
      const existentes = await numerosExistentes(tx, e.paquete);
      const { aInsertar, yaExistian } = separarTickets(e.paquete.tickets, existentes);
      const filas = armarFilas(aInsertar, e, cicloIdPorLegacy);

      await tx.ticket.createMany({ data: filas.tickets });
      await tx.ticketSoporte.createMany({ data: filas.soporte });
      await tx.ticketEdilicia.createMany({ data: filas.edilicia });
      await tx.operacionTicket.createMany({ data: filas.comentarios });

      return {
        ciclosCreados,
        ticketsInsertados: filas.tickets.length,
        comentariosInsertados: filas.comentarios.length,
        yaExistian,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/**
 * Filas a insertar. Ids UUIDv7 generados en orden: dentro de un mismo
 * instante, el timeline desempata por id y conserva el orden del paquete.
 * Satélite como en el alta normal: `ticket_soporte` para SOPORTE,
 * `ticket_edilicia` para EDILICIA; MANTENIMIENTO no lleva satélite.
 */
function armarFilas(
  tickets: TicketPaquete[],
  e: EntradaTenant,
  cicloIdPorLegacy: Map<string, string>,
) {
  const usuario = (legacyId: string | number) =>
    exigir(e.usuarioIdPorLegacy.get(String(legacyId)), `usuario legacy ${legacyId}`);
  const tipoComentarioId = exigir(e.catalogos.tipoComentarioId, 'tipo de operacion COMENTARIO');
  const filas = {
    tickets: [] as Prisma.TicketCreateManyInput[],
    soporte: [] as Prisma.TicketSoporteCreateManyInput[],
    edilicia: [] as Prisma.TicketEdiliciaCreateManyInput[],
    comentarios: [] as Prisma.OperacionTicketCreateManyInput[],
  };

  for (const t of tickets) {
    const id = uuidv7();
    const alta = new Date(t.fechaAlta);
    const cierre = t.fechaCierre === null ? null : new Date(t.fechaCierre);
    filas.tickets.push({
      id,
      numero: t.numero,
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipoId: exigir(e.catalogos.tipos.get(t.tipoCodigo), `tipo ${t.tipoCodigo}`),
      estadoId: exigir(e.catalogos.estados.get(t.estadoCodigo), `estado ${t.estadoCodigo}`),
      prioridadId: exigir(
        e.catalogos.prioridades.get(t.prioridadNombre),
        `prioridad ${t.prioridadNombre}`,
      ),
      cicloId:
        t.cicloLegacyId === null
          ? null
          : exigir(cicloIdPorLegacy.get(String(t.cicloLegacyId)), `ciclo ${t.cicloLegacyId}`),
      solicitanteId: usuario(t.solicitanteLegacyId),
      asignadoId: t.asignadoLegacyId === null ? null : usuario(t.asignadoLegacyId),
      slaVenceAt: null,
      vencido: false,
      slaRegla: SLA_REGLA_IMPORTADOS,
      fechaCierre: cierre,
      createdAt: alta,
      updatedAt: cierre ?? alta,
    });
    if (t.tipoCodigo === 'SOPORTE')
      filas.soporte.push({ ticketId: id, createdAt: alta, updatedAt: alta });
    if (t.tipoCodigo === 'EDILICIA')
      filas.edilicia.push({ ticketId: id, createdAt: alta, updatedAt: alta });
    for (const c of comentariosDeTicket(t)) {
      filas.comentarios.push({
        id: uuidv7(),
        ticketId: id,
        tipoOperacionId: tipoComentarioId,
        descripcion: c.texto,
        autorId: usuario(c.autorLegacyId),
        esInterno: false,
        createdAt: c.fecha,
        updatedAt: c.fecha,
      });
    }
  }
  return filas;
}
