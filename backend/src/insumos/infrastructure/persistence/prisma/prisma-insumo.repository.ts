/**
 * PrismaInsumoRepository — implementación del puerto `IInsumoRepository`.
 * Obtiene el cliente vía `TenantContext` (nunca `PrismaService` directo).
 *
 * Todas las lecturas traen el AGREGADO completo (`include:
 * { codigosAlternativos }`): la raíz sin sus códigos es un agregado a medio
 * cargar, y el guardado siguiente persistiría esa lista incompleta como si
 * fuera la del usuario.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ConflictoCodigoAlternativo,
  IInsumoRepository,
} from '../../../domain/ports/i-insumo.repository';
import { InsumoEntity } from '../../../domain/entities/insumo.entity';
import { InsumoCodigoAlternativoMapper, InsumoMapper } from './insumo.mapper';

/**
 * Los códigos alternativos se leen ordenados por código para que el agregado
 * llegue igual en cada lectura: sin `orderBy`, Postgres devuelve el orden
 * físico de la tabla, que cambia con cada UPDATE.
 */
const INCLUIR_CODIGOS_ALTERNATIVOS = {
  codigosAlternativos: { orderBy: { codigo: 'asc' } },
} as const;

@Injectable()
export class PrismaInsumoRepository implements IInsumoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  /**
   * @param id Id del insumo.
   * @returns El insumo con sus códigos alternativos, o `null` si no existe.
   */
  async findById(id: string): Promise<InsumoEntity | null> {
    const row = await this.client.insumo.findUnique({
      where: { id },
      include: INCLUIR_CODIGOS_ALTERNATIVOS,
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
   * @returns El insumo con sus códigos alternativos, o `null` si no existe.
   */
  async findByCodigo(codigo: string): Promise<InsumoEntity | null> {
    const row = await this.client.insumo.findUnique({
      where: { codigo },
      include: INCLUIR_CODIGOS_ALTERNATIVOS,
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
   * Filtra por `deletedAt: null`, NO por `activo`: un insumo deshabilitado
   * tiene que seguir llegando al listado para que el administrador pueda
   * volver a habilitarlo.
   *
   * @returns Los insumos vigentes del tenant —habilitados o no—, con sus
   *   códigos alternativos, ordenados por código.
   */
  async findAllActive(): Promise<InsumoEntity[]> {
    const rows = await this.client.insumo.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
      include: INCLUIR_CODIGOS_ALTERNATIVOS,
    });
    return rows.map(InsumoMapper.toDomain);
  }

  /**
   * Persiste el AGREGADO COMPLETO en UNA sola operación anidada: el insumo por
   * `upsert` y su lista de códigos alternativos como escritura anidada.
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
   * @param insumo Insumo de dominio a persistir, con su lista de códigos ya resuelta.
   */
  async save(insumo: InsumoEntity): Promise<void> {
    const data = InsumoMapper.toPersistence(insumo);
    const { createdAt: _createdAt, ...updateData } = data;

    const codigos = insumo.codigosAlternativos.map((codigo) =>
      InsumoCodigoAlternativoMapper.toPersistence(codigo),
    );
    const idsVigentes = codigos.map((codigo) => codigo.id);

    await this.client.insumo.upsert({
      where: { id: data.id },
      create: {
        ...data,
        codigosAlternativos: { create: codigos },
      },
      update: {
        ...updateData,
        codigosAlternativos: {
          // Con la lista vacía el filtro es `{}`: se van todos. Un
          // `notIn: []` dependería de cómo Prisma traduce el conjunto vacío.
          deleteMany: idsVigentes.length > 0 ? { id: { notIn: idsVigentes } } : {},
          upsert: codigos.map((codigo) => {
            const { createdAt: _codigoCreatedAt, ...codigoUpdate } = codigo;
            return { where: { id: codigo.id }, create: codigo, update: codigoUpdate };
          }),
        },
      },
    });
  }
}
