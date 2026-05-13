# findings.md — Descobertas e Decisões Técnicas
# Controle de Retrabalhos Industriais

> Atualizado em: 2026-05-12 | Protocolo: V.L.A.E.G.

---

## 1. Descobertas sobre a Planilha

### Arquivo
- **Caminho:** `public/Planilha de Retrabalho.xlsx`
- **Tamanho:** ~2.4 MB
- **Status:** Arquivo presente e acessível

### Análise Pendente
- [ ] Identificar abas e estrutura de colunas
- [ ] Extrair part numbers únicos
- [ ] Extrair descrições e famílias
- [ ] Mapear setores presentes na planilha
- [ ] Identificar tipo de dados por coluna
- [ ] Avaliar qualidade dos dados para importação

**NOTA:** A planilha serve apenas como referência histórica e fonte de cadastro mestre de materiais. Não é fonte transacional.

---

## 2. Credenciais e Configurações

### Supabase
- **Projeto:** vgyntfdusnujmrhyskaq
- **URL:** https://vgyntfdusnujmrhyskaq.supabase.co
- **Anon Key:** Presente em notes.md ✅
- **Service Role Key:** Presente em notes.md ✅ (NÃO expor no frontend)
- **Status:** Conexão a validar na Fase L

### GitHub
- **Token:** Presente em notes.md (ghp_...) ✅
- **Repositório alvo:** controle-retrabalhos-industriais
- **Status:** A criar na Fase G

### Primeiro Admin
- **Email:** ynascimento@caloi.com ✅
- **Variável:** VITE_FIRST_ADMIN_EMAIL
- **Lógica:** Trigger no banco verifica email no cadastro e promove automaticamente para admin+approved

### Coolify / Hostinger
- **Status:** 🔴 BLOQUEIO — Credenciais ausentes
- **Pendência:** URL do Coolify, token de API Coolify, nome do app
- **Ação:** Registrado. Aguardando input do usuário quando chegar na Fase G

---

## 3. Decisões Técnicas

### DT-001: Saldo por etapa — Tabela materializada vs View
**Decisão:** Tabela `lot_stage_balances` com triggers PostgreSQL
**Motivo:** 
- View calculada pode ter performance ruim com muitos lotes/movimentos
- Trigger garante atomicidade junto com a transação de movimento
- Facilita validação de saldo antes de movimentar
**Risco:** Trigger desincronizado — mitigado por funções RPC atômicas
**Alternativa descartada:** View `v_lot_stage_balance` — viável mas menos performática

### DT-002: Stack Frontend
**Decisão:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui
**Motivo:**
- Vite: build rápido, compatível com Coolify
- Tailwind: flexível para tema industrial dark
- shadcn/ui: componentes acessíveis e customizáveis sem lock-in
- React Query: cache e sincronização com Supabase

### DT-003: Tema Visual
**Decisão:** Dark theme industrial baseado na imagem de inspiração
- Background: slate-900 / slate-800
- Cards: slate-800 com bordas slate-700
- Cores de status: verde (aprovado), amarelo (atenção), laranja (crítico), vermelho (urgente/erro), cinza (encerrado)
- Fonte: Inter ou similar (legível em resolução de fábrica)

### DT-004: Geração de lot_code
**Decisão:** Função RPC `generate_lot_code()` no banco
**Formato:** `RT-AAAAMMDD-SEQUENCIAL` (4 dígitos com zero à esquerda)
**Exemplo:** `RT-20260512-0001`
**Sequencial:** por dia (reinicia a cada dia) — garantido por lock no banco

### DT-005: Normalização de Part Number
**Decisão:** Campo `normalized_part_number` na `product_master`
**Regra:** Remove `.`, ` `, `/`, `-`, caracteres especiais. Mantém zeros à esquerda.
**Função SQL:** `normalize_part_number(text) → text`
**Busca:** autocomplete busca em ambos os campos (part_number e normalized_part_number)

---

## 4. Restrições Identificadas

1. Service Role Key **nunca** pode ir para o frontend ou variáveis VITE_*
2. Coolify requer repositório GitHub público ou com token configurado
3. RLS deve ser habilitado ANTES de inserir qualquer dado de produção
4. Migrations devem ser idempotentes (IF NOT EXISTS onde aplicável)
5. Não usar `DELETE` em tabelas operacionais (apenas soft delete ou sem delete)

---

## 5. Problemas Encontrados

| # | Problema | Status | Resolução |
|---|---|---|---|
| 1 | Coolify: sem credenciais disponíveis | 🔴 Aberto | Aguardando usuário — documentado em architecture/07_deployment.md |

---

## 6. Aprendizados de APIs, MCPs e Deploy

### Supabase
- JWT anon key contém `ref` do projeto para derivar URL
- Service Role Key não deve ser exposta via variáveis VITE_
- RLS policies devem ser testadas com usuários de diferentes perfis
- Funções RPC (SECURITY DEFINER) permitem operações privilegiadas seguras

### GitHub API
- Token ghp_ é Personal Access Token clássico
- Criar repositório via API: POST https://api.github.com/user/repos
- Push inicial requer git configurado com token no remote URL

---

## 7. Observações de Segurança

1. **VITE_SUPABASE_ANON_KEY** é pública por design — exposta no bundle do frontend. Segurança garantida por RLS.
2. **SUPABASE_SERVICE_ROLE_KEY** bypassa RLS — usar APENAS em scripts de migration e ferramentas server-side.
3. **VITE_FIRST_ADMIN_EMAIL** é sensível — registrar apenas em .env.local e variáveis de ambiente do Coolify.
4. Nenhum secret deve ir para o repositório GitHub (usar .gitignore para .env*)
5. Função `promote_first_admin()` deve ser SECURITY DEFINER e verificar email exato antes de promover.
