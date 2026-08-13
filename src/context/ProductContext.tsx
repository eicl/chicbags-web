import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Product } from "@/context/CartContext";
import {
  fetchProducts,
  createProduct,
  updateProduct as updateProductApi,
  deleteProduct as deleteProductApi,
} from "@/lib/api";

interface ProductContextType {
  products: Product[];
  categories: string[];
  isLoading: boolean;
  isError: boolean;
  addProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: number) => void;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();

  const { data: products = [], isLoading, isError } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });

  const categories = ["Todos", ...Array.from(new Set(products.flatMap((p) => p.categories))).sort()];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  const addMutation = useMutation({ mutationFn: createProduct, onSuccess: invalidate });
  const updateMutation = useMutation({ mutationFn: updateProductApi, onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: deleteProductApi, onSuccess: invalidate });

  return (
    <ProductContext.Provider
      value={{
        products,
        categories,
        isLoading,
        isError,
        addProduct: (product) => addMutation.mutate(product),
        updateProduct: (product) => updateMutation.mutate(product),
        deleteProduct: (id) => deleteMutation.mutate(id),
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProducts = () => {
  const context = useContext(ProductContext);
  if (!context) throw new Error("useProducts must be used within ProductProvider");
  return context;
};
