# gemini.md — Constituição do Projeto
# Controle de Retrabalhos Industriais

> **Este arquivo é a Lei do Projeto.** Toda implementação deve seguir estritamente o que está definido aqui.
> Atualizar gemini.md ANTES de alterar qualquer código quando uma regra, schema ou invariante mudar.

---

## 1. Objetivo do Sistema

Substituir o controle manual em planilha por um sistema web robusto, rastreável e transacional para controle de retrabalhos em uma fábrica de bicicletas (Caloi).

O sistema controla cada lote de retrabalho desde a entrada até o destino final (aprovado, sucatado ou cancelado), com rastreabilidade completa, indicadores gerenciais e bloqueio de qualidade formal.

---

## 2. Escopo Funcional

- Cadastro e controle de lotes de retrabalho por part number
- Geração automática de código de lote (RT-AAAAMMDD-SEQUENCIAL)
- Movimentação parcial ou total entre etapas do processo
- Controle de saldo por etapa (nunca negativo)
- Bloqueio e inspeção de qualidade com documento formal
- Aprovação e reprovação parcial ou total
- Envio para sucata com motivo obrigatório
- Dashboard executivo com KPIs, aging, gargalos e reincidência
- Gestão de usuários com aprovação manual pelo admin
- Perfis: pending, user, quality, admin
- Auditoria completa de todas as ações
- Importação de dados da planilha legado para product_master
- Autenticação via Supabase Auth
- RLS (Row Level Security) em todas as tabelas sensíveis

---

## 3. Fora de Escopo

- Integração com ERP (SAP, TOTVS etc.)
- Controle de estoque geral (apenas retrabalho)
- NF-e ou documentos fiscais
- Controle financeiro ou custo do retrabalho
- Gestão de fornecedores
- App mobile nativo
- Planilha como fonte transacional (apenas referência/importação inicial)

---

## 4. Schemas de Dados

### 4.1 profiles
```sql
id uuid primary key references auth.users(id)
full_name text not null
email text not null unique
area text
job_title text
role text not null default 'user'         -- user | quality | admin
status text not null default 'pending'     -- pending | approved | rejected | inactive
created_at timestamptz default now()
updated_at timestamptz default now()
approved_at timestamptz
approved_by uuid references profiles(id)
```

### 4.2 product_master
```sql
id uuid primary key default gen_random_uuid()
part_number text not null
normalized_part_number text not null unique  -- sem pontos, espaços, hífens, barras
description text not null
family text
material_type text
active boolean default true
created_at timestamptz default now()
updated_at timestamptz default now()
```

**Regra de normalização:** remover `.`, ` `, `/`, `-`, caracteres especiais. Manter zeros à esquerda.
Exemplo: `016312.10002` → `01631210002`

### 4.3 process_stages
```sql
id uuid primary key default gen_random_uuid()
name text not null unique
sequence integer not null
active boolean default true
created_at timestamptz default now()
```

**Seeds obrigatórios (em ordem):**
1. Entrada (seq 1)
2. Montagem (seq 2)
3. Pintura Pó (seq 3)
4. Pintura Líquida (seq 4)
5. Tratamento Térmico (seq 5)
6. Solda Aço (seq 6)
7. Solda Alumínio (seq 7)
8. Decapagem Química (seq 8)
9. Decapagem Térmica (seq 9)
10. Qualidade (seq 10)
11. Aprovado (seq 11)
12. Sucata (seq 12)

### 4.4 defect_types
```sql
id uuid primary key default gen_random_uuid()
name text not null
process_area text
active boolean default true
created_at timestamptz default now()
```

**Seeds:**
Falha de solda, Trinca, Porosidade, Amassado, Risco, Falha de pintura, Contaminação, Falha dimensional, Falha de decapagem, Retrabalho de montagem, Falha de tratamento térmico, Outro

