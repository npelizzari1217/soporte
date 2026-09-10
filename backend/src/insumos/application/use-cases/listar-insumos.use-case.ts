import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

/**
 * ListarInsumosUseCase — catálogo de insumos del tenant, habilitados y
 * deshabilitados, con sus códigos alternativos.
 *
 * No devuelve `Result`: no tiene ningún fallo de negocio que informar — un
 * catálogo sin filas es una lista vacía, no un error. Mismo criterio que
 * `ListarModelosEquipoUseCase`.
 *
 * Sin gate: cualquier autenticado del tenant puede leerlo, porque lo necesita
 * para elegir un insumo en cualquier otra pantalla.
 */
export class ListarInsumosUseCase {
  constructor(private readonly insumoRepo: Pick<IInsumoRepository, 'findAllActive'>) {}

  /**
   * `esRepuesto` distingue el consumible (familia con `esRepuesto = false`,
   * tóner, cartucho...) del repuesto de equipo (`esRepuesto = true`, mouse,
   * teclado, CPU...; WU-1, `FamiliaInsumoEntity.esRepuesto`) — WU-2,
   * sdd/repuestos-seccion.
   *
   * **AUSENTE no filtra: trae repuestos y consumibles por igual.** No es un
   * default elegido por descuido — lo necesitan dos consumidores que NO
   * distinguen la marca y que este WU no toca: la ficha de detalle
   * (`InsumoDetailView`, busca un insumo por id sin importar su familia) y
   * los selectores de ítem de una compra (`item-create-dialog`,
   * `item-edit-dialog`: se puede comprar cualquier insumo, consumible o
   * repuesto). Cambiar ese default los rompería en silencio.
   *
   * Las DOS pantallas de sección jamás dependen de este default:
   * `InsumosListView` siempre pide `esRepuesto: false` y `RepuestosListView`
   * siempre pide `esRepuesto: true` — que la sección Insumos muestre un
   * repuesto por un llamado sin el parámetro sería el bug grave que este WU
   * tiene que evitar, y por eso el frontend nunca omite el filtro en esas dos
   * pantallas.
   *
   * @param esRepuesto Filtro por familia; ausente trae TODOS los insumos.
   * @returns Los insumos vigentes del tenant —habilitados o no—, ordenados por código.
   */
  async execute(esRepuesto?: boolean): Promise<InsumoEntity[]> {
    return this.insumoRepo.findAllActive(esRepuesto);
  }
}
