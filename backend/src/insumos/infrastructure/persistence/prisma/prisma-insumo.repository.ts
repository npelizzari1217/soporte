/**
 * PrismaInsumoRepository — implementación del puerto `IInsumoRepository`.
 * Obtiene el cliente vía `TenantContext` (nunca `PrismaService` directo).
 *
 * Todas las lecturas traen el AGREGADO completo (`include:
 * { codigosAlternativos, compatibilidad }`): la raíz sin sus códigos o sin su
 * compatibilidad es un agregado a medio cargar, y el guardado siguiente
 * persistiría esa lista incompleta como si fuera la del usuario —un borrado
 * silencioso, sin error ni log—.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ConflictoCodigoAlternativo,
  FamiliaDeInsumo,
  FilaCatalogoStock,
  FiltrosCatalogoStock,
  IInsumoRepository,
  PrefijoCodigoInsumo,
} from '../../../domain/ports/i-insumo.repository';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import type { SeguimientoInsumo } from '../../../domain/entities/unidad-insumo.entity';
import { exigirTransaccionActiva } from '../../../../shared/infrastructure/persistence/exigir-transaccion-activa';
import {
  CompatibilidadModeloMapper,
  InsumoCodigoAlternativoMapper,
  InsumoMapper,
} from './insumo.mapper';

/**
 * Las dos listas del agregado se leen ORDENADAS —los códigos por su código, la
 * compatibilidad por el modelo— para que el agregado llegue igual en cada
 * lectura: sin `orderBy`, Postgres devuelve el orden físico de la tabla, que
 * cambia con cada UPDATE.
 *
 * La compatibilidad no ordena por `rol`: es nullable, y un `NULL` primero o
 * último es justo la clase de orden que cambia entre versiones del motor.
 */
const INCLUIR_AGREGADO = {
  codigosAlternativos: { orderBy: { codigo: 'asc' } },
  compatibilidad: { orderBy: { modeloEquipoId: 'asc' } },
} as const;