### 4.5 rework_lots
```sql
id uuid primary key default gen_random_uuid()
lot_code text not null unique                 -- RT-AAAAMMDD-SEQUENCIAL
part_number_id uuid not null references product_master(id)
quantity_initial numeric not null check (quantity_initial > 0)
quantity_open numeric not null check (quantity_open >= 0)
origin_area text not null
current_status text not null                  -- ver status operacionais
quality_status text not null                  -- ver status de qualidade
defect_type_id uuid references defect_types(id)
defect_description text not null
quality_block_required boolean default true
quality_block_number text
opened_at timestamptz not null default now()
closed_at timestamptz
created_by uuid references profiles(id)
created_at timestamptz default now()
updated_at timestamptz default now()
```

### 4.6 lot_movements
```sql
id uuid primary key default gen_random_uuid()
lot_id uuid not null references rework_lots(id)
from_stage_id uuid references process_stages(id)   -- null na entrada inicial
to_stage_id uuid not null references process_stages(id)
quantity numeric not null check (quantity > 0)
movement_type text not null                          -- initial | transfer | adjustment | reversal
moved_at timestamptz default now()
moved_by uuid references profiles(id)
notes text
created_at timestamptz default now()
```

### 4.7 lot_stage_balances (tabela materializada com trigger)
```sql
id uuid primary key default gen_random_uuid()
lot_id uuid not null references rework_lots(id)
stage_id uuid not null references process_stages(id)
balance_quantity numeric not null default 0 check (balance_quantity >= 0)
updated_at timestamptz default now()
unique(lot_id, stage_id)
```

**Decisão:** usar tabela com triggers para performance e confiabilidade. Documentado em architecture/02_database_schema.md.

### 4.8 quality_events
```sql
id uuid primary key default gen_random_uuid()
lot_id uuid not null references rework_lots(id)
event_type text not null   -- block | unblock | inspection | approve | reject | send_to_scrap
quantity numeric check (quantity is null or quantity > 0)
result text
quality_document text
notes text
created_at timestamptz default now()
created_by uuid references profiles(id)
```

### 4.9 scrap_events
```sql
id uuid primary key default gen_random_uuid()
lot_id uuid not null references rework_lots(id)
quantity numeric not null check (quantity > 0)
reason text not null
approved_by uuid references profiles(id)
created_at timestamptz default now()
```

### 4.10 attachments
```sql
id uuid primary key default gen_random_uuid()
lot_id uuid references rework_lots(id)
file_url text not null
file_type text
description text
uploaded_by uuid references profiles(id)
created_at timestamptz default now()
```

### 4.11 audit_log
```sql
id uuid primary key default gen_random_uuid()
table_name text not null
record_id uuid
action text not null
old_data jsonb
new_data jsonb
user_id uuid
created_at timestamptz default now()
```

### 4.12 legacy_rework_snapshots (opcional)
```sql
id uuid primary key default gen_random_uuid()
snapshot_date date
part_number text
normalized_part_number text
description text
family text
stage_name text
quantity numeric
source_file text
created_at timestamptz default now()
```

---

## 5. Status Operacionais do Lote

| Valor | Descrição |
|---|---|
| `open` | Aberto |
| `in_rework` | Em retrabalho |
| `awaiting_quality` | Aguardando qualidade |
| `partially_approved` | Parcialmente aprovado |
| `approved` | Aprovado |
| `partially_scrapped` | Parcialmente sucateado |
| `scrapped` | Sucateado |
| `closed` | Encerrado |
| `cancelled` | Cancelado |

---

## 6. Status de Qualidade do Lote

| Valor | Descrição |
|---|---|
| `pending_block` | Pendente de bloqueio |
| `blocked` | Bloqueado |
| `in_inspection` | Em inspeção |
| `approved` | Aprovado |
| `rejected` | Reprovado |
| `unblocked` | Desbloqueado |
| `scrap_approved` | Sucata aprovada |

---

## 7. Regras de Negócio

### 7.1 Regras de Usuário
1. Todo novo cadastro: `role = user`, `status = pending`
2. Usuário `pending` não acessa área operacional
3. Usuário `pending` vê apenas tela de espera
4. Admin aprova ou rejeita usuários
5. Admin promove para `admin` ou `quality`
6. Admin desativa usuário (`inactive`)
7. Usuário comum não altera permissões nem executa ações de qualidade

