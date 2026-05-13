import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { useAuth } from '../hooks/useAuth'

export default function SettingsPage() {
  const { profile } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Configurações do sistema</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Informações do Sistema</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Versão</span><span>1.0.0</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Ambiente</span><Badge variant="success">Produção</Badge></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Supabase</span><span className="font-mono text-xs text-muted-foreground">vgyntfdusnujmrhyskaq</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Usuário atual</span><span>{profile?.full_name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Perfil</span>
            <Badge variant={profile?.role === 'admin' ? 'default' : 'muted'}>
              {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'quality' ? 'Qualidade' : 'Usuário'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Variáveis de Ambiente</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground mb-3">Configuradas via .env ou Coolify para cada ambiente.</p>
          {[
            { key: 'VITE_SUPABASE_URL', desc: 'URL do projeto Supabase' },
            { key: 'VITE_SUPABASE_ANON_KEY', desc: 'Chave pública Supabase (protegida por RLS)' },
            { key: 'VITE_FIRST_ADMIN_EMAIL', desc: 'E-mail do primeiro administrador' },
          ].map(v => (
            <div key={v.key} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
              <code className="text-xs text-primary font-mono shrink-0">{v.key}</code>
              <span className="text-xs text-muted-foreground">{v.desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
