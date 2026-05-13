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
