---
schema: gentle-ai.sdd-research/v1
change: catalogo-unico-componentes
revision: 3
outcome: done
accessed_at: 2026-09-29
admission:
  requested_classes: [documentation, open-web]
  granted: [documentation, open-web]
---
# Investigación: catálogo único de componentes/repuestos en herramientas ITAM/ITSM

## Alcance (revisión 3)
El 2026-09-29, tras dos pasadas `partial`, el dueño acotó el alcance a **GLPI, Snipe-IT y ServiceNow**: GLPI es el competidor directo y los otros dos son los modelos de referencia. La revisión 3 no agrega fuentes; declara `done` sobre ese alcance:
- RQ1, RQ2 y RQ3 quedan cubiertas para las tres herramientas.
- RQ4 queda resuelta como "no documentado" en GLPI y ServiceNow, en los lugares listados abajo. En Snipe-IT no se buscó guía de migración de taxonomías: su modelo de categorías con un enum fijo [S12] no ofrece fusión y queda fuera de la búsqueda de RQ4.
- Odoo, Freshservice y JSM Assets quedan **fuera de alcance**. Sus afirmaciones de RQ1, validadas, se conservan como contexto, y sus huecos en RQ2 y RQ3 ya no bloquean.

## Preguntas
- RQ1. Catálogo maestro, forma de expresar el "tipo/comportamiento" (enum fijo vs. categoría libre) y jerarquía, en GLPI, Snipe-IT, Odoo, ServiceNow, Freshservice y JSM Assets.
- RQ2. Registro de un componente instalado en un activo: (a) tomado de stock (decremento atómico) y (b) ya incluido al adquirir el activo (sin movimiento de stock). Valor por defecto.
- RQ3. Reemplazo de un componente instalado: edición en sitio vs. baja + alta, e historial.
- RQ4. Advertencias documentadas al fusionar o migrar dos taxonomías en un catálogo.

