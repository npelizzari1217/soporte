/**
 * [INTEGRATION] `PrismaInsumoRepository` contra Postgres REAL
 * (`soporte_tenant_test`).
 *
 * Fixtures prefijados `INS_<hex>_` sobre el CÓDIGO del insumo y sobre el de
 * sus códigos alternativos (mismo patrón que
 * `prisma-modelo-equipo.repository.integration.spec.ts`): la DB de test es
 * COMPARTIDA, así que la limpieza va acotada por ese prefijo — nunca un
 * TRUNCATE global. El prefijo en los códigos alternativos no es cosmético: su
 * UNIQUE `(codigo, fabricante)` es GLOBAL al tenant, así que dos corridas
 * solapadas chocarían entre sí sin él.
 *
 * Este spec NO toca `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaInsumoRepository } from './prisma-insumo.repository';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoEntity } from '../../../domain/entities/insumo-codigo-alternativo.entity';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';
const TENANT_TEST_DB_NAME = 'soporte_tenant_test';

describe('PrismaInsumoRepository — Integration', () => {
  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let repo: PrismaInsumoRepository;

  /** Prefijo único por corrida: dos procesos en paralelo no se pisan. */
  const PREFIJO = `INS_${randomBytes(2).toString('hex')}_`;

  let familiaId: string;
  let unidadMedidaId: string;

  /** Borra los insumos de esta corrida; sus códigos alternativos caen por `ON DELETE CASCADE`. */
  async function limpiarInsumos(): Promise<void> {
    await tenantClient.insumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
  }

  function construirInsumo(
    sufijo: string,
    codigosAlternativos: InsumoCodigoAlternativoEntity[] = [],
    stockMinimo: number | null = null,
  ): InsumoEntity {
    return InsumoEntity.create({
      codigo: `${PREFIJO}${sufijo}`,
      nombre: `Insumo ${sufijo}`,
      familiaId,
      unidadMedidaId,
      stockMinimo,
      activo: true,
      codigosAlternativos,
      compatibilidad: [],
    });
  }

  beforeAll(async () => {
    prismaService = new PrismaService(TENANT_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_TEST_DB_NAME);
    const tenantContext = new TenantContext();
    tenantContext.bind({
      prismaClient: tenantClient,
      dbName: TENANT_TEST_DB_NAME,
      clienteId: 'test-cliente-insumos',
    });
    repo = new PrismaInsumoRepository(tenantContext);

    // `familia_id` y `unidad_medida_id` son FK con ON DELETE RESTRICT: sin
    // estas dos filas ningún insumo entra.
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${PREFIJO}F`, nombre: 'Familia de prueba' },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${PREFIJO}U`, nombre: 'Unidad de prueba' },
    });
    familiaId = familia.id;
    unidadMedidaId = unidad.id;
  });

  // Orden obligado: primero los insumos, después los catálogos a los que
  // referencian. Al revés, el RESTRICT de la FK rechaza el borrado.
  afterAll(async () => {
    await limpiarInsumos();
    await tenantClient.familiaInsumo.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await tenantClient.unidadMedida.deleteMany({ where: { codigo: { startsWith: PREFIJO } } });
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await limpiarInsumos();
  });

  it('save() + findById() hacen round-trip del agregado con sus códigos alternativos', async () => {
    const insumo = construirInsumo(
      'RT',
      [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}CE285A`, fabricante: 'HP' }),
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}GEN`, fabricante: null }),
      ],
      7.5,
    );

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(found).not.toBeNull();
    expect(found!.codigo).toBe(`${PREFIJO}RT`);
    expect(found!.nombre).toBe('Insumo RT');
    expect(found!.familiaId).toBe(familiaId);
    expect(found!.unidadMedidaId).toBe(unidadMedidaId);
    expect(found!.activo).toBe(true);

    const codigos = [...found!.codigosAlternativos].sort((a, b) =>
      a.codigo.localeCompare(b.codigo),
    );
    expect(codigos).toHaveLength(2);
    expect(codigos[0]!.codigo).toBe(`${PREFIJO}CE285A`);
    expect(codigos[0]!.fabricante).toBe('HP');
    expect(codigos[1]!.codigo).toBe(`${PREFIJO}GEN`);
    expect(codigos[1]!.fabricante).toBeNull();
  });

  it('findById() retorna null para un id inexistente', async () => {
    const found = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(found).toBeNull();
  });

  /**
   * `stock_minimo` es `DECIMAL(10,2)`: sale de la base como `Prisma.Decimal`,
   * un OBJETO. Se assertea el TIPO además del valor porque `toBe(12.34)`
   * contra un `Decimal` fallaría, pero un `toEqual` no distinguiría los dos.
   */
  it('save() + findById() preservan el stockMinimo con decimales, como number', async () => {
    const insumo = construirInsumo('DEC', [], 12.34);

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(typeof found!.stockMinimo).toBe('number');
    expect(found!.stockMinimo).toBe(12.34);
  });

  /**
   * Hermano invertido del caso de arriba: `null` es "sin punto de reposición",
   * no cero. Un `Number(null)` en el mapper lo convertiría en un insumo que
   * avisa recién al llegar a cero unidades.
   */
  it('save() + findById() preservan el stockMinimo nulo sin volverlo cero', async () => {
    const insumo = construirInsumo('NUL', [], null);

    await repo.save(insumo);
    const found = await repo.findById(insumo.id);

    expect(found!.stockMinimo).toBeNull();
  });

  /**
   * La capa de aplicación se toma el trabajo de REUTILIZAR la entidad
   * existente para conservar su id y su `createdAt`. Un `deleteMany` ciego
   * seguido de `create` en el repositorio tiraría ese trabajo a la basura sin
   * que ningún test de la capa de aplicación se enterara: el agregado volvería
   * con otros ids y otra fecha de alta en cada guardado.
   */
  it('save() reguardado conserva el id y el createdAt del código alternativo que no cambió', async () => {
    const conservado = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}CONSERVADO`,
      fabricante: 'HP',
    });
    const insumo = construirInsumo('REUSO', [conservado]);
    await repo.save(insumo);

    const primeraLectura = await repo.findById(insumo.id);
    const createdAtOriginal = primeraLectura!.codigosAlternativos[0]!.createdAt;

    insumo.actualizar({ nombre: 'Insumo REUSO renombrado' });
    insumo.reemplazarCodigosAlternativos([
      conservado,
      InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}NUEVO`, fabricante: 'HP' }),
    ]);
    await repo.save(insumo);

    const segundaLectura = await repo.findById(insumo.id);
    const fila = segundaLectura!.codigosAlternativos.find((c) => c.id === conservado.id);

    expect(segundaLectura!.nombre).toBe('Insumo REUSO renombrado');
    expect(segundaLectura!.codigosAlternativos).toHaveLength(2);
    expect(fila).toBeDefined();
    expect(fila!.codigo).toBe(`${PREFIJO}CONSERVADO`);
    expect(fila!.createdAt).toEqual(createdAtOriginal);
  });

  /**
   * La lista que llega REEMPLAZA a la guardada: un código que no viene es un
   * código que el usuario sacó, y tiene que desaparecer de la base. Sin el
   * `deleteMany`, el catálogo acumularía códigos que ya nadie reclama y que
   * seguirían bloqueando el UNIQUE global.
   */
  it('save() borra de la base el código alternativo que salió de la lista', async () => {
    const queSeQueda = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}QUEDA`,
      fabricante: 'HP',
    });
    const queSeVa = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}SEVA`,
      fabricante: 'HP',
    });
    const insumo = construirInsumo('BORRADO', [queSeQueda, queSeVa]);
    await repo.save(insumo);

    // Ancla del estado inicial: sin esto, un save() que nunca hubiera escrito
    // el segundo código dejaría el assert de abajo verde por construcción.
    const antes = await repo.findById(insumo.id);
    expect(antes!.codigosAlternativos.map((c) => c.id).sort()).toEqual(
      [queSeQueda.id, queSeVa.id].sort(),
    );

    insumo.reemplazarCodigosAlternativos([queSeQueda]);
    await repo.save(insumo);

    const despues = await repo.findById(insumo.id);
    expect(despues!.codigosAlternativos).toHaveLength(1);
    expect(despues!.codigosAlternativos[0]!.id).toBe(queSeQueda.id);

    const huerfano = await tenantClient.insumoCodigoAlternativo.findUnique({
      where: { id: queSeVa.id },
    });
    expect(huerfano).toBeNull();
  });

  /** Vaciar la lista entera es un caso propio: el `deleteMany` no tiene ids que preservar. */
  it('save() con la lista vacía borra todos los códigos alternativos del insumo', async () => {
    const codigo = InsumoCodigoAlternativoEntity.create({
      codigo: `${PREFIJO}VACIA`,
      fabricante: null,
    });
    const insumo = construirInsumo('VACIA', [codigo]);
    await repo.save(insumo);
    expect((await repo.findById(insumo.id))!.codigosAlternativos).toHaveLength(1);

    insumo.reemplazarCodigosAlternativos([]);
    await repo.save(insumo);

    expect((await repo.findById(insumo.id))!.codigosAlternativos).toHaveLength(0);
  });

  it('save() en un insumo existente actualiza sin pisar createdAt', async () => {
    const insumo = construirInsumo('UPD');
    await repo.save(insumo);

    insumo.actualizar({ nombre: 'Editado' });
    await repo.save(insumo);

    const found = await repo.findById(insumo.id);
    expect(found!.nombre).toBe('Editado');
    expect(found!.createdAt).toEqual(insumo.createdAt);
  });

  it('findByCodigo() encuentra el insumo por su código único', async () => {
    const insumo = construirInsumo('PORCODIGO');
    await repo.save(insumo);

    const found = await repo.findByCodigo(`${PREFIJO}PORCODIGO`);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(insumo.id);
  });

  /**
   * `insumos_codigo_key` NO es un índice parcial: el código sigue tomado
   * aunque el insumo tenga baja lógica. Si `findByCodigo()` filtrara por
   * `deletedAt`, la capa de aplicación daría el código por libre y el INSERT
   * volvería con un 23505 crudo.
   */
  it('findByCodigo() también encuentra un insumo con baja lógica', async () => {
    const insumo = construirInsumo('BAJA');
    insumo.softDelete();
    await repo.save(insumo);

    const found = await repo.findByCodigo(`${PREFIJO}BAJA`);

    expect(found).not.toBeNull();
    expect(found!.isDeleted()).toBe(true);
  });

  /**
   * Deshabilitar NO es eliminar: el insumo con `activo=false` tiene que seguir
   * llegando al listado, la única pantalla desde la que el administrador
   * consigue su id para reactivarlo.
   */
  it('findAllActive() SÍ incluye un insumo deshabilitado', async () => {
    const habilitado = construirInsumo('HAB');
    const deshabilitado = construirInsumo('DESHAB');
    deshabilitado.desactivar();
    await repo.save(habilitado);
    await repo.save(deshabilitado);

    const vigentes = await repo.findAllActive();

    const filaDeshabilitada = vigentes.find((i) => i.id === deshabilitado.id);
    expect(filaDeshabilitada).toBeDefined();
    expect(filaDeshabilitada!.activo).toBe(false);
    // Hermano invertido: el habilitado también está, así que el caso de arriba
    // no pasa por un listado que devuelve todo o por uno que devuelve nada.
    expect(vigentes.find((i) => i.id === habilitado.id)?.activo).toBe(true);
  });

  it('findAllActive() NO incluye un insumo con baja lógica', async () => {
    const vigente = construirInsumo('VIGENTE');
    const borrado = construirInsumo('BORRADO_LOGICO');
    borrado.softDelete();
    await repo.save(vigente);
    await repo.save(borrado);

    const vigentes = await repo.findAllActive();

    expect(vigentes.some((i) => i.id === borrado.id)).toBe(false);
    expect(vigentes.some((i) => i.id === vigente.id)).toBe(true);
  });

  it('findAllActive() trae los códigos alternativos de cada insumo', async () => {
    const insumo = construirInsumo('CONCODIGOS', [
      InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}LISTADO`, fabricante: 'CANON' }),
    ]);
    await repo.save(insumo);

    const vigentes = await repo.findAllActive();

    const fila = vigentes.find((i) => i.id === insumo.id);
    expect(fila!.codigosAlternativos).toHaveLength(1);
    expect(fila!.codigosAlternativos[0]!.codigo).toBe(`${PREFIJO}LISTADO`);
    expect(fila!.codigosAlternativos[0]!.fabricante).toBe('CANON');
  });

  describe('findConflictosDeCodigoAlternativo()', () => {
    it('devuelve el par tomado, con el insumo que lo tiene', async () => {
      const ocupante = construirInsumo('OCUPANTE', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}TOMADO`, fabricante: 'HP' }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}TOMADO`, fabricante: 'HP' },
      ]);

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.codigo).toBe(`${PREFIJO}TOMADO`);
      expect(conflictos[0]!.fabricante).toBe('HP');
      expect(conflictos[0]!.insumoId).toBe(ocupante.id);
    });

    /**
     * El UNIQUE es sobre el PAR: el mismo código de dos fabricantes distintos
     * convive sin problema. Comparando solo por `codigo`, el alta rechazaría
     * un par legítimo.
     */
    it('NO reporta el mismo código con otro fabricante', async () => {
      const ocupante = construirInsumo('MISMOCODIGO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}PAR`, fabricante: 'HP' }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}PAR`, fabricante: 'CANON' },
      ]);

      expect(conflictos).toEqual([]);
    });

    /**
     * El código GENÉRICO viaja con `fabricante: null`, que en SQL se compara
     * con `IS NULL` y no con `=`. Este caso corre contra el índice real, que
     * es `NULLS NOT DISTINCT`: si la consulta armara `fabricante = NULL`, no
     * devolvería nada y el alta duplicaría el genérico.
     */
    it('detecta el conflicto del código genérico, con fabricante nulo', async () => {
      const ocupante = construirInsumo('GENERICO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}SINFAB`, fabricante: null }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}SINFAB`, fabricante: null },
      ]);

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.fabricante).toBeNull();
      expect(conflictos[0]!.insumoId).toBe(ocupante.id);
    });

    it('resuelve varios pares en una sola consulta y devuelve solo los tomados', async () => {
      const ocupante = construirInsumo('VARIOS', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}A`, fabricante: 'HP' }),
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}B`, fabricante: null }),
      ]);
      await repo.save(ocupante);

      const conflictos = await repo.findConflictosDeCodigoAlternativo([
        { codigo: `${PREFIJO}A`, fabricante: 'HP' },
        { codigo: `${PREFIJO}LIBRE`, fabricante: 'HP' },
        { codigo: `${PREFIJO}B`, fabricante: null },
      ]);

      expect(conflictos.map((c) => c.codigo).sort()).toEqual([`${PREFIJO}A`, `${PREFIJO}B`].sort());
    });

    /**
     * Sin `excluyendoInsumoId`, reenviar la lista sin cambios en una edición se
     * rechazaría a sí misma. Con él, los códigos propios dejan de contar como
     * choque — pero los ajenos SIGUEN contando, que es el hermano invertido de
     * abajo.
     */
    it('excluyendoInsumoId saca de la comparación los códigos del insumo que se edita', async () => {
      const propio = construirInsumo('PROPIO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}MIO`, fabricante: 'HP' }),
      ]);
      await repo.save(propio);

      const conflictos = await repo.findConflictosDeCodigoAlternativo(
        [{ codigo: `${PREFIJO}MIO`, fabricante: 'HP' }],
        propio.id,
      );

      expect(conflictos).toEqual([]);
    });

    it('excluyendoInsumoId NO tapa el choque contra OTRO insumo', async () => {
      const ajeno = construirInsumo('AJENO', [
        InsumoCodigoAlternativoEntity.create({ codigo: `${PREFIJO}AJENO`, fabricante: 'HP' }),
      ]);
      const propio = construirInsumo('PROPIO2');
      await repo.save(ajeno);
      await repo.save(propio);

      const conflictos = await repo.findConflictosDeCodigoAlternativo(
        [{ codigo: `${PREFIJO}AJENO`, fabricante: 'HP' }],
        propio.id,
      );

      expect(conflictos).toHaveLength(1);
      expect(conflictos[0]!.insumoId).toBe(ajeno.id);
    });

    /** Con la lista vacía no hay nada que consultar: el UNIQUE no puede violarse sin pares. */
    it('con la lista de pares vacía devuelve vacío', async () => {
      const conflictos = await repo.findConflictosDeCodigoAlternativo([]);
      expect(conflictos).toEqual([]);
    });
  });
});
