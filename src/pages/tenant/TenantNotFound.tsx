import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SearchX } from "lucide-react";

export default function TenantNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <SearchX className="mx-auto h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Empresa não encontrada</h1>
        <p className="text-muted-foreground">
          O endereço informado não corresponde a nenhuma empresa ativa. Verifique o link e tente novamente.
        </p>
        <Link to="/auth">
          <Button>Ir para Login</Button>
        </Link>
      </div>
    </div>
  );
}
