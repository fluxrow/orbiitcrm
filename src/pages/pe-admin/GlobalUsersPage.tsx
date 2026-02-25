import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, KeyRound } from "lucide-react";
import { format } from "date-fns";
import SetPasswordDialog from "@/components/pe-admin/SetPasswordDialog";

export default function GlobalUsersPage() {
  const [pwdUser, setPwdUser] = useState<{ id: string; name: string } | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["pe-all-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pe_users" as any)
        .select("*, pe_roles(code, name), organizations:organization_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários Globais</h1>
        <p className="text-sm text-muted-foreground">Todos os usuários cadastrados no sistema</p>
      </div>

      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Organização</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : !users?.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum usuário</TableCell></TableRow>
            ) : (
              users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">
                    {u.full_name}
                    {u.is_super_admin && <Badge variant="destructive" className="ml-2 text-xs">Super Admin</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.organizations?.name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{u.pe_roles?.name || (u.is_super_admin ? "Global" : "—")}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "secondary"}>
                      {u.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(u.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPwdUser({ id: u.id, name: u.full_name || u.email })}>
                          <KeyRound className="w-4 h-4 mr-2" /> Definir Senha
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pwdUser && (
        <SetPasswordDialog
          open={!!pwdUser}
          onOpenChange={(open) => !open && setPwdUser(null)}
          userId={pwdUser.id}
          userName={pwdUser.name}
        />
      )}
    </div>
  );
}
