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
 * **Autoridad del camino vinculado (sdd/repuestos-autoridad-catalogo, ADR-1)**:
 * en la rama vinculada, el gate contra el catálogo MASTER
 * (`ITipoComponenteMasterChecker.estaActivo`) se RETIRA — no se sustituye por
 * otro. La familia del tenant (existente, `esRepuesto: true`, `activo: true`)
 * es la ÚNICA autoridad de qué tipo es un componente vinculado: los cuatro
 * guards de insumo/familia de arriba ya cubren, del lado correcto de la base,
 * exactamente lo que ese gate cubría. Antes de este cambio, una familia
 * propia del tenant —por ejemplo "TORNILLO"— caía en el mismo camino que un
 * texto libre y fallaba con `RepuestoSinTipoEnCatalogoError` (WU-3/WU-5, ya
 * ELIMINADO: sin el gate no queda ningún camino que lo emita). Consecuencia
 * aceptada, no defecto: ROOT deja de poder retirar globalmente un tipo para
 * los inquilinos que ya tienen esa familia — la baja en MASTER sigue
 * aplicando completa al camino de texto libre, que sí sigue exigiéndola.
 *
 * Flujo:
 * 1. Verifica que el equipo exista y no esté soft-deleted.
 * 2. Si viene `insumoId`: resuelve el repuesto (existente y `activo`) y su
 *    familia (existente, `esRepuesto` y `activo`), y deriva
 *    `tipoComponenteCodigo` de esa familia (descartando el del DTO) — la
 *    familia del tenant YA es la autoridad completa de este camino, MASTER
 *    no participa. Si no viene `insumoId`: usa el `tipoComponenteCodigo` del
 *    DTO tal cual (camino de texto libre).
 * 3. Camino de texto libre ÚNICAMENTE: verifica que ese
 *    `tipoComponenteCodigo` exista y esté `activo` en el catálogo MASTER
 *    (`ITipoComponenteMasterChecker.estaActivo`, PR4b). Si no:
 *    `TipoComponenteInactivoError`. El camino vinculado NO pasa por este
 *    paso (ADR-1).
 * 4. Crea `ComponenteEquipoEntity` (permite N componentes del mismo tipo
 *    por equipo — sin restricción de unicidad) y persiste, con `insumoId`
 *    en `null` o el del repuesto vinculado según el camino.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Ref: sdd/tipos-componente-master
 * (PR4b — migra de `ITipoComponenteRepository` tenant a
 * `ITipoComponenteMasterChecker` cross-DB). Ref: sdd/repuestos-vinculo-componente
 * (WU-3 — vínculo opcional a un repuesto del catálogo de insumos). Ref:
 * sdd/repuestos-autoridad-catalogo (ADR-1 — retira el gate MASTER del camino
 * vinculado). Tarea: T12.4, T12.5.
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
    // `true` en el camino vinculado: marca que NO hay que consultar MASTER
    // (ADR-1) — la familia del tenant ya es la única autoridad del tipo.
    let vinculado = false;

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
      vinculado = true;
    } else {
      // Camino de texto libre: obligatorio, mismo criterio que antes de
      // WU-3 (la validación `@ValidateIf` del DTO HTTP ya lo exige, pero el
      // use case no confía únicamente en la capa de presentación).
      if (!dto.tipoComponenteCodigo) {
        return Result.fail(new TipoComponenteCodigoRequeridoError());
      }
      tipoComponenteCodigo = dto.tipoComponenteCodigo;
    }

    // ADR-1 (sdd/repuestos-autoridad-catalogo): el gate contra MASTER corre
    // SOLO en el camino de texto libre. El vinculado ya pasó los cuatro
    // guards de insumo/familia de arriba, y esos ALCANZAN — no hay chequeo
    // sustituto contra MASTER, la familia del tenant es la autoridad completa.
    if (!vinculado) {
      const activo = await this.tipoComponenteMasterChecker.estaActivo(tipoComponenteCodigo);
      if (!activo) {
        return Result.fail(new TipoComponenteInactivoError(tipoComponenteCodigo));
      }
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
