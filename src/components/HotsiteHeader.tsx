import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, MessageCircle } from "lucide-react";
import orbitLogo from "@/assets/orbit-logo.png";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { WHATSAPP_LP_HREF } from "@/lib/whatsapp";

const NAV_ITEMS = [
  { label: "Produto", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
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
    <header className="fixed top-0 inset-x-0 z-50 bg-background/70 backdrop-blur-xl border-b border-border/40">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-16">
        <button onClick={() => navigate("/")} className="shrink-0 hover:opacity-80 transition-opacity">
          <img src={orbitLogo} alt="Orbit" className="h-8" />
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 story-link">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className="relative text-sm text-muted-foreground hover:text-foreground transition-colors after:content-[''] after:absolute after:w-full after:scale-x-0 after:h-0.5 after:bottom-[-2px] after:left-0 after:bg-primary after:origin-bottom-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-bottom-left"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle compact />
          <Button variant="ghost" size="sm" onClick={() => navigate("/demo")} className="text-muted-foreground hover:text-foreground hover:bg-secondary/60">
            Ver demo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-muted-foreground hover:text-foreground hover:bg-secondary/60">
            Entrar
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 transition-transform gap-2 ml-1"
          >
            <a href={WHATSAPP_LP_HREF} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-4 h-4" />
              Falar no WhatsApp
            </a>
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
            <ThemeToggle className="justify-center" />
            <Button variant="ghost" size="sm" onClick={() => { setMobileMenuOpen(false); navigate("/demo"); }}>Acessar Demo</Button>
            <Button variant="outline" size="sm" onClick={() => { setMobileMenuOpen(false); navigate("/auth"); }}>Entrar</Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            >
              <a href={WHATSAPP_LP_HREF} target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)}>
                <MessageCircle className="w-4 h-4" />
                Falar no WhatsApp
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