### 7.2 Regras de Lote
1. Cada entrada gera um lote único com código RT-AAAAMMDD-SEQUENCIAL
2. Quantidade inicial sempre > 0
3. Part number obrigatório e deve existir em product_master
4. Defeito obrigatório
5. Setor inicial obrigatório
6. Lote só encerra quando quantity_open = 0 e todo saldo tiver destino final

### 7.3 Regras de Movimentação
1. Quantidade > 0
2. Quantidade ≤ saldo disponível na etapa origem
3. Destino ≠ origem
4. Movimentação parcial permitida
5. Saldo nunca negativo
6. Edição destrutiva proibida — correção por ajuste rastreável

### 7.4 Regras de Qualidade
1. Apenas `admin` ou `quality` pode criar quality_events
2. Lote sem bloqueio formal aparece em alerta crítico no dashboard
3. Aprovação exige evento de qualidade prévio
4. Sucata exige motivo obrigatório
5. Desbloqueio apenas após aprovação

### 7.5 Regras de Sucata
1. Apenas `admin` ou `quality`
2. Motivo obrigatório
3. Cria scrap_event + quality_event + lot_movement → etapa Sucata
4. Reduz quantity_open
5. Atualiza status do lote

### 7.6 Regras de Encerramento
Lote só pode ser encerrado quando:
- `quantity_open = 0`
- Todo saldo com destino final (Aprovado, Sucata ou Cancelado por admin com justificativa)
- Sem saldo pendente em etapa operacional
- Sem inspeção de qualidade pendente

---

## 8. Invariantes Arquiteturais

1. **Service Role NUNCA exposto no frontend**
2. **RLS ativado em todas as tabelas sensíveis**
3. **Histórico operacional nunca deletado fisicamente**
4. **Saldo deriva de transações, nunca de edição manual**
5. **Todas as ações relevantes geram audit_log**
6. **Funções transacionais garantem atomicidade**
7. **Banco deste projeto é separado e novo**
8. **Repositório é separado e novo**
9. **Deploy é separado de qualquer app existente**

---

## 9. Regras de Segurança

### RLS Policies
- Usuário autenticado + `approved` → lê dados operacionais
- Usuário `pending` → não lê dados operacionais
- Usuário `approved` → cria lotes e movimentos
- Apenas `admin` → aprova usuários, edita profiles alheios, cancela lote
- Apenas `admin` ou `quality` → cria quality_events, scrap_events
- Ninguém → delete físico de rework_lots, lot_movements, quality_events, scrap_events

---

## 10. Regras de Movimentação (Detalhado)

```
Entrada → (qualquer etapa operacional)
Etapa operacional → Qualidade
Qualidade → Aprovado | Sucata | (volta à etapa operacional)
Aprovado → (estado final)
Sucata → (estado final)
```

---

## 11. Regras de Auditoria

Ações que geram audit_log:
- Criação de lote
- Movimentação de quantidade
- Bloqueio / Desbloqueio
- Aprovação / Reprovação
- Sucata
- Encerramento / Cancelamento
- Alteração de perfil de usuário
- Aprovação / Rejeição de usuário
- Alteração de cadastro mestre

---

## 12. Estrutura do Banco

```
auth.users (Supabase Auth)
  └── profiles (extensão do usuário)
       └── rework_lots (lotes criados por usuário)
            ├── lot_movements (movimentos do lote)
            ├── lot_stage_balances (saldo por etapa - materializado)
            ├── quality_events (eventos de qualidade)
            ├── scrap_events (eventos de sucata)
            └── attachments (anexos)

product_master (cadastro mestre de materiais)
process_stages (etapas do processo)
defect_types (tipos de defeito)
audit_log (trilha de auditoria)
legacy_rework_snapshots (snapshot legado - opcional)
```

---

## 13. Rotas Principais

