"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const FormFieldContext = React.createContext(null);

function useFormField() {
  return React.useContext(FormFieldContext);
}

function FormField({ id, label, error, className, children }) {
  const fieldId = React.useId();
  const resolvedId = id || fieldId;
  const errorId = `${resolvedId}-error`;

  const ctx = React.useMemo(
    () => ({ id: resolvedId, errorId, error }),
    [resolvedId, errorId, error]
  );

  return (
    <FormFieldContext.Provider value={ctx}>
      <div className={cn("space-y-1.5", className)}>
        {label && <Label htmlFor={resolvedId}>{label}</Label>}
        {typeof children === "function"
          ? children({
              id: resolvedId,
              "aria-describedby": error ? errorId : undefined,
              "aria-invalid": error ? true : undefined,
            })
          : children}
        {error && <FormError id={errorId}>{error}</FormError>}
      </div>
    </FormFieldContext.Provider>
  );
}

function FormError({ id, className, children }) {
  if (!children) return null;

  return (
    <p
      id={id}
      role="alert"
      className={cn("text-[13px] text-destructive", className)}
    >
      {children}
    </p>
  );
}

export { FormField, FormError, useFormField };
