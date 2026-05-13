# task_plan.md — Plano de Tarefas
# Controle de Retrabalhos Industriais

> Atualizado em: 2026-05-12 | Protocolo: V.L.A.E.G.

---

## Fases do Projeto

### FASE 0 — Inicialização (Memória do Projeto)
**Status:** ✅ Em andamento

- [x] Criar gemini.md (Constituição do Projeto)
- [x] Criar task_plan.md
- [x] Criar findings.md
- [x] Criar progress.md
- [x] Criar pasta architecture/
- [x] Criar pasta tools/
- [x] Criar pasta .tmp/
- [ ] Analisar planilha público/Planilha de Retrabalho.xlsx
- [ ] Criar POPs em architecture/ (00 a 08)

---

### FASE V — Visão e Lógica
**Status:** ✅ Concluído (respostas fornecidas no prompt inicial)

- [x] Registrar Estrela Guia em gemini.md
- [x] Registrar integrações (Supabase, GitHub, Coolify, Hostinger)
- [x] Registrar Fonte da Verdade
- [x] Registrar Payload de Entrega
- [x] Registrar Regras Comportamentais
- [x] Definir schemas de dados em gemini.md
- [x] Definir status operacionais e de qualidade
- [x] Definir perfis de acesso
- [x] Definir rotas principais
- [x] Definir telas obrigatórias
- [ ] Analisar planilha e registrar findings de negócio

---

### FASE L — Link (Conectividade)
**Status:** 🔄 Em andamento

- [ ] Validar conexão Supabase (URL + Anon Key)
- [ ] Validar token GitHub
- [ ] Verificar disponibilidade Coolify (credencial ausente)
- [ ] Criar arquivo .env com variáveis validadas
- [ ] Registrar status de cada conexão em findings.md

---

### FASE A — Arquitetura e Construção
**Status:** ⏳ Pendente

#### A.1 — Documentação Arquitetural
- [ ] architecture/00_overview.md
- [ ] architecture/01_auth_and_permissions.md
- [ ] architecture/02_database_schema.md
- [ ] architecture/03_rework_lot_flow.md
- [ ] architecture/04_quality_flow.md
- [ ] architecture/05_scrap_flow.md
- [ ] architecture/06_dashboard_metrics.md
- [ ] architecture/07_deployment.md
- [ ] architecture/08_legacy_spreadsheet_import.md

#### A.2 — Banco de Dados (Supabase Migrations)
- [ ] 001_create_profiles.sql
- [ ] 002_create_product_master.sql
- [ ] 003_create_process_stages.sql + seeds
- [ ] 004_create_defect_types.sql + seeds
- [ ] 005_create_rework_lots.sql
- [ ] 006_create_lot_movements.sql
- [ ] 007_create_lot_stage_balances.sql + triggers
- [ ] 008_create_quality_events.sql
- [ ] 009_create_scrap_events.sql
- [ ] 010_create_attachments.sql
- [ ] 011_create_audit_log.sql
- [ ] 012_create_legacy_snapshots.sql
- [ ] 013_rls_policies.sql
- [ ] 014_rpc_functions.sql
- [ ] 015_create_views.sql
- [ ] 016_first_admin_trigger.sql

#### A.3 — Scaffold do App
- [ ] Criar projeto Vite + React + TypeScript
- [ ] Configurar Tailwind CSS
- [ ] Instalar e configurar shadcn/ui
- [ ] Configurar React Router v6
- [ ] Configurar Supabase client
- [ ] Configurar TanStack Query
- [ ] Configurar Zustand (auth store)

#### A.4 — Telas e Funcionalidades
- [ ] Tela: Login
- [ ] Tela: Cadastro
- [ ] Tela: Aguardando Aprovação
- [ ] Tela: Dashboard (cards + gráficos)
- [ ] Tela: Lista de Lotes (filtros + tabela)
- [ ] Tela: Novo Lote (formulário + validações)
- [ ] Tela: Detalhe do Lote (timeline + ações)
- [ ] Tela: Movimentar Lote
- [ ] Tela: Qualidade/Inspeção
- [ ] Tela: Sucata
- [ ] Tela: Cadastro Mestre de Materiais
- [ ] Tela: Admin → Gestão de Usuários
- [ ] Tela: Auditoria
- [ ] Tela: Configurações

---

### FASE E — Estilo e UX
**Status:** ⏳ Pendente

- [ ] Aplicar tema dark industrial (inspiração: Telas retrabalho.png)
- [ ] Cores: verde/amarelo/laranja/vermelho para aging e status
- [ ] Responsividade mobile-first
- [ ] Mensagens de erro claras e objetivas
- [ ] Autocomplete de part number
- [ ] Exibição de saldo antes de movimentar
- [ ] Alertas de lote sem bloqueio de qualidade
- [ ] Badges de status coloridos
- [ ] Timeline visual no detalhe do lote

---

### FASE G — Gatilho (Deploy)
**Status:** ⏳ Pendente

- [ ] Criar repositório GitHub: controle-retrabalhos-industriais
- [ ] Commit inicial com documentação VLAEG
- [ ] Versionar migrations SQL
- [ ] Criar branch main e configurar proteção
- [ ] Criar README.md completo
- [ ] Preparar configuração Coolify
- [ ] Documentar variáveis de ambiente de produção
- [ ] Executar deploy
- [ ] Validar URL de produção
- [ ] Testar autenticação em produção
- [ ] Registrar log de manutenção em gemini.md

---

## Bloqueios

| # | Bloqueio | Status | Ação |
|---|---|---|---|
| 1 | Coolify: URL, token e app name ausentes | 🔴 Ativo | Registrado em findings.md — aguardando info |

---

## Pendências

| # | Pendência | Arquivo |
|---|---|---|
| 1 | Analisar planilha pública para extrair part numbers | findings.md |
| 2 | Confirmar credenciais Coolify | findings.md |
| 3 | Confirmar URL de produção Hostinger/Coolify | findings.md |

---

## Critérios de Aceite (30 itens)

- [ ] 1. Projeto criado separado
- [ ] 2. Banco Supabase separado
- [ ] 3. Repositório GitHub separado
- [ ] 4. App deployável no Coolify
- [ ] 5. Planilha lida e analisada
- [ ] 6. product_master populável da planilha
- [ ] 7. Usuário consegue se cadastrar
- [ ] 8. Novo usuário fica pending
- [ ] 9. Primeiro admin via VITE_FIRST_ADMIN_EMAIL funciona
- [ ] 10. Admin aprova usuário
- [ ] 11. Usuário aprovado cria lote
- [ ] 12. Lote gera código automático
- [ ] 13. Sistema cria movimento inicial
- [ ] 14. Sistema controla saldo
- [ ] 15. Sistema permite movimentação parcial
- [ ] 16. Sistema bloqueia movimentação maior que saldo
- [ ] 17. Sistema registra qualidade
- [ ] 18. Sistema registra sucata
- [ ] 19. Sistema evidencia lote sem bloqueio
- [ ] 20. Sistema calcula aging
- [ ] 21. Sistema mostra dashboard
- [ ] 22. Sistema preserva histórico
- [ ] 23. Sistema tem audit_log
- [ ] 24. Sistema tem RLS
- [ ] 25. Build passa sem erro
- [ ] 26. progress.md atualizado
- [ ] 27. findings.md atualizado
- [ ] 28. gemini.md atualizado
- [ ] 29. architecture/ atualizado
- [ ] 30. README.md criado
