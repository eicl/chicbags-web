import { useState } from "react";
import { Search } from "lucide-react";
import { useProducts } from "@/context/ProductContext";
import { Product } from "@/context/CartContext";
import { Input } from "@/components/ui/input";
import ProductCard from "./ProductCard";

// Stock total del producto (suma del stock de todos sus colores) — el
// catálogo muestra primero los que tienen más disponible.
const totalStock = (product: { colors?: { stock: number }[] }) =>
  (product.colors ?? []).reduce((sum, c) => sum + c.stock, 0);

// Misma búsqueda que el panel admin (AdminProducts.tsx): nombre, código,
// marca y categorías.
const matchesProduct = (product: Product, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [product.name, product.code, product.brand, ...product.categories]
    .some((field) => (field ?? "").toLowerCase().includes(q));
};

const ProductCatalog = () => {
  const { products: allProducts, isLoading, isError } = useProducts();
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [query, setQuery] = useState("");

  // El contexto trae todos los productos cuando hay sesión de admin (para
  // poder gestionar los ocultos desde el panel) — el catálogo público
  // igual solo debe mostrar los visibles, sesión o no, así que las
  // categorías también se recalculan solo a partir de esos.
  const products = allProducts.filter((p) => p.visible);
  const categories = ["Todos", ...Array.from(new Set(products.flatMap((p) => p.categories))).sort()];
  const filtered = (activeCategory === "Todos" ? products : products.filter((p) => p.categories.includes(activeCategory)))
    .filter((p) => matchesProduct(p, query))
    .slice()
    .sort((a, b) => totalStock(b) - totalStock(a));
  const newestIds = new Set(
    products.slice().sort((a, b) => b.id - a.id).slice(0, 4).map((p) => p.id)
  );

  return (
    <section id="catalogo" className="container mx-auto px-4 md:px-8 py-16 md:py-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-medium mb-3" style={{ fontFamily: "var(--font-display)" }}>
          Nuestro Catálogo
        </h2>
        <div className="w-16 h-1 bg-primary mx-auto mb-4 rounded-full" aria-hidden="true" />
        <p className="text-muted-foreground max-w-md mx-auto">
          Encuentra las carteras que buscas, al mejor precio del mercado.
        </p>
      </div>

      <div className="relative max-w-md mx-auto mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, código, marca o categoría..."
          className="pl-9"
        />
      </div>

      <div className="flex justify-center gap-4 md:gap-6 mb-12 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`text-sm tracking-widest uppercase pb-1 transition-colors border-b-2 ${
              activeCategory === cat
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-center text-muted-foreground py-12">Cargando catálogo...</p>
      )}

      {isError && (
        <p className="text-center text-destructive py-12">
          No se pudo cargar el catálogo. Verifica que la API esté corriendo.
        </p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">Ningún producto coincide con la búsqueda.</p>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} isNew={newestIds.has(product.id)} />
          ))}
        </div>
      )}
    </section>
  );
};

export default ProductCatalog;
