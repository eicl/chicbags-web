import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import TrustBar from "@/components/TrustBar";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";
import CartDrawer from "@/components/CartDrawer";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const Index = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <HeroSection />
    <TrustBar />
    <AboutSection />
    <ContactSection />
    <CartDrawer />
    <WhatsAppButton />
    <Footer />
  </div>
);

export default Index;
