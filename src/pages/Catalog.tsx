import Header from "@/components/Header";
import ProductCatalog from "@/components/ProductCatalog";
import CartDrawer from "@/components/CartDrawer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Footer from "@/components/Footer";

const Catalog = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <ProductCatalog />
    <CartDrawer />
    <WhatsAppButton />
    <Footer />
  </div>
);

export default Catalog;
