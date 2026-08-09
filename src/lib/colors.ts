import { ProductColor } from "@/context/CartContext";

export const sortColors = (colors: ProductColor[]): ProductColor[] =>
  [...colors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
