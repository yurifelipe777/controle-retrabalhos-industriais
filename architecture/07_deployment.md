# POP-07: Deploy e Infraestrutura
# Controle de Retrabalhos Industriais

---

## Stack de Deploy

```
GitHub (source) → Coolify (CI/CD) → Hostinger VPS (runtime)
```

## GitHub

### Repositório
- **Nome:** controle-retrabalhos-industriais
- **Visibilidade:** Public (ou Private com token configurado no Coolify)
- **Branch principal:** main

### Estrutura esperada
```
/
├── src/              (código fonte React)
├── public/           (assets estáticos)
├── supabase/
│   └── migrations/   (migrations SQL versionadas)
├── architecture/     (POPs)
├── tools/            (scripts)
├── .tmp/             (ignorado no .gitignore)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── .env.example      (template sem valores reais)
├── .gitignore
└── README.md
```

### .gitignore
```
node_modules/
dist/
.env
.env.local
.env.*.local
.tmp/
*.log
```

### .env.example
```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
VITE_FIRST_ADMIN_EMAIL=admin@empresa.com
# SUPABASE_SERVICE_ROLE_KEY → nunca no frontend, apenas em scripts locais
```

## Coolify

### Status das Credenciais
🔴 **BLOQUEIO:** Credenciais do Coolify não fornecidas no notes.md.

**Pendências:**
1. URL do painel Coolify (ex: https://coolify.hostinger.com ou IP:3000)
2. Token de API do Coolify
3. Nome/ID do servidor Hostinger configurado no Coolify

**Ação necessária:** Fornecer as credenciais acima para prosseguir com deploy automatizado.

### Configuração esperada no Coolify

```yaml
# Tipo: Static Site ou Node.js
Build Command: npm run build
Output Directory: dist
Start Command: (não necessário para static)
Node Version: 20

Environment Variables:
  VITE_SUPABASE_URL: https://vgyntfdusnujmrhyskaq.supabase.co
  VITE_SUPABASE_ANON_KEY: <anon_key>
  VITE_FIRST_ADMIN_EMAIL: ynascimento@caloi.com
```

### Passos manuais (quando credenciais disponíveis)
1. Criar novo app no Coolify
2. Selecionar tipo: Static Site (Vite build)
3. Vincular repositório GitHub
4. Configurar branch: main
5. Inserir variáveis de ambiente
6. Configurar build command: `npm ci && npm run build`
7. Output directory: `dist`
8. Executar deploy
9. Configurar domínio personalizado (se houver)
10. Verificar HTTPS ativo

## Supabase — Aplicar Migrations

### Via Supabase CLI (local)
```bash
npx supabase login
npx supabase link --project-ref vgyntfdusnujmrhyskaq
npx supabase db push
```

### Via SQL Editor (manual — Supabase Dashboard)
1. Acessar https://supabase.com/dashboard/project/vgyntfdusnujmrhyskaq
2. SQL Editor → New Query
3. Executar migrations em ordem (001, 002, 003...)

### Via API REST (automatizado)
Disponível via service role key — documentar em tools/apply_migrations.py

## Variáveis de Ambiente de Produção

| Variável | Onde configurar | Segurança |
|---|---|---|
| VITE_SUPABASE_URL | Coolify env vars | Pública — ok no bundle |
| VITE_SUPABASE_ANON_KEY | Coolify env vars | Pública — segurança via RLS |
| VITE_FIRST_ADMIN_EMAIL | Coolify env vars | Semi-sensível — não crítico |
| SUPABASE_SERVICE_ROLE_KEY | NUNCA no Coolify | Apenas local/scripts |

## Rollback

1. Reverter para commit anterior no GitHub
2. Re-deploy no Coolify (auto ou manual)
3. Para rollback de banco: migrations devem ter scripts `down` ou ser idempotentes

## Checklist de Deploy

- [ ] Build local passa (`npm run build`)
- [ ] Não há console.log com dados sensíveis
- [ ] .env.example atualizado
- [ ] .gitignore inclui .env*
- [ ] Migrations aplicadas no Supabase de produção
- [ ] RLS verificado com usuário de teste
- [ ] Primeiro admin criado e testado
- [ ] Dashboard carrega sem erros
- [ ] Criar lote funciona
- [ ] URL de produção acessível via HTTPS
