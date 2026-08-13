import { useState } from "react";
import { useProducts } from "@/context/ProductContext";
import ProductCard from "./ProductCard";

const ProductCatalog = () => {
  const { products, categories, isLoading, isError } = useProducts();
  const [activeCategory, setActiveCategory] = useState("Todos");

  const filtered = activeCategory === "Todos" ? products : products.filter((p) => p.categories.includes(activeCategory));
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

      {!isLoading && !isError && (
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
