"use client";

/**
 * LoginForm — PRESENTATIONAL component.
 *
 * Receives all behavior via props — no mutations, no routing, no API calls.
 * Wired by the login page which uses the `use-login` hook.
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:frontend-ui-states/interactive-state LoginForm]
 * Constitution: rounded-md for interactive elements (inputs, button).
 */

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
  error?: string;
  isLoading: boolean;
}

export function LoginForm({ onSubmit, error, isLoading }: LoginFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (
      form.elements.namedItem("password") as HTMLInputElement
    ).value;
    onSubmit(email, password);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Email field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={isLoading}
          className={cn(
            "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          placeholder="tu@email.com"
        />
      </div>

      {/* Password field */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-foreground"
        >
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={isLoading}
          className={cn(
            "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          placeholder="••••••••"
        />
        {/* Error shown below password — generic message, no user enumeration */}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isLoading} className="w-full">
        Iniciar sesión
      </Button>
    </form>
  );
}