## Fuentes
| id | clase | título | publicador | URL | accedido | extracto textual breve |
|---|---|---|---|---|---|---|
| S1 | documentation | Overview (Snipe-IT Documentation) | Snipe-IT / Grokability | https://snipe-it.readme.io/docs/overview | 2026-09-29 | "Components: Generally things like RAM, hard drives for a RAID system, and so on. These are items that get checked out to an asset." |
| S2 | documentation | Components (GLPI Help Center) | GLPI Project | https://help.glpi-project.org/documentation/modules/configuration/components | 2026-09-29 | "It is not possible to add other types than those listed here" |
| S3 | documentation | Consumables (GLPI Help Center) | GLPI Project | https://help.glpi-project.org/documentation/modules/assets/consumables | 2026-09-29 | "Consumables cannot be managed by the agent or automatic inventory" |
| S4 | documentation | Product tracking (Odoo 18) | Odoo | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking.html | 2026-09-29 | Lotes y números de serie como los dos métodos de trazabilidad (Inventory > Configuration > Settings > "Lots & Serial Numbers") |
| S5 | documentation | Product type (Odoo 18) | Odoo | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/type.html | 2026-09-29 | Tipos Goods / Services / Combos; para bienes se elige el seguimiento: serie, lote o solo cantidad (extracto parafraseado por la herramienta de fetch, no literal). |
| S6 | documentation | Working with object types (JSM Data Center) | Atlassian | https://confluence.atlassian.com/servicemanagementserver/working-with-object-types-1044784515.html | 2026-09-29 | "You can organize object types in the hierarchy tree in a way that makes sense. This tree is mainly for navigation and readability." |
| S7 | documentation | Different types of assets/CIs in Freshservice | Freshworks | https://support.freshservice.com/support/solutions/articles/164410-different-types-of-assets-configuration-items-in-freshservice | 2026-09-29 | "The default assets or configuration items cannot be deleted." / "Hardware < Computer < Netbook" |
| S8 | documentation | Create a hardware or consumable model | ServiceNow | https://www.servicenow.com/docs/r/it-asset-management/hardware-asset-management/create-hardware-consumable-model.html | 2026-09-29 | "To begin tracking your hardware and consumable assets, create a hardware or consumable model." |
| S9 | open-web (comunidad oficial, secundaria) | Hardware Asset Management (HAM) | ServiceNow Community | https://www.servicenow.com/community/itom-articles/hardware-asset-management-ham/ta-p/2319049 | 2026-09-29 | "A Consumable assets is similar to an asset, but it's tracked at the quantity level while it's in stock." |
| S10 | documentation (código fuente oficial) | ComponentCheckoutController.php | Grokability (snipe-it) | https://raw.githubusercontent.com/grokability/snipe-it/master/app/Http/Controllers/Components/ComponentCheckoutController.php | 2026-09-29 | `$component->assets()->attach($component->id, [... 'assigned_qty' => $component->checkout_qty, 'asset_id' => ...])` ; `lockForUpdate()` |
| S11 | documentation (código fuente oficial) | ComponentCheckinController.php | Grokability (snipe-it) | https://raw.githubusercontent.com/grokability/snipe-it/master/app/Http/Controllers/Components/ComponentCheckinController.php | 2026-09-29 | `DB::table('components_assets')->find($component_asset_id)` ; borra la fila del pivote si `$qty_remaining_in_checkout == 0` |
| S12 | documentation (código fuente oficial) | Category.php | Grokability (snipe-it) | https://raw.githubusercontent.com/grokability/snipe-it/master/app/Models/Category.php | 2026-09-29 | `'category_type' => 'required|in:asset,accessory,consumable,component,license'` |
| S13 | documentation (código fuente oficial) | Item_Devices.php | GLPI Project | https://raw.githubusercontent.com/glpi-project/glpi/main/src/Item_Devices.php | 2026-09-29 | "Relation between item and devices..." ; `$log_history_1_add = Log::HISTORY_ADD_DEVICE` / `..._delete = Log::HISTORY_DELETE_DEVICE` |
| S14 | documentation | Consume consumable assets | ServiceNow | https://www.servicenow.com/docs/r/it-asset-management/asset-management/t_ConsumingConsumableAssets.html | 2026-09-29 | "Enter the Quantity to consume" ; "In Asset, select the lookup icon and select the asset associated with the consumable." |
| S15 | documentation | Dictionaries (GLPI Help Center) | GLPI Project | https://help.glpi-project.org/documentation/modules/administration/dictionnaries | 2026-09-29 | "it is highly recommended to play rules on a test database and to backup database before production launch" |
| S16 | documentation | Add new equipment (Odoo 18 Maintenance) | Odoo | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/maintenance/add_new_equipment.html | 2026-09-29 | Campos: Equipment Category, Company, Used By, Maintenance Team, Technician; pestaña Product Information (proveedor, modelo, serie, costo, garantía) |
| S17 | open-web (blog oficial, secundaria) | Improving Hardware and Consumable Product Model Normalization | ServiceNow Community | https://www.servicenow.com/community/sam-blog/improving-hardware-and-consumable-product-model-normalization/ba-p/2284885 | 2026-09-29 | "HW models will not be normalized if they are not part of an opted-in Resource Category" |

