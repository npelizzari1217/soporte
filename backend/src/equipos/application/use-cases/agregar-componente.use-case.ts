import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import { IInsumoRepository } from '../../../insumos/domain/ports/i-insumo.repository';
import { IFamiliaInsumoRepository } from '../../../insumos/domain/ports/i-familia-insumo.repository';
import {
  EquipoNoEncontradoError,
  TipoComponenteCodigoRequeridoError,
  TipoComponenteInactivoError,
  InsumoRepuestoInexistenteError,
  InsumoNoEsRepuestoError,
  FamiliaRepuestoDeshabilitadaError,
  RepuestoSinTipoEnCatalogoError,
} from '../../domain/errors/equipos.errors';

/**
 * DTO de entrada para agregar un componente a un equipo (F3-Q2).
 *
 * WU-3 (sdd/repuestos-vinculo-componente) agrega `insumoId`, opcional. Con
 * `insumoId` ausente/`null`, `tipoComponenteCodigo` es obligatorio (el
 * camino de texto libre original, sin cambios). Con `insumoId` presente,
 * `tipoComponenteCodigo` puede venir pero el use case lo IGNORA: lo deriva
 * de la familia del insumo vinculado (ver el JSDoc de la clase).
 */
export interface AgregarComponenteDto {
  equipoId: string;
  tipoComponenteCodigo?: string;
  insumoId?: string | null;
  descripcion?: string | null;
  numeroSerie?: string | null;
  capacidad?: string | null;
}

/**
 * AgregarComponenteUseCase — agrega un componente físico a un equipo
 * existente (F3-Q2).
 *
 * WU-3 (sdd/repuestos-vinculo-componente) agrega el vínculo opcional
 * `insumoId`, con DOS caminos:
 *
 * - **Texto libre** (el original, `insumoId` ausente/`null`):
 *   `tipoComponenteCodigo` lo escribe quien carga el componente, se valida
 *   contra el catálogo MASTER como siempre, y el componente se guarda con
 *   `insumoId: null`.
 * - **Vinculado a un repuesto** (`insumoId` presente): el use case busca el
 *   insumo (`InsumoRepuestoInexistenteError` si no existe O si `activo` es
 *   `false` — igual que `ModeloEquipoDeshabilitadoError`, la FK no puede
 *   atrapar un insumo deshabilitado porque la fila existe y la base acepta
 *   el vínculo sin chistar), busca su familia y exige `esRepuesto: true`
 *   (`InsumoNoEsRepuestoError` si es un consumible) y `activo: true`
 *   (`FamiliaRepuestoDeshabilitadaError` si la familia está deshabilitada — dos
 *   errores separados a propósito, ver JSDoc de cada uno en
 *   `equipos.errors.ts`), y **DERIVA `tipoComponenteCodigo` del `codigo` de
 *   esa familia** — el `tipoComponenteCodigo` que venga en el DTO se IGNORA.
 *   Es la decisión de producto: es imposible que un componente diga
 *   "MOUSE" y apunte a un repuesto de familia "TECLADO" — y esto es cierto
 *   tanto al ALTA (acá, porque el código sale siempre del mismo lugar que el
 *   repuesto) como al EDITAR: `EditarComponenteUseCase` rechaza cualquier
 *   cambio de `tipoComponenteCodigo` sobre un componente con `insumoId` no
 *   nulo (`ComponenteVinculadoTipoInmutableError`, WU-3 — hallazgo de
 *   revisión automática que cerró el camino por el que un PATCH sí podía
 *   guardar esa contradicción). Los DOS caminos sostienen la invariante; sin
 *   el de edición, esta afirmación era falsa.
 *
 * **LIMITACIÓN DELIBERADA**: en el camino vinculado, la validación contra
 * el catálogo MASTER (`ITipoComponenteMasterChecker.estaActivo`) se
 * conserva SIN CAMBIOS sobre el código derivado. Eso significa que solo se
 * pueden vincular repuestos cuya familia tenga su código sembrado TAMBIÉN
 * en MASTER. Las 11 familias universales de WU-1 (sdd/repuestos-familias)
 * lo cumplen porque salieron de ahí, pero una familia propia del tenant
 * —por ejemplo "TORNILLO"— cae en el mismo camino y falla con
 * `RepuestoSinTipoEnCatalogoError`, que nombra el repuesto y su familia en
 * vez de un tipo que en ese camino el usuario nunca eligió. Eso es correcto
 * para este work unit:
 * levantar esta restricción exige cambiar de dónde sale la autoridad del
 * catálogo, y eso es WU-5. En este work unit se documenta y se fija la
 * conducta, no se resuelve.
 *
 * Flujo:
 * 1. Verifica que el equipo exista y no esté soft-deleted.
 * 2. Si viene `insumoId`: resuelve el repuesto (existente y `activo`) y su
 *    familia (existente, `esRepuesto` y `activo`), y deriva
 *    `tipoComponenteCodigo` de esa familia (descartando el del DTO). Si no
 *    viene: usa el `tipoComponenteCodigo` del DTO tal cual (camino de
 *    texto libre).
 * 3. Verifica que el `tipoComponenteCodigo` (derivado o de texto libre)
 *    exista y esté `activo` en el catálogo MASTER
 *    (`ITipoComponenteMasterChecker.estaActivo`, PR4b). Si no:
 *    `RepuestoSinTipoEnCatalogoError` en el camino vinculado —el usuario no
 *    eligió ese tipo, se derivó de la familia— y `TipoComponenteInactivoError`
 *    en el de texto libre, donde sí lo escribió.
 * 4. Crea `ComponenteEquipoEntity` (permite N componentes del mismo tipo
 *    por equipo — sin restricción de unicidad) y persiste, con `insumoId`
 *    en `null` o el del repuesto vinculado según el camino.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref: sdd/tipos-componente-master
 * (PR4b — migra de `ITipoComponenteRepository` tenant a
 * `ITipoComponenteMasterChecker` cross-DB). Ref: sdd/repuestos-vinculo-componente
 * (WU-3 — vínculo opcional a un repuesto del catálogo de insumos). Tarea:
 * T12.4, T12.5.
 */
