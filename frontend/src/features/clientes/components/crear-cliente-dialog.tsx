"use client";

/**
 * CrearClienteDialog — provisiona un cliente (tenant) nuevo completo: DB
 * física + admin inicial (T4.6, R16-R18). Exclusivo ROOT — el caller
 * (`ClientesAdminView`) ya gatea por `isGlobalAdmin` antes de montar esto,
 * pero el backend revalida de todos modos (`GlobalAdminGuard`).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrearCliente } from "../hooks/use-clientes-mutations";
import { crearClienteSchema, type CrearClienteFormValues } from "../schemas";

const FIELDS: { name: keyof CrearClienteFormValues; label: string; type?: string }[] = [
  { name: "nombre", label: "Nombre" },
  { name: "razonSocial", label: "Razón social (opcional)" },
  { name: "cuit", label: "CUIT (opcional)" },
  { name: "adminEmail", label: "Email del admin", type: "email" },
  { name: "adminNombre", label: "Nombre del admin" },
  { name: "adminApellido", label: "Apellido del admin" },
  { name: "adminPassword", label: "Contraseña del admin", type: "password" },
];

export function CrearClienteDialog() {
  const [open, setOpen] = useState(false);
  const mutation = useCrearCliente();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearClienteFormValues>({
    resolver: zodResolver(crearClienteSchema),
    defaultValues: {
      nombre: "",
      razonSocial: "",
      cuit: "",
      adminEmail: "",
      adminNombre: "",
      adminApellido: "",
      adminPassword: "",
    },
  });

  function submit(values: CrearClienteFormValues) {
    mutation.mutate(
      {
        nombre: values.nombre,
        razonSocial: values.razonSocial || undefined,
        cuit: values.cuit || undefined,
        adminEmail: values.adminEmail,
        adminNombre: values.adminNombre,
        adminApellido: values.adminApellido,
        adminPassword: values.adminPassword,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo cliente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          {FIELDS.map((field) => (
            <div key={field.name} className="flex flex-col gap-1">
              <label htmlFor={`cliente-${field.name}`} className="text-sm font-medium text-foreground">
                {field.label}
              </label>
              <Input
                id={`cliente-${field.name}`}
                type={field.type ?? "text"}
                error={!!errors[field.name]}
                {...register(field.name)}
              />
              {errors[field.name] && (
                <p role="alert" className="text-sm text-destructive">
                  {errors[field.name]?.message}
                </p>
              )}
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