| Rota | Tela | Perfil Mínimo |
|---|---|---|
| `/login` | Login | público |
| `/signup` | Cadastro | público |
| `/pending-approval` | Aguardando aprovação | pending |
| `/dashboard` | Dashboard | approved |
| `/lotes` | Lista de lotes | approved |
| `/lotes/novo` | Novo lote | approved |
| `/lotes/:id` | Detalhe do lote | approved |
| `/lotes/:id/movimentar` | Movimentar lote | approved |
| `/qualidade` | Qualidade/Inspeção | quality/admin |
| `/sucata` | Sucata | quality/admin |
| `/materiais` | Cadastro mestre | approved |
| `/admin/usuarios` | Gestão de usuários | admin |
| `/auditoria` | Auditoria | admin |
| `/configuracoes` | Configurações | admin |

---

## 14. Perfis de Acesso

| Perfil | Acesso |
|---|---|
| `pending` | Apenas tela de espera |
| `user` | Área operacional (criar lote, movimentar) |
| `quality` | Tudo de user + qualidade + sucata |
| `admin` | Tudo + gestão de usuários + cancelamento + auditoria |

---

## 15. Critérios de Aceite

Ver task_plan.md seção "Critérios de Aceite" para lista completa de 30 itens.

---

## 16. Variáveis de Ambiente

```env
VITE_SUPABASE_URL=https://vgyntfdusnujmrhyskaq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_FIRST_ADMIN_EMAIL=ynascimento@caloi.com
# SUPABASE_SERVICE_ROLE_KEY → apenas em scripts/migrations, nunca no frontend
```

---

## 17. Stack Tecnológica

- **Frontend:** React 18 + TypeScript + Vite
- **UI:** Tailwind CSS + shadcn/ui
- **Roteamento:** React Router v6
- **Estado:** Zustand + React Query (TanStack Query)
- **Formulários:** React Hook Form + Zod
- **Tabelas:** TanStack Table
- **Gráficos:** Recharts
- **Backend:** Supabase (Auth, PostgreSQL, Storage, RPC)
- **Deploy:** Coolify + Hostinger

---

## 18. Log de Manutenção

| Data | Autor | Alteração |
|---|---|---|
| 2026-05-12 | Claude Code (Piloto) | Constituição inicial criada — Fase 0 VLAEG |
| 2026-05-12 | Claude Code (Piloto) | Infrastructure, deploy, auth fixes, UI redesign — ver seção 19 |
| 2026-05-15 | Claude Code (Sonnet 4.6) | Recuperação do projeto após reformat + correções — ver seções 19.9–19.15 |

---

## 19. Histórico Operacional de Deploy e Correções

### 19.1 Problema: Blank page no deploy (Coolify — build pack "static")

**Causa raiz:** Coolify build pack `static` copia os arquivos brutos do repositório para o nginx, mas `dist/` está no `.gitignore`. O nginx servia o `index.html` de desenvolvimento sem os bundles JS — resultado: tela em branco.

**Solução aplicada:**
- Criado `Dockerfile` multi-stage (node:20-alpine para build → nginx:alpine para servir)
- `ARG VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_FIRST_ADMIN_EMAIL` passados como build args do Coolify
- Criado `nginx.conf` minimalista com `try_files $uri $uri/ /index.html` para suportar React Router no client-side
- Build pack do Coolify alterado de `static` para `dockerfile`
- Campos `publish_directory`, `install_command`, `build_command` limpos via Coolify REST API PATCH (sobraram do modo static)

**Incidente adicional — container em restart loop (12x):**
- `nginx.conf` inicial tinha diretivas `gzip_types` que conflitavam com o middleware Traefik de gzip do Coolify (dupla compressão)
- Solução: removidas todas as diretivas gzip do nginx.conf; Traefik gerencia compression

---

### 19.2 Problema: Login com "E-mail ou senha incorretos"

**Causa raiz:** Supabase tinha confirmação de e-mail habilitada por padrão (`mailer_autoconfirm: false`). Usuário criava conta mas ficava "unconfirmed" e não conseguia logar.

**Solução aplicada:**
- Desabilitada confirmação de e-mail via Supabase Management API: `mailer_autoconfirm: true`
- Usuário agora pode cadastrar e logar imediatamente sem confirmar e-mail

---

### 19.3 Problema: Loading infinito após login

**Causa raiz (múltipla):**

1. **`useAuth()` chamado em 5 lugares** (App, ProtectedRoute, AdminRoute, QualityRoute, AuthRoute) — cada instância criava um `useEffect` com `getSession()` + `onAuthStateChange`, gerando múltiplas chamadas concorrentes a `loadProfile()`.

