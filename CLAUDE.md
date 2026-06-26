# CONSTITUCIÓN DEL PROYECTO: SOPORTE

## 1. STACK TECNOLÓGICO Y WORKSPACE
* **Project Name:** Soporte (Tickets de Incidencias, Compras y Reparaciones Edilicias)
* **Root Directory:** `/home/usuario/proyectos/soporte`
* **Backend:** NestJS (TypeScript), RESTful API, PostgreSQL (Prisma o TypeORM).
* **Frontend:** Next.js (TypeScript, App Router), Tailwind CSS v4, Radix UI/Shadcn.
* **Separación de Responsabilidades:** El backend y el frontend están 100% desacoplados. EL BACKEND NUNCA RENDERIZA VISTAS. EL FRONTEND NUNCA ACCEDE A LA DB DIRECTAMENTE.

## 2. REGLAS ARQUITECTÓNICAS INQUEBRANTABLES
* **Scope Rule (Regla de Alcance):** 
  * Si un componente, helper o constante se usa en **1 sola feature/página**, se almacena localmente en la carpeta de esa feature.
  * Si se comparte en **2 o más features**, se promueve INMEDIATAMENTE a directorios globales (`@/components/ui` o `/shared`).
* **Screaming Architecture:** La estructura de carpetas debe gritar el dominio del negocio (ej. `/backend/src/tickets`, `/backend/src/compras`, `/backend/src/reparaciones`).

## 3. PATRONES DE DISEÑO DEL FRONTEND (SUPER PREMIUM)

> Dirección de diseño establecida en el change `frontend-shell` (2026-06-26). El contrato preciso de tokens (radios exactos por categoría, paleta dual, manejo de FOUC) vive en el spec `frontend-design-system`, que ESE change actualiza. Esta sección es la dirección; el spec es el contrato. Aplica a lo existente y a todo lo nuevo.

* **Inspiración:** UI "Super Premium" — limpia, refinada, cinematográfica. PROHIBIDO usar diseños genéricos de plantilla antigua.
* **Tipografía:** Exclusivamente `Inter` o sans-serif geométrica limpia.
* **Modo Dual (Claro + Oscuro):** Todo componente DEBE incluir clases para ambos modos vía estrategia de clase `.dark`. Oscuro = fondos `slate-950` (no negro puro) para acabado cinematográfico; claro = limpio y de alto contraste WCAG AA. (SUPERA la regla anterior "dark-only" del spec `frontend-design-system`, que se actualiza dentro del change `frontend-shell`.)
* **Glassmorphism:** Las tarjetas principales son translúcidas (`backdrop-blur`) con bordes ultra-finos: `border-white/5` en oscuro, `border-slate-200/50` en claro.
* **Espaciado generoso:** Paddings amplios (mínimo `1.5rem`–`2rem` en contenedores). Transiciones suaves (`transition-all duration-300`) en estados hover y active.
* **Radios:** Contenedores (cards/paneles) `rounded-lg` o superior; formularios e inputs `rounded-xl` (12px). (El detalle exacto por categoría — botones, dropdowns, badges — se fija en el spec del change.)
* **Navegación — Menú lateral:** Sidebar izquierdo `w-72`, minimalista, colapsable o fijo, con iconos vectoriales delgados (Lucide) y tipografía refinada. El item activo se destaca con sutileza, sin estridencias. (Resuelve la IA del shell — Opción B de la exploración; reemplaza el top-nav actual.)
* **Formularios:** Inputs `rounded-xl`, fondos limpios, labels superiores en mayúsculas compactas, espaciadas y atenuadas (`text-xs tracking-wider`).
* **Listados:** EVITAR tablas HTML densas y tradicionales. Diseñar "filas-tarjeta" individuales y espaciadas: icono del dispositivo a la izquierda, cliente/ID jerarquizados al centro, badges de estado translúcidos a la derecha (`amber-500/10` espera, `emerald-500/10` listo). Badges `rounded-md` (no pill).
* **Vistas de impresión:** SIEMPRE un bloque `@media print`: ocultar menú y botones de acción, forzar fondo blanco y texto negro de alta legibilidad, estructurar el reporte con divisores finos y minimalistas.
* **Fases obligatorias de interfaz (se mantienen):**
  * *Skeleton Loader:* Animación tenue durante cargas. No usar spinners de pantalla completa.
  * *Empty State:* Ilustración amigable y acción clara cuando no hay registros.
  * *Interactive State:* Botones con estado de carga ("Cargando..." + disabled + spinner interno) al enviar formularios.
