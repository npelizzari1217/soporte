/**
 * K5 [INTEGRATION][RED→GREEN] — PrismaKbArticuloRepository contra Postgres
 * REAL.
 *
 * MIGRADO DE TENANT A MASTER: este spec corría contra `soporte_tenant_test` a
 * través de `TenantContext.bind()`. La Ayuda pasó a ser única y global, así que
 * ahora corre contra `soporte_master_test` con el cliente que devuelve
 * `PrismaService.getMasterClient()` — mismo patrón que
 * `prisma-usuario-contacto-resolver.integration.spec.ts`.
 *
 * El primer test es el que sostiene la mudanza: verifica que la fila aterrice
 * en MASTER y no en el tenant. Sin él, un repositorio que volviera a tomar el
 * cliente del `TenantContext` pasaría todos los demás asserts en verde.
 *
 * Verifica además: filtro de visibilidad (`soloVisibles`) + `incluirInactivos`
 * + `busqueda` (ILIKE en `titulo`) + paginación (`page`, `pageSize`, `total`);
 * soft delete excluye de los activos; y que `save()` no pise el `slug` de un
 * artículo sincronizado.
 *
 * Se cayó el caso de `tipoTicketId`: la columna desapareció con la mudanza (era
 * una FK a `tipos_ticket`, tabla del TENANT).
 *
 * Este spec inserta sus PROPIAS filas de fixture (prefijo `K5_TEST_`) para no
 * depender del estado global de la DB compartida, y las limpia al entrar y al
 * salir (idempotente: una corrida que muera a medias no rompe la siguiente).
 *
 * Ref spec: sdd/premium/spec K3, K5. Ref design: ADR-P6. Tarea: K5/K6.
 */
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaKbArticuloRepository } from './prisma-kb-articulo.repository';
import { KbArticuloEntity } from '../../../domain/entities/kb-articulo.entity';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const AUTOR_ID = '019fd788-9acb-72a4-b004-6634da14ad34';
const PREFIJO = 'K5_TEST';