@Injectable()
export class PrismaInsumoRepository implements IInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * @param id Id del insumo.
   * @returns El insumo con sus códigos alternativos y su compatibilidad, o `null` si no existe.
   */
  async findById(id: string): Promise<InsumoEntity | null> {
    const row = await this.client.insumo.findUnique({
      where: { id },
      include: INCLUIR_AGREGADO,
    });
    return row ? InsumoMapper.toDomain(row) : null;
  }

  /**
   * Busca por el UNIQUE `codigo`, SIN filtrar por `activo` ni por `deletedAt`:
   * `insumos_codigo_key` no es un índice parcial, así que un código sigue
   * tomado aunque su insumo esté deshabilitado o dado de baja. Filtrar acá
   * haría que la capa de aplicación diera por libre un código que el INSERT
   * después rechaza con un 23505 crudo.
   *
   * @param codigo Código ya normalizado en mayúscula por la capa de aplicación.
   * @returns El insumo con sus códigos alternativos y su compatibilidad, o `null` si no existe.
   */
  async findByCodigo(codigo: string): Promise<InsumoEntity | null> {
    const row = await this.client.insumo.findUnique({
      where: { codigo },
      include: INCLUIR_AGREGADO,
    });
    return row ? InsumoMapper.toDomain(row) : null;
  }

  /**
   * Resuelve todos los pares en UNA consulta con un `OR` de los pares, no una
   * consulta por par: la lista de un insumo puede tener decenas de códigos y
   * el alta haría una ida y vuelta por cada uno.
   *
   * `fabricante: null` se traduce a `IS NULL`, que es lo que corresponde
   * contra un índice `NULLS NOT DISTINCT`: comparar el genérico con `= NULL`
   * no devolvería nada y el duplicado entraría.
   *
   * @param pares Pares a verificar, con `codigo` y `fabricante` YA normalizados.
   * @param excluyendoInsumoId Insumo que se está editando; sus propios códigos no son un choque consigo mismo.
   * @returns Solo los pares tomados, con el insumo que los tiene.
   */
  async findConflictosDeCodigoAlternativo(
    pares: ReadonlyArray<{ codigo: string; fabricante: string | null }>,
    excluyendoInsumoId?: string,
  ): Promise<ConflictoCodigoAlternativo[]> {
    if (pares.length === 0) return [];

    return this.client.insumoCodigoAlternativo.findMany({
      where: {
        OR: pares.map(({ codigo, fabricante }) => ({ codigo, fabricante })),
        ...(excluyendoInsumoId !== undefined ? { insumoId: { not: excluyendoInsumoId } } : {}),
      },
      select: { codigo: true, fabricante: true, insumoId: true },
    });
  }

  /**
   * Filtra por `deletedAt: null`, NO por `activo` —salvo que `soloVinculables`
   * lo pida—: un insumo deshabilitado tiene que seguir llegando al listado
   * para que el administrador pueda volver a habilitarlo. Ver el JSDoc de
   * `IInsumoRepository.findAllActive` para los DOS comportamientos que este
   * método sostiene y por qué.
   *
   * `esRepuesto` filtra por la FAMILIA (`familia.esRepuesto`, WU-1), no por
   * una columna propia de `insumos` —no existe—: viaja como filtro sobre la
   * relación, en la MISMA consulta, en vez de traer todo y filtrar en
   * memoria. `undefined` omite la cláusula por completo y no filtra nada.
   *
   * `soloVinculables` (WU-3, sdd/repuestos-vinculo-componente) agrega, en la
   * MISMA consulta, `activo: true` sobre el insumo Y `familia.activo: true`
   * sobre la relación —las DOS condiciones que `AgregarComponenteUseCase`
   * exige para aceptar un vínculo—. Va junto con `esRepuesto` en el MISMO
   * objeto `familia` del `where`: Prisma no admite dos claves `familia`
   * separadas en un mismo nivel.
   *
   * @param esRepuesto Filtro por familia; ausente trae repuestos y consumibles por igual.
   * @param soloVinculables `true` restringe a los insumos vinculables (habilitados, de familia habilitada); ausente no aplica ese filtro.
   * @returns Los insumos vigentes del tenant, con su agregado completo, ordenados por código.
   */
  async findAllActive(esRepuesto?: boolean, soloVinculables?: boolean): Promise<InsumoEntity[]> {
    const filtroFamilia = {
      ...(esRepuesto !== undefined ? { esRepuesto } : {}),
      // `activo` y `deletedAt` son independientes: `softDelete()` no toca
      // `activo`, así que una familia borrada lógicamente conserva
      // `activo: true`. Sin el segundo filtro, sus repuestos seguirían
      // ofreciéndose como vinculables.
      ...(soloVinculables ? { activo: true, deletedAt: null } : {}),
    };

    const rows = await this.client.insumo.findMany({
      where: {
        deletedAt: null,
        ...(soloVinculables ? { activo: true } : {}),
        ...(Object.keys(filtroFamilia).length > 0 ? { familia: filtroFamilia } : {}),
      },
      orderBy: { codigo: 'asc' },
      include: INCLUIR_AGREGADO,
    });
    return rows.map(InsumoMapper.toDomain);
  }

  /**
   * Responde "¿qué insumo le va a este modelo?" en UNA consulta, filtrando por
   * la relación con `some` en vez de leer primero los pares y después los
   * insumos por id: ese camino haría dos idas y vueltas y dejaría una ventana
   * entre las dos.
   *
   * Filtra por `deletedAt: null` y NO por `activo`, mismo criterio que
   * `findAllActive()`: un insumo deshabilitado sigue siendo el repuesto de ese
   * modelo, y esconderlo dejaría al administrador sin saber que existe.
   *
   * @param modeloEquipoId Id del modelo de equipo por el que se filtra.
   * @returns Los insumos compatibles vigentes —habilitados o no—, con su
   *   agregado completo, ordenados por código. Vacío si no hay ninguno.
   */
  async findAllByModeloEquipo(modeloEquipoId: string): Promise<InsumoEntity[]> {
    const rows = await this.client.insumo.findMany({
      where: { deletedAt: null, compatibilidad: { some: { modeloEquipoId } } },
      orderBy: { codigo: 'asc' },
      include: INCLUIR_AGREGADO,
    });
    return rows.map(InsumoMapper.toDomain);
  }

  /**
   * Resuelve la familia de cada insumo pedido en UN `findMany` con `select`
   * sobre la relación `familia`, no un `findById` por insumo: el detalle de
   * un equipo trae TODOS sus componentes y una consulta por componente sería
   * N+1 (sdd/repuestos-autoridad-catalogo, ADR-3).
   *
   * Lista vacía ⇒ mapa vacío SIN consultar la base: `findMany({ id: { in: [] } })`
   * iría igual a Postgres por una lista que ya se sabe vacía.
   *
   * `activo` y `deletedAt` de la familia viajan CRUDOS en la proyección — el
   * repositorio no decide si eso significa "tipo activo", esa regla vive en
   * el caso de uso (ADR-2).
   *
   * @param insumoIds Ids de insumo a resolver.
   * @returns Mapa `insumoId → FamiliaDeInsumo`. Un id inexistente no aparece.
   */
  async findFamiliasDeInsumos(insumoIds: readonly string[]): Promise<Map<string, FamiliaDeInsumo>> {
    if (insumoIds.length === 0) return new Map();

    const rows = await this.client.insumo.findMany({
      where: { id: { in: [...insumoIds] } },
      select: {
        id: true,
        familia: {
          select: { codigo: true, nombre: true, activo: true, deletedAt: true },
        },
      },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          insumoId: row.id,
          codigo: row.familia.codigo,
          nombre: row.familia.nombre,
          activo: row.familia.activo,
          deletedAt: row.familia.deletedAt,
        },
      ]),
    );
  }

  /**
   * Persiste el AGREGADO COMPLETO en UNA sola operación anidada: el insumo por
   * `upsert`, y sus códigos alternativos y su compatibilidad como escrituras
   * anidadas.
   *
   * Prisma corre la operación anidada en su propia transacción implícita, así
   * que NO se abre un `$transaction` a mano: el cliente activo puede ser ya un
   * `Prisma.TransactionClient` —cuando el caso de uso corre dentro de un
   * `ITenantTransactionRunner`—, y ese cliente no expone `$transaction`
   * (deny-list de Prisma). Abrirlo igual rompería en tiempo de ejecución.
   *
   * El `deleteMany` borra los códigos que YA NO vienen en la lista, no todos:
   * la capa de aplicación reutiliza la entidad existente para conservar su id
   * y su `createdAt`, y un borrado ciego seguido de `create` tiraría ese
   * trabajo a la basura.
   *
   * La compatibilidad se reconcilia igual, pero contra la PK COMPUESTA
   * `(insumoId, modeloEquipoId)`: la fila no tiene id propio ni `updatedAt`,
   * así que su `createdAt` es el único rastro de cuándo se declaró y un
   * borrar-y-recrear se lo llevaría puesto.
   *
   * `data` y `codigos` ya vienen SIN `createdAt` —issue #172,
   * `InsumoMapper.toPersistence()` e `InsumoCodigoAlternativoMapper.toPersistence()`
   * lo omiten del todo—, así que el mismo shape sirve para el CREATE y el
   * UPDATE de las dos: en el CREATE dispara el `DEFAULT clock_timestamp()` de
   * la columna, y en el UPDATE, al no viajar, no pisa la fecha de alta de lo
   * que ya existía. Antes de este cambio, el CREATE mandaba
   * `entity.createdAt` —el reloj del PROCESO, no el de la base— y era
   * exactamente el bug.
   *
   * @param insumo Insumo de dominio a persistir, con sus dos listas ya resueltas.
   */
  async save(insumo: InsumoEntity): Promise<void> {
    const data = InsumoMapper.toPersistence(insumo);
    // W3: `seguimiento` viaja en el CREATE pero NO en el UPDATE. Una entidad
    // leída antes de un cambio de seguimiento lo reescribiría con el valor
    // viejo; el único escritor es `cambiarSeguimiento()`.
    const { seguimiento: _seguimiento, ...dataSinSeguimiento } = data;

    const codigos = insumo.codigosAlternativos.map((codigo) =>
      InsumoCodigoAlternativoMapper.toPersistence(codigo),
    );
    const idsVigentes = codigos.map((codigo) => codigo.id);

    const compatibilidad = insumo.compatibilidad.map((par) =>
      CompatibilidadModeloMapper.toPersistence(par),
    );
    const modelosVigentes = compatibilidad.map((par) => par.modeloEquipoId);

    await this.client.insumo.upsert({
      where: { id: data.id },
      create: {
        ...data,
        codigosAlternativos: { create: codigos },
        compatibilidad: { create: compatibilidad },
      },
      update: {
        ...dataSinSeguimiento,
        codigosAlternativos: {
          // Con la lista vacía el filtro es `{}`: se van todos. Un
          // `notIn: []` dependería de cómo Prisma traduce el conjunto vacío.
          deleteMany: idsVigentes.length > 0 ? { id: { notIn: idsVigentes } } : {},
          upsert: codigos.map((codigo) => ({
            where: { id: codigo.id },
            create: codigo,
            update: codigo,
          })),
        },
        compatibilidad: {
          // Mismo criterio que arriba: con la lista vacía el filtro es `{}` y
          // se van todos. La identidad del par la da el modelo —el insumo ya
          // lo fija el anidamiento—, así que el filtro va por `modeloEquipoId`
          // y no por un id que la fila no tiene.
          deleteMany:
            modelosVigentes.length > 0 ? { modeloEquipoId: { notIn: modelosVigentes } } : {},
          // El shape no lleva `createdAt` en NINGUNA de las dos ramas: en el
          // create lo pone el `@default(now())` de la columna, y en el update
          // emitirlo le movería la fecha de alta a un par que no cambió.
          upsert: compatibilidad.map((par) => ({
            where: {
              insumoId_modeloEquipoId: { insumoId: data.id, modeloEquipoId: par.modeloEquipoId },
            },
            create: par,
            update: par,
          })),
        },
      },
    });
  }

  /**
   * Ver el contrato completo de concurrencia en el JSDoc de
   * `IInsumoRepository.findLastSecuenciaCodigo`.
   *
   * El `LIKE` es LEFT-ANCHORED (`'{prefijo}-%'`), mismo criterio que
   * `PrismaCompraRepository.findLastSecuencia`: al anclar el patrón al
   * inicio de la columna, Postgres puede resolver la búsqueda con un range
   * scan sobre el índice único de `codigo` (`@unique`) en vez de un seq scan
   * completo. El `~` con el patrón EXACTO (`^{prefijo}-[0-9]{4}$`) filtra los
   * códigos escritos a mano que empiezan igual pero no tienen la forma de la
   * serie (`INS-ABCD`, `INS-12345`) — sin ese filtro, un código así entraría
   * al `ORDER BY codigo DESC` con un orden alfabético que no es numérico y
   * podría ganarle a la secuencia real.
   */
  async findLastSecuenciaCodigo(prefijo: PrefijoCodigoInsumo): Promise<number> {
    const lockKey = `insumo-codigo:${prefijo}`;
    await this.client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const patronLike = `${prefijo}-%`;
    const patronExacto = `^${prefijo}-[0-9]{4}$`;
    const rows = await this.client.$queryRaw<Array<{ codigo: string }>>`
      SELECT codigo FROM insumos
      WHERE codigo LIKE ${patronLike} AND codigo ~ ${patronExacto}
      ORDER BY codigo DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return 0;
    }

    const partes = rows[0].codigo.split('-');
    return parseInt(partes[partes.length - 1], 10) || 0;
  }

  /**
   * `FOR SHARE` sobre la fila (L1 de ADR-12). Contrato en
   * `IInsumoRepository.leerSeguimientoParaMovimiento`.
   *
   * @param id Id del insumo.
   * @returns El seguimiento, o `null` si el insumo no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async leerSeguimientoParaMovimiento(id: string): Promise<SeguimientoInsumo | null> {
    const client = this.client;
    exigirTransaccionActiva(
      this.tenantContext,
      'PrismaInsumoRepository.leerSeguimientoParaMovimiento()',
    );
    const filas = await client.$queryRaw<Array<{ seguimiento: string }>>`
      SELECT seguimiento FROM insumos WHERE id = ${id}::uuid FOR SHARE
    `;
    // VarChar sin enum de Prisma: seguro por el CHECK `insumos_seguimiento_check`.
    return filas.length > 0 ? (filas[0].seguimiento as SeguimientoInsumo) : null;
  }

  /**
   * `FOR NO KEY UPDATE` sobre la fila (L1 de ADR-12). Contrato en
   * `IInsumoRepository.bloquearParaCambioDeSeguimiento`.
   *
   * @param id Id del insumo.
   * @returns `seguimiento` y `unidadMedidaId` bajo el lock, o `null` si no existe.
   * @throws Error si no hay una transacción activa del tenant.
   */
  async bloquearParaCambioDeSeguimiento(
    id: string,
  ): Promise<{ seguimiento: SeguimientoInsumo; unidadMedidaId: string } | null> {
    const client = this.client;
    exigirTransaccionActiva(
      this.tenantContext,
      'PrismaInsumoRepository.bloquearParaCambioDeSeguimiento()',
    );
    const filas = await client.$queryRaw<Array<{ seguimiento: string; unidad_medida_id: string }>>`
      SELECT seguimiento, unidad_medida_id FROM insumos WHERE id = ${id}::uuid FOR NO KEY UPDATE
    `;
    if (filas.length === 0) return null;
    return {
      seguimiento: filas[0].seguimiento as SeguimientoInsumo,
      unidadMedidaId: filas[0].unidad_medida_id,
    };
  }

  /**
   * Único escritor de `seguimiento` (W3). `updateMany` y no `update`: así la
   * ausencia de la fila es un conteo de cero que se convierte en un error
   * claro, en vez de un `P2025` crudo.
   *
   * @param id Id del insumo.
   * @param valor Nuevo seguimiento.
   * @throws Error si el insumo no existe.
   */
  async cambiarSeguimiento(id: string, valor: SeguimientoInsumo): Promise<void> {
    const { count } = await this.client.insumo.updateMany({
      where: { id },
      data: { seguimiento: valor },
    });
    if (count === 0) {
      throw new Error(`PrismaInsumoRepository.cambiarSeguimiento(): el insumo ${id} no existe.`);
    }
  }

  /**
   * @param unidadMedidaId Id de la unidad de medida.
   * @returns Cantidad de insumos `SERIE` no eliminados que la usan.
   */
  async contarSeriePorUnidadMedida(unidadMedidaId: string): Promise<number> {
    return this.client.insumo.count({
      where: { unidadMedidaId, seguimiento: 'SERIE', deletedAt: null },
    });
  }

  /**
   * Una sola consulta con `select` y relaciones: la proyección del reporte de
   * stock, no el agregado. `deletedAt: null` sobre el insumo; los deshabilitados
   * y los de familia deshabilitada SÍ se incluyen. Los filtros van en SQL y el
   * orden es `codigo ASC`. `stockMinimo` (`Decimal`) se convierte con `Number`,
   * como `InsumoMapper`; `null` queda `null`.
   *
   * @param filtros Familia y/o tipo a filtrar.
   * @returns Las filas del catálogo, sin saldos.
   */
  async listarParaReporteStock(filtros: FiltrosCatalogoStock): Promise<FilaCatalogoStock[]> {
    const filas = await this.client.insumo.findMany({
      where: {
        deletedAt: null,
        ...(filtros.familiaId !== undefined ? { familiaId: filtros.familiaId } : {}),
        ...(filtros.esRepuesto !== undefined
          ? { familia: { esRepuesto: filtros.esRepuesto } }
          : {}),
      },
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        activo: true,
        seguimiento: true,
        stockMinimo: true,
        familia: { select: { id: true, nombre: true, esRepuesto: true } },
        unidadMedida: { select: { codigo: true, nombre: true, entera: true } },
      },
    });
    return filas.map((f) => ({
      insumoId: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      activo: f.activo,
      // VarChar sin enum de Prisma: seguro por el CHECK `insumos_seguimiento_check`.
      seguimiento: f.seguimiento as SeguimientoInsumo,
      stockMinimo: f.stockMinimo === null ? null : Number(f.stockMinimo),
      familia: f.familia,
      unidadMedida: f.unidadMedida,
    }));
  }
}
