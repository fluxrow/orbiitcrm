import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import orbitLogo from "@/assets/orbit-logo.png";

const NAV_ITEMS = [
  { label: "Produto", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
  { label: "Planos", href: "#planos" },
  { label: "FAQ", href: "#faq" },
];

export default function HotsiteHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    const id = href.slice(1);
    if (location.pathname === "/") {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/" + href);
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 glass-card border-t-0 rounded-none border-x-0">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-16">
        <button onClick={() => navigate("/")} className="shrink-0">
          <img src={orbitLogo} alt="Orbit" className="h-8" />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/demo")}>
            Acessar Demo
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
            Entrar
          </Button>
          <Button size="sm" onClick={() => navigate("/trial")}>
            Começar Trial
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-card border-t border-border px-4 pb-4 space-y-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className="block w-full text-left text-sm text-muted-foreground py-2"
            >
              {item.label}
            </button>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => { setMobileMenuOpen(false); navigate("/demo"); }}>Acessar Demo</Button>
            <Button variant="outline" size="sm" onClick={() => { setMobileMenuOpen(false); navigate("/auth"); }}>Entrar</Button>
            <Button size="sm" onClick={() => { setMobileMenuOpen(false); navigate("/trial"); }}>Começar Trial</Button>
          </div>
        </div>
      )}
    </header>
  );
}
