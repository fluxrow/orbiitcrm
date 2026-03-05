

# Filtros avançados na página Prospects

## Resumo

Adicionar 4 novos filtros (WhatsApp, WhatsApp verificado, Email, Contato disponível) com chips de filtros ativos e botão X para remoção rápida. Todos client-side, aplicados sobre os dados já carregados.

## Abordagem

Os filtros serão aplicados **client-side** no `useMemo` de `filtered`, pois os dados já são carregados integralmente via paginação. Isso evita complexidade de queries Supabase com `is.null` / `neq` combinados e mantém a UX instantânea.

## Mudanças em `src/pages/orbit/ProspectsPage.tsx`

### 1. Novos estados de filtro

```typescript
const [whatsappFilter, setWhatsappFilter] = useState("all");       // all | com | sem
const [whatsappStatusFilter, setWhatsappStatusFilter] = useState("all"); // all | valido | nao_verificado | invalido
const [emailFilter, setEmailFilter] = useState("all");             // all | com | sem
const [contatoFilter, setContatoFilter] = useState("all");         // all | whatsapp | email | ambos | nenhum
```

### 2. Novos Selects no painel de filtros (linha 165–184)

Adicionar 4 novos `<Select>` após os existentes, antes do contador:
- **WhatsApp**: Todos / Com WhatsApp / Sem WhatsApp
- **WhatsApp verificado**: Todos / Verificado / Não verificado / Inválido
- **Email**: Todos / Com email / Sem email
- **Contato disponível**: Todos / WhatsApp / Email / Ambos / Nenhum

### 3. Lógica de filtragem no `useMemo` (linha 93–105)

Adicionar filtros após o filtro de origem:

- `whatsappFilter === "com"` → `p.whatsapp != null && p.whatsapp !== ""`
- `whatsappFilter === "sem"` → `p.whatsapp == null || p.whatsapp === ""`
- `whatsappStatusFilter !== "all"` → `p.whatsapp_status === valor`
- `emailFilter === "com"` → `p.email_principal != null && p.email_principal !== ""`
- `emailFilter === "sem"` → `p.email_principal == null || p.email_principal === ""`
- `contatoFilter`:
  - `whatsapp` → `whatsapp_status === "valido"`
  - `email` → email preenchido
  - `ambos` → ambas condições
  - `nenhum` → sem WhatsApp válido E sem email

### 4. Chips de filtros ativos (entre filtros e grid)

Renderizar badges/chips para cada filtro ativo (valor !== "all") com label descritivo e botão X que reseta para "all". Usar o componente `Badge` existente com um botão X inline.

```
[WhatsApp: Com WhatsApp ×] [Email: Com email ×] [Status WA: Verificado ×]
```

Helper para mapear valores para labels legíveis.

### 5. Resetar página ao mudar filtros

Cada `onValueChange` dos novos Selects chama `setPage(0)`.

## Arquivo alterado

| Arquivo | Ação |
|---|---|
| `src/pages/orbit/ProspectsPage.tsx` | 4 novos filtros, chips ativos, lógica de filtragem |