2. **Supabase v2 comportamento:** `onAuthStateChange` já dispara `INITIAL_SESSION` imediatamente. Chamar `getSession()` adicionalmente causava double-call com race condition.

3. **Guard incompleto na primeira correção:** guard `isLoadingProfile` resetava para `null` ao término da primeira carga, permitindo que chamadas subsequentes (de outras instâncias do hook) voltassem a setar `isLoading: true` e ficassem presas.

4. **Banco de dados:** o profile de `ynascimento@caloi.com` estava com `status: pending`, triggando `promote_first_admin` RPC — mas com múltiplas chamadas concorrentes, o RPC criava row locks no PostgreSQL, causando timeout.

**Soluções aplicadas:**

a) **SQL direto** para desbloquear o usuário admin:
```sql
UPDATE profiles SET role='admin', status='approved' WHERE email='ynascimento@caloi.com';
```

b) **`useAuth.ts` completamente reescrito** — pattern correto para Supabase v2:
- Removido `getSession()` — usa somente `onAuthStateChange` (dispara `INITIAL_SESSION` na inicialização)
- Dois guards em nível de módulo (compartilhados entre todas as instâncias do hook):
  - `activeLoadUserId` — ID sendo carregado agora (evita concorrência)
  - `loadedUserId` — ID já carregado com sucesso (nunca resetado exceto no signOut)
- Timeout de 5s no RPC `promote_first_admin` via `Promise.race`

---

### 19.4 UI Redesign — Identidade Visual Caloi

**Referências:** `inspiration/CALOI.png`, `inspiration/Telas retrabalho.png`

**Paleta de cores:**
- Vermelho Caloi: `#E8291C` (HSL 4, 82%, 51%)
- Fundo escuro: `hsl(224, 43%, 5%)` — quase preto com leve tom azul
- Cards: `hsl(225, 40%, 8%)` — escuro com bordas `rgba(255,255,255,0.06)`

**Arquivos alterados:**

| Arquivo | Alteração |
|---|---|
| `src/index.css` | Tema Caloi Red, animações (fade-in-up, fade-in, pulse-red), classes utilitárias (glass-card, caloi-glow, nav-active, stat-card-hover) |
| `src/pages/LoginPage.tsx` | Split-screen: painel esquerdo escuro com gradiente vermelho + CALOI logo; painel direito com formulário glassmorphism. Foco em "Controle de Retrabalhos" (sem menção a qualidade) |
| `src/pages/SignupPage.tsx` | Estilo dark matching, CALOI logo, glassmorphism card |
| `src/components/Sidebar.tsx` | Ícone "C" SVG vermelho, nav active com borda esquerda vermelha + gradiente |
| `src/components/Header.tsx` | Avatar com iniciais em gradiente vermelho, badge de role colorido |
| `src/components/LoadingScreen.tsx` | Ícone quadrado "C" vermelho, dots animados |
| `src/components/ui/card.tsx` | `rounded-xl`, dark, borda semi-transparente |
| `src/components/ui/input.tsx` | `bg-white/5 border-white/10`, focus ring vermelho |
| `src/components/ui/button.tsx` | `bg-[#E8291C]`, gradiente, glow shadow |
| `src/components/Layout.tsx` | `background: hsl(224,43%,5%)`, `animate-fade-in` no main |
| `src/pages/DashboardPage.tsx` | StatCards com icon boxes coloridos por variante, gráficos com fill `#E8291C` |
| `index.html` | Google Fonts Inter adicionado |

---

### 19.5 Correção: Cache de browser servindo JS stale

**Problema:** Após novo deploy, browser podia servir `index.html` em cache apontando para bundles JS antigos (404), causando tela em branco para usuários com cache.

**Solução — `nginx.conf`:**
```nginx
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires 0;
}
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```
`index.html` sempre fresco do servidor. Assets com hash no nome (Vite) cacheados por 1 ano.

---

### 19.6 Estado atual do banco (2026-05-12)

