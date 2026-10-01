/**
 * Fixtures de integración de la baja de equipo completo (baja-equipo-completo, WU-9).
 *
 * Arma, sobre `soporte_tenant_test` con un PREFIJO por corrida (nunca la base de un tenant real), el
 * wiring REAL de `DarDeBajaEquipoUseCase` (repositorios Prisma, runner de transacciones, entrada
 * y operaciones de unidades) más los insumos de las pruebas: `NINGUNO`, `SERIE`, deshabilitado y
 * con baja lógica. Expone constructores de piezas (con y sin unidad, legados) y el invariante
 * `SERIE`, que cada caso llama al terminar.
 *
 * Higiene: `limpiar()` borra filas entre casos; `cerrar()` borra todo y recién después cierra el
 * pool (al revés, el DROP/cierre falla en silencio). No toca `soporte_master_test`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { conUtc } from '../../shared/infrastructure/persistence/utc-connection-string';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';
import { calcularSaldos } from '../../insumos/domain/entities/tipo-movimiento-insumo';
import { PrismaEventoUnidadInsumoRepository } from '../../insumos/infrastructure/persistence/prisma/prisma-evento-unidad-insumo.repository';
import { PrismaFamiliaInsumoRepository } from '../../insumos/infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import { PrismaInsumoRepository } from '../../insumos/infrastructure/persistence/prisma/prisma-insumo.repository';
import { PrismaMovimientoInsumoRepository } from '../../insumos/infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from '../../insumos/infrastructure/persistence/prisma/prisma-unidad-insumo.repository';
import { leerYVerificarInvarianteSerie } from '../../insumos/testing/invariante-serie';
import { construirEntradaReal } from '../../insumos/testing/entrada-insumo-real';
import { construirOperacionesReal } from '../../insumos/testing/operaciones-unidad-real';
import { PrismaComponenteEquipoRepository } from '../infrastructure/persistence/prisma/prisma-componente-equipo.repository';
import { PrismaEquipoInformaticoRepository } from '../infrastructure/persistence/prisma/prisma-equipo-informatico.repository';
import { DarDeBajaEquipoUseCase } from '../application/use-cases/dar-de-baja-equipo.use-case';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

export const USUARIO_BAJA = '01900000-0000-7000-8000-000000000491';

/** Foto de todo lo que una baja puede escribir; dos fotos iguales ⇒ no cambió nada. */
export interface FotoDeBaja {
  movimientos: number;
  eventos: number;
  unidades: string[];
  componentes: string[];
  equipos: string[];
}

export class BajaEquipoFixtures {
  readonly prefijo = `BJA_${randomBytes(2).toString('hex')}_`;
  readonly usuarioId = USUARIO_BAJA;

  private readonly prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
  /** Pool compartido: los testigos de locks lo usan para sus clientes externos. */
  readonly pool: Pool;
  readonly tenantClient: InstanceType<typeof TenantPrismaClient>;
  readonly tenantContext = new TenantContext();
  readonly txRunner: PrismaTenantTransactionRunner;

  readonly equipoRepo: PrismaEquipoInformaticoRepository;
  readonly componenteRepo: PrismaComponenteEquipoRepository;
  readonly insumoRepo: PrismaInsumoRepository;
  readonly movimientoRepo: PrismaMovimientoInsumoRepository;
  readonly unidadRepo: PrismaUnidadInsumoRepository;
  readonly eventoRepo: PrismaEventoUnidadInsumoRepository;
  readonly registrarEntrada: ReturnType<typeof construirEntradaReal>;
  readonly operaciones: ReturnType<typeof construirOperacionesReal>;
  readonly useCase: DarDeBajaEquipoUseCase;

  serieId = '';
  ningunoId = '';
  deshabilitadoId = '';
  borradoId = '';