## Afirmaciones validadas
RQ1 (de la revisión 1, conservadas)
1. Snipe-IT separa Assets, Accessories, Components y Consumables. Los componentes "se retiran (check out) a un activo". [S1]
2. GLPI agrega componentes de hardware a las computadoras, cada uno con tipo, nombre, fabricante, comentario y campos específicos del tipo. Los tipos son una lista cerrada ("no es posible agregar otros tipos que los listados") y "Otros componentes" funciona como válvula de escape. [S2]
3. En GLPI, los consumibles son un módulo aparte, con tipo de consumible, umbral de alerta y objetivo de stock. Se asignan a usuarios o grupos, se pueden devolver al inventario y tienen historial. No los gestionan el agente ni el inventario automático. La página no describe ningún vínculo entre consumible y equipo. [S3]
4. En Odoo, el producto tiene un tipo (Goods, Services o Combo). Para los bienes, el seguimiento se elige por producto (serie, lote o cantidad); sin seguimiento, el producto se asume siempre disponible. [S4, S5]
5. En ServiceNow, los modelos de hardware y los de consumible son distintos. El consumible se rastrea por cantidad mientras está en stock. La Model Category "categoriza modelos y activos" y los stockrooms son áreas de almacenamiento. [S8, S9]
6. En Freshservice, los tipos de activo o CI son jerárquicos (padre e hijo) y los tipos por defecto no se pueden borrar. No se documenta cómo renombrar ni fusionar tipos. [S7]
7. En JSM Assets, los tipos de objeto forman un árbol que, según la documentación, es "principalmente para navegación y legibilidad" y admite tipos vacíos. La herencia de atributos es configurable. [S6]

RQ1 (nuevas)
8. En Snipe-IT, el tipo o comportamiento de una categoría es un enum fijo y obligatorio de cinco valores: asset, accessory, consumable, component, license. El modelo Category no tiene relación padre/hijo entre categorías, así que la estructura es plana. Esa conclusión sale de leer el código fuente, no de una afirmación explícita de la documentación. [S12]
9. En Odoo Maintenance, el equipo se clasifica con una "Equipment Category" propia del módulo, con responsable y alias de correo. La página no menciona ninguna relación con los productos ni con las categorías de producto de Inventario. [S16]

RQ2 (nuevas)
10. En Snipe-IT, al tomar un componente del stock, el checkout valida `assigned_qty` contra el máximo disponible. Dentro de una transacción bloquea la fila del componente (`lockForUpdate`) y vuelve a verificar la cantidad restante antes de insertar una fila en el pivote (`components_assets`: asset_id, component_id, assigned_qty, created_by). El restante se calcula a partir de esas filas (`numRemaining()`); no hay un contador que se descuente en el componente. [S10]
11. En Snipe-IT, el único camino de instalación que aparece en el código es el checkout desde el stock. Ese controlador no tiene una opción "sin movimiento de stock": todo checkout resta disponibilidad. [S10]
12. En ServiceNow, consumir desde un stockroom pide la cantidad, reduce la cantidad del registro del stockroom y permite asociar el consumible a un activo padre (por ejemplo, un mouse a una computadora). Exige estado "In Stock" y subestado "Available". [S14]
13. En GLPI, un dispositivo (componente) se vincula a un ítem con `itemtype` + `items_id`, y agregar N unidades crea N filas, una por unidad. El código de esa clase no toca el stock, porque el catálogo de consumibles es otro módulo. Por lo tanto, agregar un componente en GLPI no descuenta stock de ningún catálogo. [S3, S13]

RQ3 (nuevas)
14. En Snipe-IT, el checkin identifica la fila del pivote, le resta la cantidad devuelta y la borra si queda en 0. El checkout y el checkin emiten eventos (`CheckoutableCheckedOut` / `CheckoutableCheckedIn`) con usuario y nota, que forman el historial. El reemplazo no existe como operación: es un checkin seguido de un checkout. [S10, S11]
15. En GLPI, agregar, actualizar y quitar un dispositivo de un ítem quedan en el historial como tres tipos distintos (`HISTORY_ADD_DEVICE`, `HISTORY_UPDATE_DEVICE`, `HISTORY_DELETE_DEVICE`). Además, las características de un componente se pueden modificar solo para el ítem vinculado. [S2, S13]
16. En ServiceNow, el consumo deja trazabilidad, pero la documentación obtenida no describe un flujo de reemplazo. Lo único que respalda qué significa "consumido" es la reducción de la cantidad. [S14]

