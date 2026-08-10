import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usados en los formularios del panel admin para resaltar en rojo la
// etiqueta y el borde de un campo que falló una validación.
export const errorLabelClass = (hasError?: boolean) =>
  cn("text-sm mb-1 block", hasError ? "text-destructive" : "text-muted-foreground");

export const errorInputClass = (hasError?: boolean) =>
  hasError ? "border-destructive focus-visible:ring-destructive" : "";