  private constructor() {
    this.pool = conUtc(this.prismaServiceParaUrl.buildTenantUrl(TENANT_TEST_DB_NAME), { max: 6 });
    this.tenantClient = new TenantPrismaClient({ adapter: new PrismaPg(this.pool) });
    this.txRunner = new PrismaTenantTransactionRunner(this.tenantContext, { error: () => {} });
    this.equipoRepo = new PrismaEquipoInformaticoRepository(this.tenantContext);
    this.componenteRepo = new PrismaComponenteEquipoRepository(this.tenantContext);
    this.insumoRepo = new PrismaInsumoRepository(this.tenantContext);
    this.movimientoRepo = new PrismaMovimientoInsumoRepository(this.tenantContext);
    this.unidadRepo = new PrismaUnidadInsumoRepository(this.tenantContext);
    this.eventoRepo = new PrismaEventoUnidadInsumoRepository(this.tenantContext);
    const familiaRepo = new PrismaFamiliaInsumoRepository(this.tenantContext);
    this.registrarEntrada = construirEntradaReal({
      tenantContext: this.tenantContext,
      txRunner: this.txRunner,
      insumoRepo: this.insumoRepo,
      movimientoRepo: this.movimientoRepo,
      familiaRepo,
    });
    this.operaciones = construirOperacionesReal({
      tenantContext: this.tenantContext,
      insumoRepo: this.insumoRepo,
      movimientoRepo: this.movimientoRepo,
    });
    this.useCase = new DarDeBajaEquipoUseCase(
      this.txRunner,
      this.equipoRepo,
      this.componenteRepo,
      this.registrarEntrada,
      this.operaciones,
    );
  }

  /** Crea el wiring y los insumos de prueba (llamar desde `beforeAll`). */
  static async crear(): Promise<BajaEquipoFixtures> {
    const f = new BajaEquipoFixtures();
    const familia = await f.tenantClient.familiaInsumo.create({
      data: { codigo: `${f.prefijo}F`, nombre: 'Familia baja equipo', esRepuesto: true },
    });
    const unidadMedida = await f.tenantClient.unidadMedida.create({
      data: { codigo: `${f.prefijo}U`, nombre: 'Entera baja equipo', entera: true },
    });
    const crearInsumo = async (
      sufijo: string,
      extra: { seguimiento?: string; activo?: boolean; deletedAt?: Date },
    ) =>
      (
        await f.tenantClient.insumo.create({
          data: {
            codigo: `${f.prefijo}${sufijo}`,
            nombre: `Repuesto ${sufijo} baja equipo`,
            familiaId: familia.id,
            unidadMedidaId: unidadMedida.id,
            ...extra,
          },
        })
      ).id;
    f.serieId = await crearInsumo('S', { seguimiento: 'SERIE' });
    f.ningunoId = await crearInsumo('N', {});
    f.deshabilitadoId = await crearInsumo('D', { activo: false });
    f.borradoId = await crearInsumo('B', { deletedAt: new Date('2026-01-01T00:00:00Z') });
    return f;
  }

  get todosLosInsumos(): string[] {
    return [this.serieId, this.ningunoId, this.deshabilitadoId, this.borradoId];
  }

  conTenant<T>(fn: () => Promise<T>): Promise<T> {
    return this.tenantContext.run(
      {
        prismaClient: this.tenantClient,
        dbName: TENANT_TEST_DB_NAME,
        clienteId: 'test-cliente-bja',
      },
      fn,
    );
  }

  /** Crea un equipo vigente con el prefijo de la corrida (el nombre guardado lo incluye). */
  async crearEquipo(nombre = 'EQ'): Promise<{ id: string; nombre: string }> {
    const fila = await this.tenantClient.equipoInformatico.create({
      data: { nombre: `${this.prefijo}${nombre}` },
    });
    return { id: fila.id, nombre: fila.nombre };
  }

  /** Componente activo de un insumo sin seguimiento por serie (o legado, si el insumo es `SERIE`). */
  async agregarComponente(equipoId: string, insumoId: string): Promise<string> {
    return (await this.tenantClient.componenteEquipo.create({ data: { equipoId, insumoId } })).id;
  }

  /**
   * Alta de una unidad `SERIE` por entrada y su instalación en el equipo: queda `INSTALADA`, con su
   * componente activo vinculado.
   */
  async agregarUnidadInstalada(
    equipoId: string,
    serial: string,
  ): Promise<{ componenteId: string; unidadId: string }> {
    const alta = await this.conTenant(() =>
      this.registrarEntrada.execute({
        insumoId: this.serieId,
        cantidad: 1,
        usuarioId: this.usuarioId,
        seriales: [serial],
      }),
    );
    if (alta.isFail()) throw alta.getError();
    const unidad = await this.tenantClient.unidadInsumo.findFirstOrThrow({
      where: { insumoId: this.serieId, numeroSerie: serial },
    });
    const componenteId = randomUUID();
    const instalada = await this.conTenant(() =>
      this.txRunner.run(() =>
        this.operaciones.instalar([{ unidadId: unidad.id, equipoId, componenteId }], {
          usuarioId: this.usuarioId,
        }),
      ),
    );
    if (instalada.isFail()) throw instalada.getError();
    await this.tenantClient.componenteEquipo.create({
      data: { id: componenteId, equipoId, insumoId: this.serieId, unidadId: unidad.id },
    });
    return { componenteId, unidadId: unidad.id };
  }

