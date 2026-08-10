import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LogOut, Package, Tag, Layers, Users, IdCard, MapPin, ShoppingBag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminBrands from "@/components/admin/AdminBrands";
import AdminCategories from "@/components/admin/AdminCategories";
import AdminCustomers from "@/components/admin/AdminCustomers";
import AdminDistricts from "@/components/admin/AdminDistricts";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminOrders from "@/components/admin/AdminOrders";

type Tab = "products" | "brands" | "categories" | "customers" | "districts" | "orders" | "users";

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "products", label: "Productos", icon: Package },
  { id: "brands", label: "Marcas", icon: Tag },
  { id: "categories", label: "Categorías", icon: Layers },
  { id: "customers", label: "Clientes", icon: IdCard },
  { id: "districts", label: "Distritos", icon: MapPin },
  { id: "orders", label: "Pedidos", icon: ShoppingBag },
  { id: "users", label: "Usuarios", icon: Users },
];

const Admin = () => {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("products");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 py-4 px-4 md:px-8">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
            </Link>
            <h1 className="flex items-center gap-2 text-lg sm:text-xl md:text-2xl font-semibold tracking-tight truncate" style={{ fontFamily: "var(--font-display)" }}>
              <img src="/chicBags.jpeg" alt="ChicBags" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0" />
              Panel Admin — ChicBags
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && <span className="hidden sm:inline text-sm text-muted-foreground">{user.username}</span>}
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="container mx-auto px-4 md:px-8">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  tab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8 py-8">
        {tab === "products" && <AdminProducts />}
        {tab === "brands" && <AdminBrands />}
        {tab === "categories" && <AdminCategories />}
        {tab === "customers" && <AdminCustomers />}
        {tab === "districts" && <AdminDistricts />}
        {tab === "orders" && <AdminOrders />}
        {tab === "users" && <AdminUsers />}
      </div>
    </div>
  );
};

export default Admin;
