import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Product, ProductColor } from "@/context/CartContext";
import { productImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

interface ProductOrderPickerProps {
  products: Product[];
  onAdd: (product: Product, color: ProductColor) => void;
  // Para Regularización de Separaciones: no se descuenta stock, así que no
  // tiene sentido bloquear colores agotados ni mostrar "Agotado".
  ignoreStock?: boolean;
}

const matches = (product: Product, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [product.name, product.code, product.brand, product.category]
    .some((field) => (field ?? "").toLowerCase().includes(q));
};

const ProductOrderPicker = ({ products, onAdd, ignoreStock = false }: ProductOrderPickerProps) => {
  const [query, setQuery] = useState("");
  const filtered = products.filter((p) => matches(p, query)).slice(0, 20);

  return (
    <div>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Busca por nombre, código, marca o categoría..."
      />
      {query.trim() && (
        <div className="mt-2 max-h-96 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No se encontró ningún producto con ese texto.</p>
          )}
          {filtered.map((product) => (
            <div key={product.id} className="border border-border rounded-lg p-3 bg-card flex gap-3">
              <div className="w-14 h-14 rounded bg-muted overflow-hidden shrink-0">
                {product.image && (
                  <img src={productImageUrl(product.image)} alt={product.name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-sm font-medium shrink-0">S/.{product.price.toFixed(2)}</p>
                </div>
                {product.code && <p className="text-xs text-muted-foreground">{product.code}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(product.colors ?? []).map((color) => {
                    const blocked = !ignoreStock && color.stock <= 0;
                    return (
                      <button
                        key={color.name}
                        type="button"
                        disabled={blocked}
                        onClick={() => onAdd(product, color)}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors",
                          blocked
                            ? "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                            : "border-input hover:border-primary hover:bg-primary/5"
                        )}
                        title={blocked ? "Agotado" : `Agregar ${color.name}`}
                      >
                        <span className="w-3 h-3 rounded-full border border-border shrink-0" style={{ backgroundColor: color.hex }} />
                        {color.name}
                        <span className="text-muted-foreground">
                          {color.stock <= 0 ? "· Agotado" : `· ${color.stock}`}
                        </span>
                      </button>
                    );
                  })}
                  {(product.colors ?? []).length === 0 && (
                    <span className="text-xs text-muted-foreground">Sin colores/stock disponible</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductOrderPicker;
