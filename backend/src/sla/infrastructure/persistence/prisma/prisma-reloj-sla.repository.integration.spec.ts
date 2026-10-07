/**
 * [INTEGRATION] WU-3b (sdd/sla-primera-respuesta-y-pausa, sla-reloj-activo R1, R4): PrismaRelojSlaRepository
 * contra Postgres REAL (`soporte_tenant_test`). Siembra si faltan los estados y el tipo `CAMBIO_ESTADO` que usa (y borra solo los que creó);
 * crea solo un tipo de ticket, una prioridad y tickets propios, y los borra al final.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaRelojSlaRepository } from './prisma-reloj-sla.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';
const USUARIO = '01900000-0000-7000-8000-000000000001';
const T0 = new Date('2026-08-10T12:00:00.000Z');
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe('PrismaRelojSlaRepository — Integration (WU-3b)', () => {
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaRelojSlaRepository;
  let tipoId: string;
  let prioridadId: string;
  let otraPrioridadId: string;
  let estados: Record<string, string>;
  let tipoOpId: string;
  const creados: Array<() => Promise<unknown>> = [];
  let contador = 0;

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({ prismaClient: client, dbName: TENANT_TEST_DB_NAME, clienteId: 'wu3b' });
    repo = new PrismaRelojSlaRepository(tenantContext);
    // Residuo de una corrida abortada. `WU3BC*` es del spec de consolidación y no se barre.
    const propios = { codigo: { startsWith: 'WU3B', not: { startsWith: 'WU3BC' } } };
    await client.operacionTicket.deleteMany({ where: { ticket: { tipo: propios } } });
    await client.ticket.deleteMany({ where: { tipo: propios } });
    await client.tipoTicket.deleteMany({ where: propios });
    await client.prioridad.deleteMany({ where: { codigo: { startsWith: 'WU3BP' } } });
    const s = randomBytes(3).toString('hex');
    tipoId = (
      await client.tipoTicket.create({
        data: { codigo: `WU3B${s}`, nombre: 'WU3b', activo: true, modulo: 'SOPORTE' },
      })
    ).id;
    prioridadId = (
      await client.prioridad.create({
        data: { codigo: `WU3BP${s}`, nombre: 'WU3b', orden: 1, activo: true },
      })
    ).id;
    otraPrioridadId = (
      await client.prioridad.create({
        data: { codigo: `WU3BP2${s}`, nombre: 'WU3b otra', orden: 2, activo: true },
      })
    ).id;
    // Catálogos que el spec necesita: se crean solo si faltan (una base nueva no los trae) y al
    // terminar se borran únicamente los que creó este spec.
    for (const [codigo, orden] of [
      ['EN_PROCESO', 30],
      ['ESPERANDO_CLIENTE', 35],
    ] as const) {
      const previo = await client.estado.findUnique({ where: { codigo } });
      if (!previo) {
        const e = await client.estado.create({
          data: { codigo, nombre: codigo, orden, activo: true },
        });
        creados.push(() => client.estado.delete({ where: { id: e.id } }));
      }
    }
    const filas = await client.estado.findMany({
      where: { codigo: { in: ['EN_PROCESO', 'ESPERANDO_CLIENTE'] } },
    });
    estados = Object.fromEntries(filas.map((e) => [e.codigo, e.id]));
    const tipoOp = await client.tipoOperacion.findUnique({ where: { codigo: 'CAMBIO_ESTADO' } });
    if (tipoOp) {
      tipoOpId = tipoOp.id;
    } else {
      const t = await client.tipoOperacion.create({
        data: { codigo: 'CAMBIO_ESTADO', nombre: 'CAMBIO_ESTADO' },
      });
      tipoOpId = t.id;
      creados.push(() => client.tipoOperacion.delete({ where: { id: t.id } }));
    }
  }, 30_000);

  afterAll(async () => {
    await client.operacionTicket.deleteMany({ where: { ticket: { tipoId } } });
    await client.ticket.deleteMany({ where: { tipoId } });
    await client.tipoTicket.delete({ where: { id: tipoId } });
    await client.prioridad.deleteMany({ where: { id: { in: [prioridadId, otraPrioridadId] } } });
    for (const borrar of creados.reverse()) await borrar();
    await prismaService.onModuleDestroy();
  }, 30_000);

  async function crearTicket(over: { deletedAt?: Date } = {}): Promise<string> {
    contador += 1;
    return (
      await client.ticket.create({
        data: {
          numero: `W3B-${randomBytes(3).toString('hex')}-${contador}`,
          titulo: 'Ticket WU-3b',
          tipoId,
          estadoId: estados.EN_PROCESO,
          prioridadId,
          solicitanteId: USUARIO,
          ...over,
        },
      })
    ).id;
  }

  const crearOp = (ticketId: string, nuevo: string, createdAt: Date, slaRelojSeq: number | null) =>
    client.operacionTicket.create({
      data: {
        ticketId,
        tipoOperacionId: tipoOpId,
        autorId: USUARIO,
        estadoNuevoId: estados[nuevo],
        estadoAnteriorId: estados.EN_PROCESO,
        createdAt,
        slaRelojSeq,
      },
    });

  it('transicionesDesde ordena por sla_reloj_seq y no por created_at', async () => {
    const id = await crearTicket();
    await crearOp(id, 'ESPERANDO_CLIENTE', min(30), 1);
    await crearOp(id, 'EN_PROCESO', min(20), 2);
    await crearOp(id, 'ESPERANDO_CLIENTE', min(10), 3);

    const todas = await repo.transicionesDesde(id, 0);

    expect(todas.map((t) => t.createdAt)).toEqual([min(30), min(20), min(10)]);
    expect(todas[0].estadoNuevoCodigo).toBe('ESPERANDO_CLIENTE');
    expect(todas[0].estadoAnteriorCodigo).toBe('EN_PROCESO');
  });

  it('una transición con created_at anterior que comitea después del pliegue entra en el siguiente (seq > cursor)', async () => {
    const id = await crearTicket();
    await crearOp(id, 'ESPERANDO_CLIENTE', min(30), 1); // B: pliegue exitoso, cursor = 1
    await crearOp(id, 'EN_PROCESO', min(5), 2); // A: created_at anterior, seq mayor

    const siguiente = await repo.transicionesDesde(id, 1);

    expect(siguiente.map((t) => t.createdAt)).toEqual([min(5)]);
  });

  it('historialSinSecuencia devuelve solo las operaciones sin secuencia, por created_at', async () => {
    const id = await crearTicket();
    await crearOp(id, 'EN_PROCESO', min(20), null);
    await crearOp(id, 'ESPERANDO_CLIENTE', min(10), null);
    await crearOp(id, 'EN_PROCESO', min(1), 1);

    const historial = await repo.historialSinSecuencia(id);

    expect(historial.map((t) => t.createdAt)).toEqual([min(10), min(20)]);
  });

  it('guardarSiVersion con versión vieja devuelve false y no escribe; con la vigente escribe, fija el cursor y limpia el pendiente', async () => {
    const id = await crearTicket();
    await client.ticket.update({
      where: { id },
      data: { slaRelojVersion: 2, slaRelojPendiente: true },
    });
    const reloj = { acumuladoS: 3600, metaS: 7200, correDesde: min(5), cumplido: null };

    expect(await repo.guardarSiVersion(id, 1, reloj)).toBe(false);
    let fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.slaRelojPendiente).toBe(true);
    expect(fila.slaAcumuladoS).toBe(0);

    expect(await repo.guardarSiVersion(id, 2, reloj)).toBe(true);
    fila = await client.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila).toMatchObject({
      slaAcumuladoS: 3600,
      slaMetaS: 7200,
      slaRelojSeqHasta: 2,
      slaRelojPendiente: false,
    });
    expect(fila.slaCorreDesde).toEqual(min(5));
  });

  it('guardarSiVersion sin slaVenceAt en el resultado no pisa el vencimiento', async () => {
    const id = await crearTicket();
    await client.ticket.update({ where: { id }, data: { slaVenceAt: min(99) } });

    await repo.guardarSiVersion(id, 0, {
      acumuladoS: 0,
      metaS: null,
      correDesde: null,
      cumplido: null,
    });

    expect((await client.ticket.findUniqueOrThrow({ where: { id } })).slaVenceAt).toEqual(min(99));
  });

  it('leer devuelve el reloj con el código del estado, y null para un borrado; findPendientes lista los pendientes', async () => {
    const id = await crearTicket();
    const borrado = await crearTicket({ deletedAt: min(1) });
    await client.ticket.updateMany({
      where: { id: { in: [id, borrado] } },
      data: { slaRelojPendiente: true },
    });

    expect(await repo.leer(id)).toMatchObject({
      ticketId: id,
      estadoCodigo: 'EN_PROCESO',
      version: 0,
    });
    expect(await repo.leer(borrado)).toBeNull();
    const pendientes = await repo.findPendientes();
    expect(pendientes).toContain(id);
    expect(pendientes).not.toContain(borrado);
  });

  describe('marca de meta pendiente (issue #429)', () => {
    const reloj = { acumuladoS: 0, metaS: 7200, correDesde: min(5), cumplido: null };
    const marca = async (id: string) =>
      (await client.ticket.findUniqueOrThrow({ where: { id } })).slaMetaPendiente;

    it('con la prioridad aplicada igual a la vigente, el CAS escribe y limpia la marca en la misma escritura', async () => {
      const id = await crearTicket();
      await client.ticket.update({ where: { id }, data: { slaMetaPendiente: true } });

      expect(await repo.guardarSiVersion(id, 0, reloj, { prioridadAplicadaId: prioridadId })).toBe(
        true,
      );

      expect(await marca(id)).toBe(false);
      expect((await client.ticket.findUniqueOrThrow({ where: { id } })).slaMetaS).toBe(7200);
    });

    it('con una prioridad aplicada distinta de la vigente (repriorizaron en el medio) no escribe y la marca sigue puesta', async () => {
      const id = await crearTicket();
      await client.ticket.update({
        where: { id },
        data: { slaMetaPendiente: true, prioridadId: otraPrioridadId },
      });

      expect(await repo.guardarSiVersion(id, 0, reloj, { prioridadAplicadaId: prioridadId })).toBe(
        false,
      );

      expect(await marca(id)).toBe(true);
      expect((await client.ticket.findUniqueOrThrow({ where: { id } })).slaMetaS).toBeNull();
    });

    it('sin prioridad aplicada (consolidación del pendiente del reloj) no toca la marca', async () => {
      const id = await crearTicket();
      await client.ticket.update({ where: { id }, data: { slaMetaPendiente: true } });

      expect(await repo.guardarSiVersion(id, 0, reloj)).toBe(true);

      expect(await marca(id)).toBe(true);
    });

    describe('rearme del aviso de vencido (issue #432)', () => {
      const vencido = async (id: string) =>
        (await client.ticket.findUniqueOrThrow({ where: { id } })).vencido;
      const conVencido = async () => {
        const id = await crearTicket();
        await client.ticket.update({ where: { id }, data: { vencido: true } });
        return id;
      };

      it('con rearmarVencido la misma escritura del CAS baja vencido', async () => {
        const id = await conVencido();
        const futuro = { ...reloj, slaVenceAt: min(600) };

        expect(
          await repo.guardarSiVersion(id, 0, futuro, {
            prioridadAplicadaId: prioridadId,
            rearmarVencido: true,
          }),
        ).toBe(true);

        expect(await vencido(id)).toBe(false);
        expect((await client.ticket.findUniqueOrThrow({ where: { id } })).slaVenceAt).toEqual(
          min(600),
        );
      });

      it('sin rearmarVencido (vencimiento aun pasado) la marca permanece', async () => {
        const id = await conVencido();

        await repo.guardarSiVersion(
          id,
          0,
          { ...reloj, slaVenceAt: min(-600) },
          { prioridadAplicadaId: prioridadId, rearmarVencido: false },
        );

        expect(await vencido(id)).toBe(true);
      });

      it('una escritura sin meta (consolidacion) nunca toca vencido', async () => {
        const id = await conVencido();

        await repo.guardarSiVersion(id, 0, { ...reloj, slaVenceAt: min(600) });

        expect(await vencido(id)).toBe(true);
      });

      it('un CAS perdido no rearma', async () => {
        const id = await conVencido();

        expect(
          await repo.guardarSiVersion(id, 7, reloj, {
            prioridadAplicadaId: prioridadId,
            rearmarVencido: true,
          }),
        ).toBe(false);

        expect(await vencido(id)).toBe(true);
      });
    });

    it('findMetaPendiente lista solo los marcados y no borrados', async () => {
      const marcado = await crearTicket();
      const borrado = await crearTicket({ deletedAt: min(1) });
      const sinMarca = await crearTicket();
      await client.ticket.updateMany({
        where: { id: { in: [marcado, borrado] } },
        data: { slaMetaPendiente: true },
      });

      const ids = await repo.findMetaPendiente();

      expect(ids).toContain(marcado);
      expect(ids).not.toContain(borrado);
      expect(ids).not.toContain(sinMarca);
    });

    it('limpiarMetaPendiente baja la marca sin tocar el resto del reloj', async () => {
      const id = await crearTicket();
      await client.ticket.update({
        where: { id },
        data: { slaMetaPendiente: true, slaRelojPendiente: true },
      });

      await repo.limpiarMetaPendiente(id);

      const fila = await client.ticket.findUniqueOrThrow({ where: { id } });
      expect(fila.slaMetaPendiente).toBe(false);
      expect(fila.slaRelojPendiente).toBe(true);
    });
  });
});