- Supabase projeto: `vgyntfdusnujmrhyskaq`
- Usuário admin ativo: `ynascimento@caloi.com` — `role: admin`, `status: approved`
- Email confirmation: **desabilitada** (`mailer_autoconfirm: true`)
- RLS: ativo em todas as tabelas
- Função `promote_first_admin`: SECURITY DEFINER, promove primeiro usuário com `VITE_FIRST_ADMIN_EMAIL` de `pending` → `admin/approved`

---

### 19.7 Estado atual do deploy (2026-05-12)

- Repositório: `https://github.com/yurifelipe777/controle-retrabalhos-industriais`
- Branch: `main`
- Coolify: build pack `dockerfile`, Hostinger
- URL: `https://retrabalhofabrica.yurifelipen8n.cloud`
- Último commit deployado: `2c1b297` (fix: resolve infinite loading + update login page branding)

---

### 19.8 Variáveis de ambiente configuradas no Coolify (Build Args)

```
VITE_SUPABASE_URL=https://vgyntfdusnujmrhyskaq.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key configurada no Coolify>
VITE_FIRST_ADMIN_EMAIL=ynascimento@caloi.com
```

> `SUPABASE_SERVICE_ROLE_KEY` — NUNCA configurado no Coolify. Apenas em scripts locais de migração.

---

## 20. Histórico da Sessão de 2026-05-15 (Recuperação + Novas Funcionalidades)

> Máquina reformatada. Projeto recuperado do GitHub: `https://github.com/yurifelipe777/controle-retrabalhos-industriais`

---

### 20.1 Correção: Loading infinito em trocas de aba / eventos TOKEN_REFRESHED

**Causa raiz:** `handleSession()` em `useAuth.ts` chamava `setLoading(true)` incondicionalmente em todo evento `onAuthStateChange`. Supabase v2 dispara `TOKEN_REFRESHED` e `USER_UPDATED` periodicamente e em toda mudança de foco de aba, resetando `isLoading` para `true` após o perfil já estar carregado.

**Solução aplicada — guarda por módulo (`loadedUserId`):**
```typescript
// Só ativa loading se o perfil do usuário atual ainda não foi carregado
if (loadedUserId !== session.user.id) {
  setLoading(true)
  void loadProfile(session.user.id, session.user.email ?? '')
}
```
`loadedUserId` persiste entre re-renders (module-level) e só é resetado no sign-out.

**Arquivos:** `src/hooks/useAuth.ts`

---

### 20.2 Correção: Item duplicado "Novo Lote" na Sidebar

**Problema:** O item de navegação `/lotes/novo` aparecia duas vezes no menu lateral.

**Solução:** Removido item duplicado do array `navItems` em `src/components/Sidebar.tsx`. Import `Plus` também removido por ficar sem uso.

---

### 20.3 Funcionalidade: Sistema de Estorno de Movimentações

**Contexto:** Usuários podem lançar erros (etapa errada, quantidade errada). O sistema agora permite reverter movimentações mantendo trilha completa de auditoria.

#### Migration 011 — `supabase/migrations/011_reverse_movement.sql`
- Adicionadas colunas `is_reversed boolean DEFAULT false` e `reversal_of_movement_id uuid` na tabela `lot_movements`
- Índice `idx_lot_movements_reversal` para performance
- Função original `reverse_lot_movement(uuid, text)` com 2 parâmetros (substituída pela 012)

#### Atualização TypeScript
- `src/types/index.ts` — campos `is_reversed` e `reversal_of_movement_id` adicionados à interface `LotMovement`
- `src/types/database.ts` — campos adicionados em Row/Insert/Update de `lot_movements`; função RPC declarada na seção `Functions`

#### Interface na LotDetailPage
- Botão "Estorno" (âmbar) visível na barra de ações quando há movimentos reversíveis
- Modal de estorno em 2 passos: (1) selecionar movimento, (2) confirmar com motivo
- Histórico exibe movimentos estornados com badge "estornado" e opacidade reduzida
- Movimentos de estorno exibidos em âmbar com ícone `RotateCcw`

**Arquivos:** `src/pages/LotDetailPage.tsx`, `src/types/index.ts`, `src/types/database.ts`