export class AgregarComponenteUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly tipoComponenteMasterChecker: Pick<ITipoComponenteMasterChecker, 'estaActivo'>,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'save'>,
    private readonly insumoRepo: Pick<IInsumoRepository, 'findById'>,
    private readonly familiaInsumoRepo: Pick<IFamiliaInsumoRepository, 'findById'>,
  ) {}

  async execute(dto: AgregarComponenteDto): Promise<Result<ComponenteEquipoEntity, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    let tipoComponenteCodigo: string;
    let insumoId: string | null = null;
    let familiaVinculada: { insumoId: string; codigo: string; nombre: string } | null = null;

    if (dto.insumoId != null) {
      const insumo = await this.insumoRepo.findById(dto.insumoId);
      // `activo` y `deletedAt` son columnas INDEPENDIENTES: `softDelete()` no
      // toca `activo`, así que un insumo borrado lógicamente conserva
      // `activo: true` y pasaría este guard. El catálogo del select nunca lo
      // ofrece —`findAllActive` filtra `deletedAt: null`—, pero un formulario
      // abierto mientras el administrador lo borra llegaría igual, y la FK no
      // lo atrapa porque la fila existe. Es la misma asimetría que este work
      // unit cierra, invertida: la pantalla más estricta que el servidor.
      if (!insumo || !insumo.activo || insumo.isDeleted()) {
        return Result.fail(new InsumoRepuestoInexistenteError(dto.insumoId));
      }

      const familia = await this.familiaInsumoRepo.findById(insumo.familiaId);
      // Una familia inexistente o con baja lógica deja al repuesto sin
      // catálogo que lo respalde, y eso NO es "ser un consumible": decirlo con
      // ese mensaje mandaría al usuario a mirar una marca que está bien.
      // Mismo criterio que `CrearInsumoUseCase`, que lo documenta así:
      // "elegir una familia dada de baja no es una opción distinta de elegir
      // una que nunca existió".
      if (!familia || familia.isDeleted()) {
        return Result.fail(new InsumoRepuestoInexistenteError(dto.insumoId));
      }
      if (!familia.esRepuesto) {
        return Result.fail(new InsumoNoEsRepuestoError(dto.insumoId));
      }
      if (!familia.activo) {
        return Result.fail(
          new FamiliaRepuestoDeshabilitadaError(dto.insumoId, familia.codigo, familia.nombre),
        );
      }

      // El código del DTO se descarta: el vínculo con el repuesto es la
      // única fuente del tipo (ver JSDoc de la clase, decisión #1).
      tipoComponenteCodigo = familia.codigo;
      insumoId = insumo.id;
      familiaVinculada = { insumoId: insumo.id, codigo: familia.codigo, nombre: familia.nombre };
    } else {
      // Camino de texto libre: obligatorio, mismo criterio que antes de
      // WU-3 (la validación `@ValidateIf` del DTO HTTP ya lo exige, pero el
      // use case no confía únicamente en la capa de presentación).
      if (!dto.tipoComponenteCodigo) {
        return Result.fail(new TipoComponenteCodigoRequeridoError());
      }
      tipoComponenteCodigo = dto.tipoComponenteCodigo;
    }

    const activo = await this.tipoComponenteMasterChecker.estaActivo(tipoComponenteCodigo);
    if (!activo) {
      // En el camino vinculado el usuario no eligió el tipo: se derivó de la
      // familia del repuesto y la pantalla se lo mostró deshabilitado. Un
      // error que nombre el TIPO lo mandaría a arreglar algo que no tocó.
      if (familiaVinculada !== null) {
        return Result.fail(
          new RepuestoSinTipoEnCatalogoError(
            familiaVinculada.insumoId,
            familiaVinculada.codigo,
            familiaVinculada.nombre,
          ),
        );
      }
      return Result.fail(new TipoComponenteInactivoError(tipoComponenteCodigo));
    }

    const componenteResult = ComponenteEquipoEntity.create({
      equipoId: dto.equipoId,
      tipoComponenteCodigo,
      insumoId,
      descripcion: dto.descripcion ?? null,
      numeroSerie: dto.numeroSerie ?? null,
      capacidad: dto.capacidad ?? null,
    });
    if (componenteResult.isFail()) {
      return Result.fail(componenteResult.getError());
    }
    const componente = componenteResult.getValue();

    await this.componenteRepo.save(componente);
    return Result.ok(componente);
  }
}