describe('PrismaKbArticuloRepository — Integration (K5, master)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let repo: PrismaKbArticuloRepository;

  let publicoActivoId: string;
  let internoActivoId: string;
  let publicoInactivoId: string;

  /** Idempotente a propósito: sirve para entrar limpio y para salir limpio. */
  async function limpiarFixtures(): Promise<void> {
    await masterClient.kbArticulo.deleteMany({ where: { titulo: { startsWith: PREFIJO } } });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    repo = new PrismaKbArticuloRepository(prismaService);

    await limpiarFixtures();

    const publicoActivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Cómo resetear tu contraseña',
      contenido: 'Pasos...',
      autorId: AUTOR_ID,
      visibleParaSolicitante: true,
      activo: true,
    });
    await repo.save(publicoActivo);
    publicoActivoId = publicoActivo.id;

    const internoActivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Runbook interno de incidentes',
      contenido: 'Solo staff...',
      autorId: AUTOR_ID,
      visibleParaSolicitante: false,
      activo: true,
    });
    await repo.save(internoActivo);
    internoActivoId = internoActivo.id;

    const publicoInactivo = KbArticuloEntity.create({
      titulo: 'K5_TEST Artículo dado de baja',
      contenido: 'Obsoleto...',
      autorId: AUTOR_ID,
      visibleParaSolicitante: true,
      activo: true,
    });
    await repo.save(publicoInactivo);
    await repo.softDelete(publicoInactivo.id);
    publicoInactivoId = publicoInactivo.id;
  }, 30_000);

  afterAll(async () => {
    // Limpiar ANTES de cerrar el cliente: al revés el pool sigue vivo y la
    // limpieza no llega a correr.
    await limpiarFixtures();
    await prismaService.onModuleDestroy();
  }, 30_000);

  // Es EL test de la mudanza: si el repositorio volviera a tomar el cliente del
  // tenant, todos los demás asserts seguirían en verde (leerían y escribirían
  // en la otra base, coherentes entre sí) y solo este fallaría.
  it('[CRITICAL] escribe en la DB MASTER, no en la del tenant', async () => {
    const enMaster = await masterClient.kbArticulo.findUnique({ where: { id: publicoActivoId } });

    expect(enMaster).not.toBeNull();
    expect(enMaster!.titulo).toContain('resetear');
  });

  it('[CRITICAL] save() INSERT + findById() persiste y recupera el artículo', async () => {
    const row = await repo.findById(publicoActivoId);
    expect(row).not.toBeNull();
    expect(row!.titulo).toContain('resetear');
    expect(row!.visibleParaSolicitante).toBe(true);
  });

  it('[CRITICAL] soloVisibles=true excluye artículos internos (visibleParaSolicitante=false)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: true,
      incluirInactivos: false,
      busqueda: PREFIJO,
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).not.toContain(internoActivoId);
  });

  it('[CRITICAL] soloVisibles=false incluye internos (staff)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: PREFIJO,
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).toContain(internoActivoId);
  });

  it('[CRITICAL] incluirInactivos=false excluye soft-deleted/activo=false', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: false,
      busqueda: PREFIJO,
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain(publicoInactivoId);
  });

  it('incluirInactivos=true incluye soft-deleted/activo=false', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: PREFIJO,
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoInactivoId);
  });

  it('busqueda filtra por titulo (case-insensitive substring)', async () => {
    const { items } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: 'RESETEAR',
      page: 1,
      pageSize: 50,
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain(publicoActivoId);
    expect(ids).not.toContain(internoActivoId);
  });

  it('[CRITICAL] pagina resultados y retorna total correcto', async () => {
    const { items, total } = await repo.findAll({
      soloVisibles: false,
      incluirInactivos: true,
      busqueda: PREFIJO,
      page: 1,
      pageSize: 2,
    });
    expect(items).toHaveLength(2);
    expect(total).toBe(3);
  });

  it('softDelete() setea deletedAt + activo=false', async () => {
    const articulo = KbArticuloEntity.create({
      titulo: 'K5_TEST temporal para softDelete',
      contenido: 'x',
      autorId: AUTOR_ID,
      visibleParaSolicitante: false,
      activo: true,
    });
    await repo.save(articulo);

    await repo.softDelete(articulo.id);

    const row = await masterClient.kbArticulo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.activo).toBe(false);

    await masterClient.kbArticulo.deleteMany({ where: { id: articulo.id } });
  });

  // REGRESIÓN: `slug` es la identidad de los artículos que mantiene el sync
  // desde el repositorio, y el dominio no lo conoce. Si `toPersistence` lo
  // incluyera, el UPDATE del upsert lo pisaría con NULL en cuanto alguien
  // editara el artículo desde la aplicación, y la corrida siguiente del sync
  // lo insertaría de nuevo, duplicado — exactamente lo que el slug evita.
  it('[CRITICAL] save() sobre un artículo sincronizado NO borra su slug', async () => {
    const articulo = KbArticuloEntity.create({
      titulo: 'K5_TEST artículo sincronizado',
      contenido: 'Contenido original',
      autorId: null,
      visibleParaSolicitante: false,
      activo: true,
    });
    await repo.save(articulo);
    await masterClient.kbArticulo.update({
      where: { id: articulo.id },
      data: { slug: 'k5-test-articulo-sincronizado' },
    });

    articulo.editar({ titulo: 'K5_TEST artículo sincronizado (editado)' });
    await repo.save(articulo);

    const row = await masterClient.kbArticulo.findUniqueOrThrow({ where: { id: articulo.id } });
    expect(row.slug).toBe('k5-test-articulo-sincronizado');
    expect(row.titulo).toBe('K5_TEST artículo sincronizado (editado)');

    await masterClient.kbArticulo.deleteMany({ where: { id: articulo.id } });
  });
});
