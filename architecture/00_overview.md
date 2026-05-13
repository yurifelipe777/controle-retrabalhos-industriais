# POP-00: Visão Geral da Arquitetura
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever a arquitetura completa do sistema, suas camadas, componentes e fluxo de dados.

## Stack

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Vite + React)               │
│  React 18 + TypeScript + Tailwind CSS + shadcn/ui        │
│  React Router v6 | React Query | Zustand | Recharts      │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS / Supabase JS Client
┌───────────────────────────▼─────────────────────────────┐
│                    SUPABASE                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Auth       │  │  PostgreSQL  │  │  Storage       │  │
│  │  (JWT)      │  │  + RLS       │  │  (Anexos)      │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  RPC Functions (SECURITY DEFINER)                   │ │
│  │  create_rework_lot | move_lot_quantity              │ │
│  │  approve_quantity | send_to_scrap | close_lot       │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                    DEPLOY                                │
│  GitHub (fonte) → Coolify (CI/CD) → Hostinger (host)    │
└─────────────────────────────────────────────────────────┘
```

## Camadas (A.N.T.)

### Camada 1 — Arquitetura (architecture/)
POPs técnicos em Markdown definindo lógica, entradas, saídas e casos de borda de cada domínio.

### Camada 2 — Navegação (src/lib/ + src/services/)
- `src/lib/supabase.ts` — cliente Supabase
- `src/services/` — chamadas RPC e queries organizadas por domínio
- `src/stores/` — estado global (Zustand)
- `src/hooks/` — hooks de dados (React Query)

### Camada 3 — Ferramentas (tools/)
- Scripts Python/Node determinísticos para operações externas
- Análise da planilha legado
- Handshakes de conexão
- Apenas executados via CLI, nunca pelo app

## Fluxo de Dados Principal

```
Usuário → Frontend → Supabase JS → RPC Function → PostgreSQL
                                   (atomicidade)   (RLS validado)
                                        │
                                   audit_log ← toda ação relevante
```

## Módulos do Sistema

| Módulo | Responsabilidade |
|---|---|
| Auth | Login, cadastro, sessão, perfil |
| Lotes | CRUD de lotes, geração de código |
| Movimentação | Transferência de saldo entre etapas |
| Qualidade | Bloqueio, inspeção, aprovação, reprovação |
| Sucata | Registro e controle de peças sucateadas |
| Dashboard | KPIs, gráficos, aging, alertas |
| Materiais | Cadastro mestre de part numbers |
| Usuários | Gestão de perfis e aprovações |
| Auditoria | Log completo de ações |

## Segurança

- RLS em todas as tabelas sensíveis
- Funções RPC com SECURITY DEFINER onde necessário
- Anon Key: pública por design, segurança via RLS
- Service Role: nunca exposta no frontend
- Nenhum secret no repositório

## Convenções

- Migrations numeradas sequencialmente: `001_`, `002_`, etc.
- POPs atualizados antes de mudar código
- progress.md atualizado após cada tarefa significativa
- findings.md para descobertas e decisões não óbvias
