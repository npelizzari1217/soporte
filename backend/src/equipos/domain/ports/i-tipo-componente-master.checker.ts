/**
 * ITipoComponenteMasterChecker — puerto de lectura cross-DB para el catálogo
 * MASTER de tipos de componente (`master.tipos_componente`, sembrado en PR1
 * de `sdd/tipos-componente-master`).
 *
 * Mismo criterio de decoplamiento que `IUsuarioMasterChecker` (tickets/):
 * el módulo consumidor (equipos/) define su propio puerto mínimo en vez de
 * depender de `ITipoComponenteMasterRepository`/`TipoComponenteMasterMapper`
 * del módulo `tipos-componente/` (que expone CRUD completo para ROOT, fuera
 * del alcance de equipos). La implementación consulta MASTER directamente
 * vía `PrismaService.getMasterClient()`.
 *
 * Ref: sdd/tipos-componente-master (PR3).
 */
export interface ITipoComponenteMasterChecker {
  /**
   * Resuelve nombre/estado de un lote de códigos en una sola consulta
   * (batch — evita N+1). Best-effort: códigos inexistentes simplemente no
   * aparecen en el Map resultante.
   *
   * @param codigos Lote de códigos estables (ej. "RAM", "CPU") a resolver.
   *                Array vacío retorna un Map vacío sin consultar la DB.
   * @returns Map de `codigo` → `{ nombre, activo }` (solo los encontrados).
   */
  resolver(codigos: string[]): Promise<Map<string, { nombre: string; activo: boolean }>>;

  /**
   * Verifica que el código exista en el catálogo MASTER con `activo = true`.
   *
   * @param codigo Código estable del tipo de componente.
   * @returns true si existe y está activo; false si no existe o está inactivo.
   */
  estaActivo(codigo: string): Promise<boolean>;

  /**
   * Lista los tipos de componente `activo = true` del catálogo MASTER,
   * ordenados por nombre — alimenta el selector de UI al agregar componentes
   * (F3-Q3).
   *
   * @returns Lista `{ codigo, nombre }` de los tipos activos.
   */
  listarActivos(): Promise<{ codigo: string; nombre: string }[]>;
}

/** Token de inyección de dependencias para ITipoComponenteMasterChecker en NestJS. */
export const TIPO_COMPONENTE_MASTER_CHECKER = Symbol('TIPO_COMPONENTE_MASTER_CHECKER');
