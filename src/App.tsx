import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/context/CartContext";
import { ProductProvider } from "@/context/ProductContext";
import { AuthProvider } from "@/context/AuthContext";
import { CustomerAuthProvider } from "@/context/CustomerAuthContext";
import RequireAuth from "@/components/RequireAuth";
import ScrollToTop from "@/components/ScrollToTop";
import Index from "./pages/Index.tsx";
import Catalog from "./pages/Catalog.tsx";
import NotFound from "./pages/NotFound.tsx";
import Admin from "./pages/Admin.tsx";
import Checkout from "./pages/Checkout.tsx";
import ProductDetail from "./pages/ProductDetail.tsx";
import CustomerRegister from "./pages/CustomerRegister.tsx";
import OrderRegister from "./pages/OrderRegister.tsx";
import OrderRegularization from "./pages/OrderRegularization.tsx";
import CustomerAccount from "./pages/CustomerAccount.tsx";
import CustomerAccountRegister from "./pages/CustomerAccountRegister.tsx";
import CustomerLogin from "./pages/CustomerLogin.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ProductProvider>
        <CartProvider>
          <AuthProvider>
            <CustomerAuthProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/catalogo" element={<Catalog />} />
                  <Route path="/producto/:id" element={<ProductDetail />} />
                  <Route path="/checkout" element={<Checkout />} />
                  <Route path="/registro-cliente" element={<CustomerRegister />} />
                  <Route path="/registro-pedido" element={<OrderRegister />} />
                  <Route path="/registro-pedido/:customerId" element={<OrderRegister />} />
                  <Route path="/regularizacion-separaciones" element={<OrderRegularization />} />
                  <Route path="/mi-cuenta" element={<CustomerAccount />} />
                  <Route path="/mi-cuenta/registro" element={<CustomerAccountRegister />} />
                  <Route path="/mi-cuenta/ingresar" element={<CustomerLogin />} />
                  <Route
                    path="/admin"
                    element={
                      <RequireAuth>
                        <Admin />
                      </RequireAuth>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </CustomerAuthProvider>
          </AuthProvider>
        </CartProvider>
      </ProductProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
