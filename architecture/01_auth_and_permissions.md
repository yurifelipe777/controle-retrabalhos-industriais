# POP-01: Autenticação e Permissões
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever o fluxo completo de autenticação, criação de perfil, aprovação de usuários e controle de acesso por perfil.

## Perfis de Acesso

| role | status | Acesso |
|---|---|---|
| qualquer | `pending` | Apenas /pending-approval |
| `user` | `approved` | Área operacional (criar lote, movimentar) |
| `quality` | `approved` | Tudo de user + qualidade + sucata |
| `admin` | `approved` | Tudo + gestão de usuários + cancelamento + auditoria |

## Fluxo de Cadastro

```
1. Usuário acessa /signup
2. Preenche: nome, email, senha, área, cargo
3. Supabase Auth cria auth.users
4. Trigger handle_new_user() cria profiles com:
   - role = 'user'
   - status = 'pending'
5. Verificação de FIRST_ADMIN_EMAIL:
   - Se email == FIRST_ADMIN_EMAIL → role='admin', status='approved', approved_at=now()
   - Senão → aguarda aprovação manual
6. Usuário redirecionado para /pending-approval (se pending)
   ou /dashboard (se approved)
```

## Trigger: handle_new_user

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  first_admin_email text;
BEGIN
  -- Busca email do primeiro admin nas configurações do sistema
  first_admin_email := current_setting('app.first_admin_email', true);
  
  IF NEW.email = first_admin_email THEN
    INSERT INTO public.profiles (id, full_name, email, role, status, approved_at)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      'admin',
      'approved',
      now()
    );
  ELSE
    INSERT INTO public.profiles (id, full_name, email, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      NEW.email,
      'user',
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**NOTA:** Como variáveis de ambiente VITE_ não são acessíveis pelo banco, a comparação do primeiro admin é feita no frontend ao logar: se o email do usuário logado corresponde a VITE_FIRST_ADMIN_EMAIL e o status ainda é pending, chama RPC `promote_first_admin(user_id)`.

## Função: promote_first_admin

```sql
CREATE OR REPLACE FUNCTION promote_first_admin(target_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Apenas promove se ainda estiver pending e não houver nenhum admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin' AND status = 'approved') THEN
    UPDATE profiles
    SET role = 'admin', status = 'approved', approved_at = now()
    WHERE id = target_user_id AND status = 'pending';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Fluxo de Login

```
1. Usuário acessa /login
2. Supabase Auth valida email + senha
3. Frontend busca profiles por id do usuário
4. Verifica status:
   - pending → redireciona /pending-approval
   - rejected → exibe mensagem "Cadastro rejeitado"
   - inactive → exibe mensagem "Usuário desativado"
   - approved → verifica VITE_FIRST_ADMIN_EMAIL (promote se necessário) → /dashboard
```

## Guard de Rotas

```typescript
// ProtectedRoute: verifica auth + profile.status === 'approved'
// AdminRoute: verifica role === 'admin'
// QualityRoute: verifica role === 'admin' || role === 'quality'
```

## RLS Policies para profiles

```sql
-- Usuário lê apenas seu próprio perfil (exceto admin)
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Admin lê todos os perfis
CREATE POLICY "admin_read_all_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin atualiza qualquer perfil
CREATE POLICY "admin_update_profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Usuário atualiza apenas seus próprios dados não-sensíveis
CREATE POLICY "user_update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Não pode mudar role ou status
    role = (SELECT role FROM profiles WHERE id = auth.uid()) AND
    status = (SELECT status FROM profiles WHERE id = auth.uid())
  );
```

## Fluxo de Aprovação de Usuário (Admin)

```
1. Admin acessa /admin/usuarios
2. Vê lista de usuários pending
3. Clica em Aprovar → PATCH profiles SET status='approved', approved_at=now(), approved_by=admin_id
4. Ou clica em Rejeitar → PATCH profiles SET status='rejected'
5. Sistema registra em audit_log
```

## Fluxo de Gestão de Usuários (Admin)

```
- Promover para quality: UPDATE profiles SET role='quality'
- Promover para admin: UPDATE profiles SET role='admin'
- Desativar: UPDATE profiles SET status='inactive'
- Reativar: UPDATE profiles SET status='approved'
- Editar nome/área/cargo: UPDATE profiles SET full_name, area, job_title
```

## Tokens e Sessão

- Supabase Auth gerencia JWT automaticamente
- Token armazenado em localStorage pelo Supabase JS
- Refresh automático antes do vencimento
- onAuthStateChange listener no App.tsx para reatividade

## Casos de Borda

- Usuário com tab aberta quando é desativado → próxima requisição retorna 401 → logout forçado
- Email duplicado → Supabase Auth retorna erro → exibir mensagem clara
- Senha fraca → validar no frontend (min 8 chars, 1 número, 1 maiúscula)
- First admin já existente → promote_first_admin verifica se já há admin antes de promover