  /** Unidad `SERIE` ya existente en el depósito (alta por entrada), sin instalar. */
  async agregarUnidadEnDeposito(serial: string): Promise<string> {
    const alta = await this.conTenant(() =>
      this.registrarEntrada.execute({
        insumoId: this.serieId,
        cantidad: 1,
        usuarioId: this.usuarioId,
        seriales: [serial],
      }),
    );
    if (alta.isFail()) throw alta.getError();
    return (
      await this.tenantClient.unidadInsumo.findFirstOrThrow({
        where: { insumoId: this.serieId, numeroSerie: serial },
      })
    ).id;
  }

  /** Saldos `NUEVO` y `USADO` del libro de un insumo. */
  async saldos(insumoId: string): Promise<{ NUEVO: number; USADO: number }> {
    const sumas = await this.conTenant(() => this.movimientoRepo.sumByTipo(insumoId));
    const { NUEVO, USADO } = calcularSaldos(sumas);
    return { NUEVO, USADO };
  }

  /** ENTRADA `USADO` previa, para fijar un saldo de partida. */
  async sembrarSaldo(insumoId: string, condicion: 'NUEVO' | 'USADO', cantidad: number) {
    await this.tenantClient.movimientoInsumo.create({
      data: { insumoId, tipo: 'ENTRADA', condicion, cantidad, usuarioId: this.usuarioId },
    });
  }

  /** Foto de lo que una baja podría escribir, para afirmar "nada cambió". */
  async foto(): Promise<FotoDeBaja> {
    const enInsumos = { insumoId: { in: this.todosLosInsumos } };
    const enEquipos = { nombre: { startsWith: this.prefijo } };
    return {
      movimientos: await this.tenantClient.movimientoInsumo.count({ where: enInsumos }),
      eventos: await this.tenantClient.eventoUnidadInsumo.count({ where: { unidad: enInsumos } }),
      unidades: (
        await this.tenantClient.unidadInsumo.findMany({
          where: enInsumos,
          orderBy: { numeroSerie: 'asc' },
        })
      ).map((u) => `${u.numeroSerie}:${u.estado}:${u.condicion}:${u.equipoId}`),
      componentes: (
        await this.tenantClient.componenteEquipo.findMany({
          where: { equipo: enEquipos },
          orderBy: { id: 'asc' },
        })
      ).map((c) => `${c.id}:${c.deletedAt}:${c.bajaDestino}:${c.bajaMovimientoId}`),
      equipos: (
        await this.tenantClient.equipoInformatico.findMany({
          where: enEquipos,
          orderBy: { id: 'asc' },
        })
      ).map((e) => `${e.id}:${e.activo}:${e.bajaDestino}:${e.deletedAt}`),
    };
  }

  /** Invariante del insumo `SERIE`: se llama tras CADA caso. */
  async exigirInvarianteSerie(): Promise<string[]> {
    return this.conTenant(() =>
      leerYVerificarInvarianteSerie(
        {
          unidadRepo: this.unidadRepo,
          movimientoRepo: this.movimientoRepo,
          eventoRepo: this.eventoRepo,
        },
        this.serieId,
      ),
    );
  }

  /** Borra las filas de los casos, en el orden de las FK; deja los insumos. */
  async limpiar(): Promise<void> {
    const enInsumos = { insumoId: { in: this.todosLosInsumos } };
    await this.tenantClient.componenteEquipo.deleteMany({
      where: { equipo: { nombre: { startsWith: this.prefijo } } },
    });
    await this.tenantClient.eventoUnidadInsumo.deleteMany({ where: { unidad: enInsumos } });
    await this.tenantClient.movimientoInsumo.deleteMany({ where: enInsumos });
    await this.tenantClient.unidadInsumo.deleteMany({ where: enInsumos });
    await this.tenantClient.equipoInformatico.deleteMany({
      where: { nombre: { startsWith: this.prefijo } },
    });
  }

  /** Borra todo y cierra las conexiones (llamar desde `afterAll`). */
  async cerrar(): Promise<void> {
    await this.limpiar();
    await this.tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: this.prefijo } } });
    await this.tenantClient.familiaInsumo.deleteMany({
      where: { codigo: { startsWith: this.prefijo } },
    });
    await this.tenantClient.unidadMedida.deleteMany({
      where: { codigo: { startsWith: this.prefijo } },
    });
    await this.tenantClient.$disconnect();
    await this.pool.end().catch(() => undefined);
    await this.prismaServiceParaUrl.onModuleDestroy();
  }
}