---

### 20.4 Funcionalidade: Estorno Parcial + Estorno de Entrada Inicial

**Pedido do usuário:** Permitir estornar a entrada inicial (não apenas transferências) e informar quantidade parcial.

#### Migration 012 — `supabase/migrations/012_reverse_movement_partial.sql`
- Substitui função anterior (2 params → 3 params: adiciona `p_quantity numeric DEFAULT NULL`)
- Suporta `movement_type = 'initial'` além de `'transfer'`
- Estorno de entrada: usa from=to=stage original para satisfazer trigger, depois aplica redução manual em `lot_stage_balances` e `quantity_open`
- Rastreia quantidade já estornada via `SUM(quantity) WHERE reversal_of_movement_id = p_movement_id`
- Marca `is_reversed = true` apenas quando toda a quantidade é revertida
- Audit log completo com delta e flag `partial`

**Estratégia para estorno de entrada (movimento initial com from_stage_id = NULL):**
```sql
-- Trigger netearia a zero (reduce+add same stage) — após, corrige manualmente:
UPDATE lot_stage_balances SET balance_quantity = balance_quantity - v_effective_qty WHERE ...
UPDATE rework_lots SET quantity_open = quantity_open - v_effective_qty WHERE ...
```

#### Interface atualizada (LotDetailPage)
- `useMemo` computa `reversibleMovements` incluindo `initial` + `transfer`
- Calcula `alreadyReversedQty` e `reversibleQty` por movimento via varredura da lista
- Campo de quantidade editável no modal (default = máximo disponível, validação de range)
- Texto de impacto diferente para initial vs transfer
- `canReverse` atualizado para incluir movimentos `initial`

**Arquivos:** `src/pages/LotDetailPage.tsx`, `src/types/database.ts`, `supabase/migrations/012_reverse_movement_partial.sql`

> **Status das migrations:** 011 e 012 devem ser aplicadas manualmente no Supabase SQL Editor.

---

### 20.5 Funcionalidade: Edição Completa e Exclusão de Lotes (Admin)

#### Migration 013 — `supabase/migrations/013_admin_lot_management.sql`

**`admin_update_rework_lot`** (SECURITY DEFINER):
- Verifica `is_admin_user()` antes de qualquer operação
- Permite editar todos os campos: `part_number_id`, `quantity_initial`, `quantity_open`, `origin_area`, `current_status`, `quality_status`, `defect_type_id`, `defect_description`, `quality_block_required`, `quality_block_number`, `opened_at`
- Captura estado anterior para audit_log antes de atualizar

**`admin_delete_rework_lot`** (SECURITY DEFINER):
- Verifica `is_admin_user()`
- Registra no audit_log ANTES de deletar (registro de exclusão sobrevive)
- Deleta em ordem de dependência: `attachments` → `quality_events` → `scrap_events` → `lot_stage_balances` → `lot_movements` → `rework_lots`

#### Interface (LotsListPage)
- Botão **Lápis (Editar)** — azul, admin only
  - Modal com todos os campos editáveis
  - Busca de part number com filtro por texto em tempo real
  - Selects para status atual, status qualidade e tipo de defeito
  - Campo datetime-local para `opened_at`
  - Validação: qtd_aberta ≤ qtd_inicial, campos obrigatórios
- Botão **Lixeira (Excluir)** — vermelho, admin only
  - Confirmação com `window.confirm()` e mensagem clara sobre irreversibilidade
  - Invalida cache após exclusão

**Arquivos:** `src/pages/LotsListPage.tsx`, `src/types/database.ts`, `supabase/migrations/013_admin_lot_management.sql`

---

### 20.6 Funcionalidade: Dashboard Interativo com Drilldown por Part Number

**Objetivo:** Transformar o dashboard de visualização passiva em ferramenta de análise para tomada de decisão.

