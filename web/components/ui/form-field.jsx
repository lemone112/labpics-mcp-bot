"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

const FormFieldContext = React.createContext({});

const FormField = ({
  className,
  children,
  error,
  label,
  required,
  hint,
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const fieldId = id || generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <FormFieldContext.Provider value={{ fieldId, errorId, hintId }}>
      <div className={cn("grid gap-1.5", className)} {...props}>
        {label ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={fieldId} className="leading-none">
              {label}
              {required ? <span className="text-destructive"> *</span> : null}
            </Label>
          </div>
        ) : null}

        {children}

        {hint ? (
          <p id={hintId} className="text-muted-foreground text-xs">
            {hint}
          </p>
        ) : null}

        {error ? (
          <p
            id={errorId}
            role="alert"
            className={cn("text-sm text-destructive", className)}
          >
            {error}
          </p>
        ) : null}
      </div>
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const context = React.useContext(FormFieldContext);
  if (!context) {
    throw new Error("useFormField must be used within a FormField");
  }
  return context;
};

export { FormField, useFormField };
