import { z } from "zod";

/** Espejo de `CreateClienteDto` (backend). Provisiona DB física + admin inicial — solo ROOT. */
export const crearClienteSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  razonSocial: z.string().optional().or(z.literal("")),
  cuit: z.string().optional().or(z.literal("")),
  adminEmail: z.string().email("Email inválido"),
  adminNombre: z.string().min(1, "Requerido"),
  adminApellido: z.string().min(1, "Requerido"),
  adminPassword: z.string().min(8, "Mínimo 8 caracteres"),
});
export type CrearClienteFormValues = z.infer<typeof crearClienteSchema>;
