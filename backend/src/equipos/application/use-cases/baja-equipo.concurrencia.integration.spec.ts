/**
 * [INTEGRATION] Concurrencia de RESULTADO de la baja de equipo completo (baja-equipo-completo,
 * WU-13, R15 y R10). El ORDEN de locks lo fijan los testigos deterministas de
 * `baja-equipo.orden-de-locks.integration.spec.ts`; acá se afirma el resultado de clientes reales.
 *
 * Para que cada iteración sea una carrera de verdad y no un orden secuencial, se escalona: un
 * cliente externo retiene un lock, se lanzan las operaciones (cada una con su conexión), se espera
 * (acotado, `pg_blocking_pids`) a que TODAS queden bloqueadas por el externo y recién entonces se
 * hace COMMIT. El orden en que Postgres las despierta no se fija: se afirma que cualquiera de los
 * resultados admitidos deja el sistema consistente, sin `40P01` ni error de sistema.
 *
 * Casos: (a) baja vs instalaciones de los mismos insumos en orden inverso; (b) baja vs instalar en
 * el mismo equipo; (c) baja vs alta sin descuento; (d) dos bajas; (e) baja vs crear ticket; y el
 * 409 `EquipoModificadoDuranteLaBajaError` (determinista: el externo agrega una pieza antes de
 * soltar el LE).
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DomainError, Result } from '../../../shared/domain/result';
import { BajaEquipoFixtures } from '../../testing/baja-equipo.fixtures';
import { RegistrarSalidaInsumoUseCase } from '../../../insumos/application/use-cases/registrar-salida-insumo.use-case';
import { PrismaFamiliaInsumoRepository } from '../../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from '../../../tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { NumeradorTicket } from '../../../tickets/domain/services/numerador-ticket.service';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { TipoTicketEntity } from '../../../tickets/domain/entities/tipo-ticket.entity';
import { PrismaTicketSoporteRepository } from '../../infrastructure/persistence/prisma/prisma-ticket-soporte.repository';
import {
  EquipoDadoDeBajaError,
  EquipoInvalidoError,
  EquipoModificadoDuranteLaBajaError,
} from '../../domain/errors/equipos.errors';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { AgregarComponenteSinDescuentoUseCase } from './agregar-componente-sin-descuento.use-case';
import { AUTOR_FORMULARIO_PUBLICO } from '../../../tickets/domain/constants/formulario-publico.constants';
import { CrearTicketSoporteUseCase } from './crear-ticket-soporte.use-case';
import { InstalarComponenteDesdeDepositoUseCase } from './instalar-componente-desde-deposito.use-case';

const ITERACIONES = 10;
const ESPERA_MAXIMA_MS = 10_000;
const PASO_MS = 25;
const TIMEOUT_CASO_MS = 180_000;
const LOCK_EQUIPO_BAJA = 'SELECT id FROM equipos_informaticos WHERE id = $1 FOR NO KEY UPDATE';
const LOCK_EQUIPO_ALTA = 'SELECT id FROM equipos_informaticos WHERE id = $1 FOR SHARE';

type Salida = PromiseSettledResult<Result<unknown, DomainError>>;
type Operacion = () => Promise<Result<unknown, DomainError>>;

/**
 * Espera (acotada) a que al menos `minimo` backends esperen un lock. Con varias esperando el mismo
 * lock, las de atrás quedan bloqueadas por la primera en la cola y no por el externo: se cuentan todas
 * las esperas de lock de esta base.
 */