* **Responsive Mobile-First:** Código modular y 100% responsive. El nav en pantallas < 768px se resuelve vía drawer/hamburger (estrategia exacta definida en el spec del change).

## 4. FLUJO DE TRABAJO (SDD & TDD)
1. **Explore & Plan:** NUNCA escribas código directamente. Describe primero el plan de diseño y arquitectura.
2. **Test-First (TDD estricto):** Escribe primero el test, hazlo fallar (fase RED) antes de programar la solución (fase GREEN). Esto NO se negocia (`strict_tdd: true`).

## 5. TESTING EFECTIVO (anti-bucle infinito)

> Test-First se MANTIENE. Lo que cambia es la PROFUNDIDAD: tests atómicos, no andamiajes elaborados que terminan siendo la fuente del error.

1. **Contrato antes que andamiaje:** Definí la interfaz/contrato de la unidad antes de escribir el test. El test RED apunta a ese contrato, no a una implementación a medio consolidar. (No es "lógica primero" — es "contrato primero", compatible con Test-First.)
2. **Tests unitarios atómicos:** Puros, aislados, enfocados en un input → un output. Prohibido el over-mocking. La complejidad del test NUNCA debe superar la de la unidad que prueba.
3. **Integración/e2e como capa fina y deliberada:** NO se prohíbe — el e2e atrapó 2 bugs críticos que 86 unit tests verdes ocultaban. Se usa donde gana valor (flujos reales), no para todo. Sin mocks pesados de DB/servicios en la primera iteración unitaria.
4. **Verificación de entorno previa:** Antes de ejecutar un comando de test, verificá que dependencias, tipos y rutas de importación existan y sean correctas. No asumas que el entorno adivina los paths.
5. **Corte de bucle automático:** Si un test falla 2 veces consecutivas, DETENÉ la corrección automática. No sigas con parches ciegos. Presentá el error detallado en la terminal y pedí clarificación del contexto antes de modificar más archivos.

> Nota: este proyecto es **Test-First (RED→GREEN)** por decisión explícita del usuario (2026-06-26). NO se aplica "lógica primero / test después" aunque aparezca en plantillas pegadas — Test-First gana.

## 6. CALIDAD DE CÓDIGO Y DOCUMENTACIÓN (CLEAN CODE)

* **Patrones de diseño:** Aplicá patrones reconocidos (Factory, Strategy, Repository, Singleton, etc.) cuando la arquitectura lo amerite, para mantener el código desacoplado y mantenible. No los fuerces donde no suman.
* **SOLID:** Cada clase o función con una única responsabilidad. Favorecé la composición sobre la herencia.
* **Documentación clara:** Todo método, API o componente complejo lleva doc concisa (JSDoc/TSDoc o equivalente) con propósito, parámetros y retornos, sin redundancias. Comentá el "por qué", no el "qué".

## 7. SEGURIDAD POR DISEÑO

* **Validación estricta:** Validación rigurosa de tipos, sanitización de inputs y escape de outputs para prevenir inyecciones (SQL, XSS, etc.).
* **Gestión de secretos:** PROHIBIDO hardcodear credenciales, tokens o llaves. Siempre variables de entorno (`.env`).
* **Menor privilegio:** Diseñá consultas y mutaciones validando el contexto de usuario **y de tenant** (app multi-tenant) antes de exponer o modificar cualquier dato sensible.