#### Gráfico de Barras Interativo
- Click em barra do "Top Part Numbers" filtra toda a página para aquele PN
- Barra selecionada permanece vermelha (#E8291C); demais ficam 25% de opacidade
- Botão "Limpar filtro" (X) no header do card
- Usando `<Cell>` do recharts para cor dinâmica por entrada

#### Lista Geral de Itens em Retrabalho
- Tabela completa de todos os lotes ativos: código, PN, descrição, setor, defeito, status, qualidade, qtd, aging
- Clique em qualquer linha também filtra pelo PN
- Filtra automaticamente quando PN selecionado no gráfico (colunas opacas para outros PNs)

#### Painel Drilldown (aparece quando PN selecionado)
- Métricas resumidas: nº de lotes, qtd aberta, qtd inicial, aging médio colorido
- **Gráfico de Área stepAfter** — evolução de "peças em processo" ao longo do tempo:
  - Entrada inicial → +qtd
  - Evento de aprovação → -qtd
  - Evento de sucata → -qtd
  - Estorno de entrada → -qtd
  - Resultado: step function mostrando velocidade de resolução
- **Tabela de lotes do PN** com link para detalhe
- **Linha do Tempo de Eventos** (tabela cronológica):
  - Data/hora, código do lote, tipo de evento, de→para, quantidade (com delta +/-), total em processo
  - Combina movimentações + eventos de qualidade em ordem cronológica

**Queries adicionadas:**
```typescript
// Ativadas somente quando PN é selecionado
['dash-movements', selectedPN]  → lot_movements with from_stage/to_stage
['dash-quality', selectedPN]    → quality_events para o drilldown
```

**Arquivos:** `src/pages/DashboardPage.tsx`

---

### 20.7 Funcionalidade: Exportação de Relatório Completo em Excel (.xlsx)

#### Biblioteca adicionada
- `xlsx@^0.18.5` (SheetJS Community Edition) — geração de .xlsx no browser sem dependência de servidor

#### Arquivo `src/lib/exportExcel.ts`
Exporta função `exportCompleteReport()`:

| Aba | Conteúdo |
|---|---|
| Resumo | KPIs executivos: lotes por status, quantidades, aging buckets, taxa de sucata, totais de eventos |
| Lotes | Todos os lotes com todos os campos: código, PN, descrição, família, material, qtd inicial/aberta, setor, status, qualidade, defeito, bloqueio, criador, datas, aging |
| Movimentações | Todas as movimentações com de/para etapa, quantidade, responsável, estornado?, ID do estorno |
| Qualidade | Todos os eventos de qualidade com tipo, quantidade, documento, resultado, criador |
| Sucata | Todos os eventos de sucata com quantidade, motivo, aprovador |

- Busca todos os dados em paralelo com `Promise.all`
- Larguras de coluna configuradas por aba (`!cols`)
- Nome do arquivo: `Relatório_Sistema_Retrabalho_DD-MM-YYYY_HH-mm-ss.xlsx`

#### Interface (LotsListPage)
- Botão **"Exportar Excel"** com ícone Microsoft Excel SVG customizado (verde #217346)
- Spinner durante geração (estado `exporting`)
- Botão disponível para todos os usuários aprovados (não apenas admin)
- Toast de sucesso ou erro após a operação

**Arquivos:** `src/lib/exportExcel.ts`, `src/pages/LotsListPage.tsx`, `package.json`

---

### 20.8 Estado atual do sistema (2026-05-15)

**Migrations aplicadas no Supabase:**
- 001 a 010: aplicadas desde a criação inicial
- 011 (is_reversed + reverse_lot_movement v1): **pendente aplicação manual**
- 012 (estorno parcial + initial): **pendente aplicação manual**
- 013 (admin edit/delete): **pendente aplicação manual**

**Últimos commits:**
- `9b49e29` — fix: type state as string to satisfy Select onValueChange (TypeScript fix de deploy)
- `1444424` — feat: editar/excluir lotes (admin) + dashboard interativo com drilldown
- `f1324de` — feat: estorno parcial e suporte a entrada inicial

**URL de produção:** `https://retrabalhofabrica.yurifelipen8n.cloud`

**Stack atualizada:**
- Recharts: gráficos BarChart, PieChart, AreaChart (stepAfter para timeline)
- xlsx 0.18.5: geração de relatórios Excel no browser
- Novos padrões: useMemo para computações de drilldown, queries condicionais com `enabled`