async function esperarBloqueados(sonda: PoolClient, pidExterno: number, minimo: number) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let vistos = 0;
  while (Date.now() < limite) {
    const { rows } = await sonda.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
         AND (pid <> $1::int) AND cardinality(pg_blocking_pids(pid)) > 0`,
      [pidExterno],
    );
    vistos = rows[0].n as number;
    if (vistos >= minimo) return;
    await new Promise((resolve) => setTimeout(resolve, PASO_MS));
  }
  throw new Error(`Solo ${vistos} de ${minimo} operaciones quedaron bloqueadas por ${pidExterno}.`);
}

/**
 * Un cliente externo retiene `consulta`; se lanzan las operaciones, se espera a que `esperados`
 * (por defecto todas) queden bloqueadas por él, se corre `alRetener` (el externo todavía retiene) y se hace COMMIT. Devuelve el
 * resultado de cada una, sin propagar rechazos (el llamador exige que ninguna sea un error de sistema).
 */
async function escalonar(
  fx: BajaEquipoFixtures,
  consulta: string,
  parametros: unknown[],
  operaciones: Operacion[],
  alRetener?: (externo: PoolClient) => Promise<void>,
  esperados = operaciones.length,
): Promise<Salida[]> {
  const externo = await fx.pool.connect();
  const sonda = await fx.pool.connect();
  let pendientes: Promise<Salida[]> | undefined;
  try {
    await externo.query('BEGIN');
    await externo.query(consulta, parametros);
    const { rows } = await externo.query('SELECT pg_backend_pid() AS pid');
    // Se lanzan de a una y se espera a que cada una quede en la cola: el orden del arreglo es el
    // orden de llegada al lock, así los dos órdenes posibles se ejercitan a propósito.
    const lanzadas: Promise<Result<unknown, DomainError>>[] = [];
    for (const [n, op] of operaciones.entries()) {
      lanzadas.push(op());
      lanzadas[n].catch(() => undefined); // el rechazo se informa después, vía allSettled
      if (n < esperados) await esperarBloqueados(sonda, rows[0].pid as number, n + 1);
    }
    pendientes = Promise.allSettled(lanzadas);
    await esperarBloqueados(sonda, rows[0].pid as number, esperados);
    await alRetener?.(externo);
  } finally {
    await externo.query('COMMIT').catch(() => undefined);
    externo.release();
    sonda.release();
  }
  return (await pendientes) as Salida[];
}

/** Ninguna operación terminó en un error de sistema (`40P01` incluido): todas devolvieron un `Result`. */
function resultados(salidas: Salida[]): Result<unknown, DomainError>[] {
  const rechazos = salidas.flatMap((s) => (s.status === 'rejected' ? [String(s.reason)] : []));
  expect(rechazos).toEqual([]);
  return salidas.map((s) => (s as PromiseFulfilledResult<Result<unknown, DomainError>>).value);
}

async function repetir(veces: number, caso: (iteracion: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await caso(i);
  }
}

describe('Baja de equipo — concurrencia de resultado (R15, R10)', () => {
  let fx: BajaEquipoFixtures;
  let ticketTipoId = '';
  let ticketEstadoId = '';
  let ticketOperacionId = '';
  let ticketPrioridadId = '';
  let ticketCicloId = '';
  let ticketTipoCodigo = '';

  beforeAll(async () => {
    fx = await BajaEquipoFixtures.crear();
    const c = fx.tenantClient;
    ticketTipoCodigo = `${fx.prefijo}TK`;
    ticketTipoId = (
      await c.tipoTicket.create({
        data: { codigo: ticketTipoCodigo, nombre: 'Tipo concurrencia baja', modulo: 'EQUIPOS' },
      })
    ).id;
    ticketEstadoId = (
      await c.estado.create({ data: { codigo: `${fx.prefijo}NU`, nombre: 'Nuevo concurrencia' } })
    ).id;
    ticketOperacionId = (
      await c.tipoOperacion.create({ data: { codigo: `${fx.prefijo}OP`, nombre: 'Op baja' } })
    ).id;
    ticketPrioridadId = (
      await c.prioridad.create({ data: { codigo: `${fx.prefijo}PR`, nombre: 'Prioridad baja' } })
    ).id;
    // Inactivo: el índice único parcial solo admite un ciclo activo y la base compartida ya puede tenerlo.
    ticketCicloId = (
      await c.cicloCliente.create({
        data: {
          cicloVigenteId: randomUUID(),
          nombre: `${fx.prefijo}ciclo`,
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: false,
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await limpiarTodo();
    const c = fx.tenantClient;
    await c.cicloCliente.deleteMany({ where: { id: ticketCicloId } });
    await c.prioridad.deleteMany({ where: { id: ticketPrioridadId } });
    await c.tipoOperacion.deleteMany({ where: { id: ticketOperacionId } });
    await c.estado.deleteMany({ where: { id: ticketEstadoId } });
    await c.tipoTicket.deleteMany({ where: { id: ticketTipoId } });
    await fx.cerrar();
  }, 60_000);

  beforeEach(limpiarTodo);

  /** Tickets de la corrida primero (FK a equipos), después las filas del fixture. */
  async function limpiarTodo(): Promise<void> {
    if (ticketTipoId) {
      const c = fx.tenantClient;
      await c.ticketSoporte.deleteMany({ where: { ticket: { tipoId: ticketTipoId } } });
      await c.operacionTicket.deleteMany({ where: { ticket: { tipoId: ticketTipoId } } });
      await c.ticket.deleteMany({ where: { tipoId: ticketTipoId } });
      await c.solicitanteExterno.deleteMany({ where: { nombre: `${fx.prefijo}externo` } });
    }
    await fx.limpiar();
  }

  // ───────────────────────── Constructores de operaciones ─────────────────────────

  const bajar = (equipoId: string): Operacion => {
    return () =>
      fx.conTenant(() =>
        fx.useCase.execute({
          equipoId,
          destino: 'STOCK_USADO',
          categoria: 'VEJEZ',
          usuarioId: fx.usuarioId,
        }),
      );
  };

  function agregarComponente(): AgregarComponenteUseCase {
    return new AgregarComponenteUseCase(
      fx.equipoRepo,
      fx.componenteRepo,
      fx.insumoRepo,
      new PrismaFamiliaInsumoRepository(fx.tenantContext),
    );
  }

  const instalar = (equipoId: string, insumoId: string, unidadId?: string): Operacion => {
    const familiaRepo = new PrismaFamiliaInsumoRepository(fx.tenantContext);
    const useCase = new InstalarComponenteDesdeDepositoUseCase(
      fx.txRunner,
      agregarComponente(),
      new RegistrarSalidaInsumoUseCase(
        fx.insumoRepo,
        fx.movimientoRepo,
        fx.txRunner,
        familiaRepo,
        fx.operaciones,
      ),
      fx.operaciones,
      fx.componenteRepo,
    );
    return () =>
      fx.conTenant(() =>
        useCase.execute({ equipoId, insumoId, usuarioId: fx.usuarioId, unidadId }),
      );
  };

  const altaSinDescuento = (
    equipoId: string,
    insumoId: string,
    numeroSerie?: string,
  ): Operacion => {
    const useCase = new AgregarComponenteSinDescuentoUseCase(
      fx.txRunner,
      agregarComponente(),
      fx.insumoRepo,
      fx.operaciones,
      fx.componenteRepo,
    );
    return () =>
      fx.conTenant(() =>
        useCase.execute({ equipoId, insumoId, usuarioId: fx.usuarioId, numeroSerie }),
      );
  };

  const crearTicket = (
    equipoId: string,
    extra: Partial<Parameters<CrearTicketSoporteUseCase['execute']>[0]> = {},
  ): Operacion => {
    const useCase = new CrearTicketSoporteUseCase(
      new PrismaTicketRepository(fx.tenantContext),
      new PrismaOperacionTicketRepository(fx.tenantContext),
      new PrismaTicketSoporteRepository(fx.tenantContext),
      { findIdByCodigo: async () => ticketEstadoId },
      {
        findByCodigo: async () =>
          TipoTicketEntity.create(
            { codigo: ticketTipoCodigo, nombre: 'Tipo', modulo: 'EQUIPOS', activo: true },
            ticketTipoId,
          ),
      },
      { findIdByCodigo: async () => ticketOperacionId },
      { existeEnTenant: async () => true },
      new NumeradorTicket(new PrismaTicketRepository(fx.tenantContext)),
      {
        resolver: async () =>
          Result.ok(
            CicloClienteEntity.create(
              {
                cicloVigenteId: randomUUID(),
                nombre: 'Ciclo concurrencia',
                fechaInicio: new Date('2026-01-01'),
                fechaFin: new Date('2026-12-31'),
                activo: true,
              },
              ticketCicloId,
            ),
          ),
      },
      fx.equipoRepo,
      { publish: () => {} },
      fx.txRunner,
    );
    return () =>
      fx.conTenant(() =>
        useCase.execute({
          titulo: 'Ticket concurrente con la baja',
          prioridadId: ticketPrioridadId,
          equipoId,
          solicitanteId: fx.usuarioId,
          clienteId: 'test-cliente-bja',
          autorId: fx.usuarioId,
          anio: 2026,
          ...extra,
        }),
      );
  };

  /** Solicitante externo de la corrida (el ticket externo lo referencia por FK RESTRICT). */
  async function crearExterno(): Promise<string> {
    const externo = await fx.tenantClient.solicitanteExterno.create({
      data: {
        nombre: `${fx.prefijo}externo`,
        email: `${fx.prefijo.toLowerCase()}externo@example.com`,
        emailVerificadoAt: new Date(),
      },
    });
    return externo.id;
  }

  /**
   * Baja y otra operación del mismo equipo, escalonadas sobre su LE. Las iteraciones pares llegan
   * con la baja primero y las impares con la otra primero. Devuelve `[baja, otra]`.
   */
  async function bajaYOtra(equipoId: string, otra: Operacion, iteracion: number) {
    const bajaPrimero = iteracion % 2 === 0;
    const ops = bajaPrimero ? [bajar(equipoId), otra] : [otra, bajar(equipoId)];
    const rs = resultados(await escalonar(fx, LOCK_EQUIPO_BAJA, [equipoId], ops));
    return bajaPrimero ? rs : [rs[1], rs[0]];
  }

  // ───────────────────────── Aserciones de consistencia ─────────────────────────

  /** Un equipo dado de baja no conserva componentes activos ni unidades `INSTALADA`. */
  async function exigirEquipoCoherente(equipoId: string): Promise<boolean> {
    const equipo = await fx.tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    if (equipo.activo) return true;
    expect(
      await fx.tenantClient.componenteEquipo.count({ where: { equipoId, deletedAt: null } }),
    ).toBe(0);
    expect(
      await fx.tenantClient.unidadInsumo.count({ where: { equipoId, estado: 'INSTALADA' } }),
    ).toBe(0);
    return false;
  }

  async function exigirInvariantes(): Promise<void> {
    expect(await fx.exigirInvarianteSerie(fx.serieId)).toEqual([]);
    expect(await fx.exigirInvarianteSerie(fx.serie2Id)).toEqual([]);
  }

  /** Piezas de partida del equipo "E1": una de `NINGUNO` y una unidad `SERIE` instalada. */
  async function equipoConPiezas(i: number) {
    const e1 = await fx.crearEquipo(`E1-${i}`);
    await fx.agregarComponente(e1.id, fx.ningunoId);
    await fx.agregarUnidadInstalada(e1.id, `${fx.prefijo}P${i}`);
    return e1;
  }

  // ───────────────────────── (a) baja vs instalaciones cruzadas ─────────────────────────

  it(
    '(a) baja de E1 contra instalaciones en E2 de los mismos insumos en orden inverso: sin 40P01 y el depósito iguala al libro',
    async () => {
      const [bajo, alto] = [fx.serieId, fx.serie2Id].sort();
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await fx.crearEquipo(`A1-${i}`);
        const e2 = await fx.crearEquipo(`A2-${i}`);
        await fx.agregarUnidadInstalada(e1.id, `${fx.prefijo}A${i}X`, bajo);
        await fx.agregarUnidadInstalada(e1.id, `${fx.prefijo}A${i}Y`, alto);
        const enAlto = await fx.agregarUnidadEnDeposito(`${fx.prefijo}D${i}Y`, alto);
        const enBajo = await fx.agregarUnidadEnDeposito(`${fx.prefijo}D${i}X`, bajo);

        // El externo retiene L1 del insumo más alto: la baja (L1 en orden de id) y la instalación
        // de ese insumo quedan esperándolo; después compiten por L1, L2 y L3 de ambos insumos.
        const salidas = await escalonar(
          fx,
          'SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE',
          [alto],
          [bajar(e1.id), instalar(e2.id, alto, enAlto), instalar(e2.id, bajo, enBajo)],
          undefined,
          2,
        );

        for (const r of resultados(salidas)) {
          expect(r.isOk()).toBe(true);
        }
        for (const insumoId of [bajo, alto]) {
          for (const condicion of ['NUEVO', 'USADO'] as const) {
            const enDeposito = await fx.tenantClient.unidadInsumo.count({
              where: { insumoId, estado: 'EN_DEPOSITO', condicion },
            });
            expect((await fx.saldos(insumoId))[condicion]).toBe(enDeposito);
          }
        }
        expect(await exigirEquipoCoherente(e1.id)).toBe(false);
        await exigirInvariantes();
      });
    },
    TIMEOUT_CASO_MS,
  );

  // ───────────────────────── (b) y (c) baja vs instalar / alta sin descuento ─────────────────────────

  interface Variante {
    nombre: string;
    /** Prepara lo que la operación concurrente necesita y devuelve la operación contra `equipoId`. */
    preparar: (equipoId: string, i: number) => Promise<Operacion>;
    /** Qué deja la operación concurrente si gana (en el equipo, vigente). */
    exigirGanadora: (equipoId: string) => Promise<void>;
  }

  const variantes: Variante[] = [
    {
      nombre: '(b) instalar en el mismo equipo, con unidad',
      preparar: async (equipoId, i) => {
        const unidadId = await fx.agregarUnidadEnDeposito(`${fx.prefijo}B${i}`);
        return instalar(equipoId, fx.serieId, unidadId);
      },
      exigirGanadora: async (equipoId) => {
        expect(
          await fx.tenantClient.unidadInsumo.count({ where: { equipoId, estado: 'INSTALADA' } }),
        ).toBe(2);
      },
    },
    {
      nombre: '(b) instalar en el mismo equipo, con insumo NINGUNO',
      preparar: async (equipoId) => {
        await fx.sembrarSaldo(fx.ningunoId, 'NUEVO', 1);
        return instalar(equipoId, fx.ningunoId);
      },
      exigirGanadora: async (equipoId) => {
        expect(
          await fx.tenantClient.componenteEquipo.count({
            where: { equipoId, insumoId: fx.ningunoId, deletedAt: null },
          }),
        ).toBe(2);
      },
    },
    {
      nombre: '(c) alta sin descuento, con insumo SERIE',
      preparar: async (equipoId, i) => altaSinDescuento(equipoId, fx.serieId, `${fx.prefijo}C${i}`),
      exigirGanadora: async (equipoId) => {
        expect(
          await fx.tenantClient.unidadInsumo.count({ where: { equipoId, estado: 'INSTALADA' } }),
        ).toBe(2);
      },
    },
    {
      nombre: '(c) alta sin descuento, con insumo NINGUNO',
      preparar: async (equipoId) => altaSinDescuento(equipoId, fx.ningunoId),
      exigirGanadora: async (equipoId) => {
        expect(
          await fx.tenantClient.componenteEquipo.count({
            where: { equipoId, insumoId: fx.ningunoId, deletedAt: null },
          }),
        ).toBe(2);
      },
    },
  ];

  it.each(variantes)(
    '$nombre vs baja del mismo equipo: o la baja da 409 y la pieza queda, o la baja retira todo y la entrada da equipo dado de baja',
    async (variante) => {
      let ganoLaBaja = 0;
      let ganoLaEntrada = 0;
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await equipoConPiezas(i);
        const entrada = await variante.preparar(e1.id, i);

        const [baja, alta] = await bajaYOtra(e1.id, entrada, i);

        expect([baja.isOk(), alta.isOk()].filter(Boolean)).toHaveLength(1);
        if (baja.isOk()) {
          ganoLaBaja += 1;
          expect(alta.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
          expect(await exigirEquipoCoherente(e1.id)).toBe(false);
        } else {
          ganoLaEntrada += 1;
          expect(baja.getError()).toBeInstanceOf(EquipoModificadoDuranteLaBajaError);
          expect(await exigirEquipoCoherente(e1.id)).toBe(true);
          await variante.exigirGanadora(e1.id);
        }
        await exigirInvariantes();
      });
      // El orden de llegada alterna: si solo se viera un resultado, el otro camino quedaría sin cubrir.
      console.info(
        `[concurrencia] ${variante.nombre}: baja ${ganoLaBaja}, entrada ${ganoLaEntrada}`,
      );
      expect(ganoLaBaja).toBeGreaterThan(0);
      expect(ganoLaEntrada).toBeGreaterThan(0);
    },
    TIMEOUT_CASO_MS,
  );

  // ───────────────────────── (d) dos bajas del mismo equipo ─────────────────────────

  it(
    '(d) dos bajas simultáneas del mismo equipo: exactamente una se completa, la otra da equipo dado de baja y no hay movimientos duplicados',
    async () => {
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await equipoConPiezas(i);

        const rs = resultados(
          await escalonar(fx, LOCK_EQUIPO_BAJA, [e1.id], [bajar(e1.id), bajar(e1.id)]),
        );

        const [ok, fallo] = rs.sort((a, b) => Number(b.isOk()) - Number(a.isOk()));
        expect(ok.isOk()).toBe(true);
        expect(fallo.isFail()).toBe(true);
        expect(fallo.getError()).toBeInstanceOf(EquipoDadoDeBajaError);
        // Dos piezas: una ENTRADA por pieza, no por baja.
        expect(
          await fx.tenantClient.movimientoInsumo.count({
            where: { equipoId: e1.id, tipo: 'ENTRADA' },
          }),
        ).toBe(2);
        expect(await exigirEquipoCoherente(e1.id)).toBe(false);
        await exigirInvariantes();
      });
    },
    TIMEOUT_CASO_MS,
  );

  // ───────────────────────── (e) baja vs crear ticket ─────────────────────────

  it(
    '(e) baja contra crear un ticket del mismo equipo: o el ticket existe y la baja lo conserva, o el ticket se rechaza (EquipoInvalido)',
    async () => {
      const ticketsRepo = new PrismaTicketSoporteRepository(fx.tenantContext);
      let conTicket = 0;
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await equipoConPiezas(i);

        const [baja, ticket] = await bajaYOtra(e1.id, crearTicket(e1.id), i);

        expect(baja.isOk()).toBe(true);
        const filas = await fx.tenantClient.ticketSoporte.findMany({
          where: { equipoId: e1.id, deletedAt: null },
        });
        if (ticket.isOk()) {
          conTicket += 1;
          expect(filas).toHaveLength(1);
          // El resumen (ticketsAbiertos) lo cuenta: la baja no lo toca.
          expect(await fx.conTenant(() => ticketsRepo.contarAbiertosPorEquipo(e1.id, []))).toBe(1);
        } else {
          expect(ticket.getError()).toBeInstanceOf(EquipoInvalidoError);
          expect(filas).toHaveLength(0);
        }
        expect(await exigirEquipoCoherente(e1.id)).toBe(false);
        await exigirInvariantes();
      });
      console.info(`[concurrencia] (e) crear ticket: ticket creado ${conTicket} de ${ITERACIONES}`);
      // El orden de llegada alterna: ambos caminos (ticket creado / ticket rechazado) quedan cubiertos.
      expect(conTicket).toBeGreaterThan(0);
      expect(conTicket).toBeLessThan(ITERACIONES);
    },
    TIMEOUT_CASO_MS,
  );

  it(
    '(e2) baja contra crear un ticket externo con OMITIR: el ticket siempre se crea; con equipo solo si la baja llegó después, sin equipo si llegó antes',
    async () => {
      let conEquipo = 0;
      let sinEquipo = 0;
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await equipoConPiezas(i);
        const externoId = await crearExterno();

        const [baja, ticket] = await bajaYOtra(
          e1.id,
          crearTicket(e1.id, {
            solicitanteId: null,
            solicitanteExternoId: externoId,
            equipoInvalido: 'OMITIR',
            autorId: AUTOR_FORMULARIO_PUBLICO,
          }),
          i,
        );

        expect(baja.isOk()).toBe(true);
        // OMITIR nunca rechaza: el FOR SHARE se toma primero y decide con el estado ya comiteado.
        expect(ticket.isOk()).toBe(true);
        const filas = await fx.tenantClient.ticketSoporte.findMany({
          where: { ticket: { tipoId: ticketTipoId } },
          include: { ticket: true },
        });
        expect(filas).toHaveLength(1);
        expect(filas[0].ticket.solicitanteId).toBeNull();
        expect(filas[0].ticket.solicitanteExternoId).toBe(externoId);
        if (filas[0].equipoId === null) {
          sinEquipo += 1;
        } else {
          conEquipo += 1;
          expect(filas[0].equipoId).toBe(e1.id);
        }
        expect(await exigirEquipoCoherente(e1.id)).toBe(false);
        await exigirInvariantes();
      });
      console.info(`[concurrencia] (e2) OMITIR: con equipo ${conEquipo}, sin equipo ${sinEquipo}`);
      // El orden de llegada alterna: ambos caminos quedan cubiertos.
      expect(conEquipo).toBeGreaterThan(0);
      expect(sinEquipo).toBeGreaterThan(0);
    },
    TIMEOUT_CASO_MS,
  );

  // ───────────────────────── 409 determinista ─────────────────────────

  it(
    '409: una pieza agregada y comiteada mientras la baja espera el LE hace que la baja dé EquipoModificadoDuranteLaBaja sin escribir nada',
    async () => {
      await repetir(ITERACIONES, async (i) => {
        await limpiarTodo();
        const e1 = await equipoConPiezas(i);
        const antes = await fx.foto();

        // El externo hace de "alta": toma el LE como las altas (FOR SHARE) y agrega la pieza.
        const [baja] = resultados(
          await escalonar(fx, LOCK_EQUIPO_ALTA, [e1.id], [bajar(e1.id)], async (externo) => {
            await externo.query(
              'INSERT INTO componentes_equipo (equipo_id, insumo_id, updated_at) VALUES ($1, $2, now())',
              [e1.id, fx.ningunoId],
            );
          }),
        );

        expect(baja.isFail()).toBe(true);
        expect(baja.getError()).toBeInstanceOf(EquipoModificadoDuranteLaBajaError);
        const despues = await fx.foto();
        expect(despues.movimientos).toBe(antes.movimientos);
        expect(despues.eventos).toBe(antes.eventos);
        expect(despues.unidades).toEqual(antes.unidades);
        expect(despues.equipos).toEqual(antes.equipos);
        // La única diferencia es la pieza nueva, que sigue activa.
        expect(despues.componentes).toHaveLength(antes.componentes.length + 1);
        expect(await exigirEquipoCoherente(e1.id)).toBe(true);
        await exigirInvariantes();
      });
    },
    TIMEOUT_CASO_MS,
  );
});