RQ4
17. En GLPI, las reglas de diccionario agrupan datos redundantes y se pueden volver a aplicar sobre datos existentes. La documentación recomienda probarlas en una base de test y respaldar antes de producción, ajustar `memory_limit` en bases grandes y usar el script `compute_dictionary.php` por línea de comandos. Al volver a aplicar las reglas sobre una base existente se ignora la acción "Add regexp result", así que el resultado puede diferir del de la importación inicial. [S15]
18. En ServiceNow, la normalización de modelos de hardware y consumibles solo se aplica a los modelos de categorías de recursos "opt-in", y una tarea diaria actualiza los campos de normalización. Según el mismo texto, la tarea no agrega, quita ni fusiona modelos; esa parte salió de un resultado de búsqueda, no del artículo completo. Es una guía de calidad de datos, no de fusión de taxonomías. [S17]

## Contradicciones e incertidumbre
- Informe previo, "Odoo: categorías jerárquicas": sin validar con fuente primaria. Las páginas de categorías de Odoo 16, 17 y 18 dieron 404, y la jerarquía sale solo de resúmenes de búsqueda.
- Informe previo, "ServiceNow: asset tracking strategy": el término no aparece en las páginas leídas [S8, S9, S14, S17], así que no se afirma.
- Informe previo, "GLPI sin puente stock -> instalado": es consistente con [S3, S13], pero se deduce de lo que las fuentes no dicen.
- Informe previo, "Snipe-IT: categorías tipadas": confirmado [S12].
- RQ2 y RQ3 quedan sin documentar para Odoo (la página de equipos de Mantenimiento no describe repuestos [S16]), Freshservice y JSM Assets. No se consultó su documentación sobre instalación de componentes; no se afirma que no exista.
- "Componente instalado dentro de un activo adquirido, sin movimiento de stock": ninguna fuente obtenida documenta una opción explícita. En GLPI el componente existe sin descontar de ningún catálogo por cómo está construido [S13]; en Snipe-IT todo checkout resta disponibilidad [S10].
- RQ4: no se encontró una guía de proveedor para fusionar dos taxonomías (tipos de componente y familias de repuestos) en un catálogo. Se buscó en la documentación y el foro de GLPI (diccionarios, "merge", reglas), en ServiceNow (normalización de modelos, migración de Model Category, comunidad y soporte) y en JSM Assets (solo una búsqueda sobre tipos de objeto, sin artículo sobre reestructurarlos). Hay dos hallazgos indirectos [S15, S17]. Conclusión: no está documentado en esos lugares. No se buscó en Snipe-IT, Odoo (migración de categorías) ni Freshservice.
- S5 es un extracto parafraseado y S17 se basa en parte en un resultado de búsqueda. S12 y S13 los resumió un modelo intermedio del fetch; no se leyeron completos.
- Fallaron los accesos a DeepWiki (429) y a las páginas de categorías de Odoo (404).

## Frescura
Se accedió el 2026-09-29. Los archivos de código (S10 a S13) se leyeron de la rama por defecto (master/main) en esa fecha, sin verificar el commit ni la versión publicada. Odoo es la versión 18.0; JSM, la documentación Data Center; ServiceNow no indica versión (URL de la documentación actual).

## Opciones de producto (no autoritativas)
- Referencias para "descontar de stock": el modelo de Snipe-IT (transacción, verificación del restante bajo bloqueo y fila de asignación con cantidad) respalda que el descuento sea atómico, y el de ServiceNow respalda vincular un consumible a un activo padre. Ninguno respalda una opción explícita "sin movimiento", así que la casilla marcada por defecto es diseño propio.
- El historial de GLPI por componente (agregado, actualización y baja) y los eventos de checkin y checkout de Snipe-IT sugieren registrar la instalación y el retiro como eventos separados. El reemplazo sería una baja seguida de un alta.
- Snipe-IT usa un enum fijo por categoría y GLPI una lista cerrada de tipos. Los dos muestran lo que cuesta no derivar el tipo de datos de cada tenant; en este cambio el tipo se deriva de la familia.
- Para migrar dos taxonomías, la única guía, indirecta, es la de GLPI: probar y respaldar antes de volver a aplicar las reglas [S15].
