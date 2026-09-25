/**
 * plan.ts — decide QUÉ hace el cargador con cada elemento del paquete, a
 * partir de una foto del estado actual de soporte. Puro: recibe lo que la
 * capa de I/O ya leyó y devuelve el plan más los conflictos que bloquean
 * `--aplicar`.
 */
import type { CicloPaquete, TicketPaquete, UsuarioPaquete } from './paquete';

/** Usuario global de soporte cuyo email coincide (sin distinguir mayúsculas) con uno del paquete. */
export interface UsuarioExistente {
  id: string;
  email: string;
  /** Membresías en el cliente destino, activas o no. */
  membresiasEnCliente: { rolCodigo: string; activo: boolean }[];
}

export type MembresiaPlan = 'activa' | 'inactiva' | 'agregar';

export interface PlanUsuario {
  legacyId: string;
  email: string;
  rol: string;
  /** `crear` = alta sin acceso; `reusar` = el usuario global queda tal cual. */
  accion: 'reusar' | 'crear';
  usuarioId: string | null;
  membresia: MembresiaPlan;
}

/** Ciclo existente en soporte (master o tenant) con fechas como `YYYY-MM-DD`. */
export interface CicloExistente {
  id: string;
  fechaInicio: string;
  fechaFin: string;
  activo: boolean;
}

export type DecisionCiclo = { accion: 'reusar'; id: string } | { accion: 'crear' };

export interface PlanCiclo {
  legacyId: string;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  vigente: DecisionCiclo;
  cliente: DecisionCiclo;
}

export interface ComentarioPlan {
  autorLegacyId: string;
  fecha: Date;
  texto: string;
  /** true = el `comentarioAdicional` del ticket legacy convertido en comentario. */
  adicional: boolean;
}

export interface Planificado<T> {
  plan: T[];
  conflictos: string[];
}

/** Email con el que se da de alta un usuario nuevo: el login lo busca por igualdad exacta. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function planificarUsuarios(
  usuarios: UsuarioPaquete[],
  existentes: UsuarioExistente[],
): Planificado<PlanUsuario> {
  const conflictos: string[] = [];
  const plan = usuarios.map((u): PlanUsuario => {
    const email = normalizarEmail(u.email);
    const legacyId = String(u.legacyId);
    const candidatos = existentes.filter((e) => normalizarEmail(e.email) === email);
    if (candidatos.length > 1) {
      conflictos.push(
        `usuario legacy ${legacyId}: ${candidatos.length} usuarios de soporte comparten su email sin distinguir mayusculas`,
      );
    }
    const existente = candidatos[0];
    if (!existente) {
      return {
        legacyId,
        email,
        rol: u.rol,
        accion: 'crear',
        usuarioId: null,
        membresia: 'agregar',
      };
    }
    const membresias = existente.membresiasEnCliente;
    const membresia: MembresiaPlan = membresias.some((m) => m.activo)
      ? 'activa'
      : membresias.length > 0
        ? 'inactiva'
        : 'agregar';
    return { legacyId, email, rol: u.rol, accion: 'reusar', usuarioId: existente.id, membresia };
  });
  return { plan, conflictos };
}

const seSolapan = (a: CicloExistente | CicloPaquete, b: CicloExistente | CicloPaquete) =>
  a.fechaInicio <= b.fechaFin && b.fechaInicio <= a.fechaFin;

/**
 * Empareja por FECHAS, nunca por nombre. Un ciclo existente con las mismas
 * fechas se reusa; si no hay ninguno, se crea. Un ciclo existente que se
 * SOLAPA con fechas distintas es conflicto: crear otro rompería la regla de
 * no-solapamiento que el alta normal de ciclos respeta.
 */
function decidirCiclo(
  ciclo: CicloPaquete,
  existentes: CicloExistente[],
  donde: string,
  conflictos: string[],
): DecisionCiclo {
  const iguales = existentes.filter(
    (e) => e.fechaInicio === ciclo.fechaInicio && e.fechaFin === ciclo.fechaFin,
  );
  if (iguales.length > 1) {
    conflictos.push(
      `ciclo legacy ${ciclo.legacyId}: ${iguales.length} ${donde} con las mismas fechas`,
    );
  }
  if (iguales.length > 0) return { accion: 'reusar', id: iguales[0].id };
  const solapados = existentes.filter((e) => seSolapan(e, ciclo));
  if (solapados.length > 0) {
    conflictos.push(
      `ciclo legacy ${ciclo.legacyId} (${ciclo.fechaInicio} a ${ciclo.fechaFin}): se solapa con ` +
        solapados.map((s) => `${s.fechaInicio} a ${s.fechaFin}`).join(', ') +
        ` en ${donde}`,
    );
  }
  return { accion: 'crear' };
}

export function planificarCiclos(
  ciclos: CicloPaquete[],
  vigentes: CicloExistente[],
  ciclosCliente: CicloExistente[],
): Planificado<PlanCiclo> {
  const conflictos: string[] = [];
  const plan = ciclos.map((c) => ({
    legacyId: String(c.legacyId),
    nombre: c.nombre,
    fechaInicio: c.fechaInicio,
    fechaFin: c.fechaFin,
    vigente: decidirCiclo(c, vigentes, 'ciclos vigentes (master)', conflictos),
    cliente: decidirCiclo(c, ciclosCliente, 'ciclos del cliente', conflictos),
  }));
  paresSolapados(ciclos).forEach(([a, b]) =>
    conflictos.push(`ciclos legacy ${a.legacyId} y ${b.legacyId} se solapan entre si`),
  );
  return { plan, conflictos };
}

function paresSolapados(ciclos: CicloPaquete[]): [CicloPaquete, CicloPaquete][] {
  const pares: [CicloPaquete, CicloPaquete][] = [];
  ciclos.forEach((a, i) =>
    ciclos.slice(i + 1).forEach((b) => {
      if (seSolapan(a, b)) pares.push([a, b]);
    }),
  );
  return pares;
}

/** Idempotencia por `numero`: un ticket cuyo numero ya existe en el tenant no se toca. */
export function separarTickets(
  tickets: TicketPaquete[],
  numerosExistentes: ReadonlySet<string>,
): { aInsertar: TicketPaquete[]; yaExistian: string[] } {
  const aInsertar = tickets.filter((t) => !numerosExistentes.has(t.numero));
  const yaExistian = tickets.filter((t) => numerosExistentes.has(t.numero)).map((t) => t.numero);
  return { aInsertar, yaExistian };
}

/**
 * Comentarios del ticket en el orden del paquete. El `comentarioAdicional`
 * legacy va al final, firmado por el técnico asignado (quien lo escribía en
 * el sistema legacy) o, si el ticket no tenía asignado, por el solicitante;
 * fechado al cierre o, si no cerró, al alta.
 */
export function comentariosDeTicket(t: TicketPaquete): ComentarioPlan[] {
  const comentarios: ComentarioPlan[] = t.comentarios.map((c) => ({
    autorLegacyId: String(c.autorLegacyId),
    fecha: new Date(c.fecha),
    texto: c.texto,
    adicional: false,
  }));
  if (t.comentarioAdicional !== null && t.comentarioAdicional.trim().length > 0) {
    comentarios.push({
      autorLegacyId: String(t.asignadoLegacyId ?? t.solicitanteLegacyId),
      fecha: new Date(t.fechaCierre ?? t.fechaAlta),
      texto: t.comentarioAdicional,
      adicional: true,
    });
  }
  return comentarios;
}
