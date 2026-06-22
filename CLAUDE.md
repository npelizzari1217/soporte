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

## 3. PATRONES DE DISEÑO DEL FRONTEND (PREMIUM)
* **Visual Theme:** Estética ultra limpia, minimalista y oscura por defecto, inspirada en Stripe/Linear.
* **Consistencia de Formas:**
  * ALWAYS use `rounded-lg` (8px) para tarjetas contenedoras y paneles.
  * ALWAYS use `rounded-md` (6px) para elementos interactivos como botones, inputs y dropdowns.
* **Fases Obligatorias de Interfaz:** Todo listado de tickets, compras o reparaciones debe implementar obligatoriamente:
  * *Skeleton Loader:* Animación tenue durante cargas. No usar spinners de pantalla completa.
  * *Empty State:* Ilustración amigable y acción clara cuando no hay registros.
  * *Interactive State:* Botones con estado de carga ("Loading..." + disabled + spinner interno) al enviar formularios.

## 4. FLUJO DE TRABAJO (SDD & TDD)
1. **Explore & Plan:** NUNCA escribas código directamente. Describe primero el plan de diseño y arquitectura.
2. **Test-First (TDD):** Escribe primero los tests de integración/unitarios. Hazlos fallar (fase RED) antes de programar la solución (fase GREEN).
