import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { AlertTriangle, Trash2, Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'

const RESET_EMAIL = 'ynascimento@caloi.com'
const RESET_CONFIRM_WORD = 'ZERAR SISTEMA'

export default function SettingsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [resetDialog, setResetDialog] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  const canReset = profile?.email === RESET_EMAIL

  const handleReset = async () => {
    if (confirmText !== RESET_CONFIRM_WORD) return
    setLoading(true)
    try {
      const { error } = await supabase.rpc('factory_reset')
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao zerar sistema', description: error.message })
        return
      }
      toast({ title: 'Sistema zerado com sucesso.', description: 'Todos os lançamentos foram removidos.' })
      setResetDialog(false)
      navigate('/dashboard')
    } finally {
      setLoading(false)
    }
  }

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

      {/* Reset do Sistema — visível apenas para ynascimento@caloi.com */}
      {canReset && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <ShieldAlert className="h-4 w-4" />
              Zona de Perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg space-y-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-300">Reset Completo do Sistema</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Remove <strong className="text-foreground">todos os lotes, movimentações, eventos de qualidade, sucata, decapagem e audit log</strong>.
                    Dados cadastrais (materiais, etapas, usuários) são preservados.
                    Esta ação é <strong className="text-red-400">irreversível</strong>.
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => { setConfirmText(''); setResetDialog(true) }}
            >
              <Trash2 className="h-4 w-4" />
              Zerar Todos os Lançamentos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmação */}
      <Dialog open={resetDialog} onOpenChange={open => !open && setResetDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Reset do Sistema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-md text-sm space-y-1" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <p className="font-semibold text-red-300">Atenção — esta ação não pode ser desfeita.</p>
              <p className="text-xs text-muted-foreground">Serão apagados permanentemente todos os lotes, movimentações, eventos de qualidade, registros de sucata, eventos de decapagem e logs de auditoria.</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Para confirmar, digite exatamente: <code className="text-red-300 font-mono font-bold">{RESET_CONFIRM_WORD}</code>
              </p>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder={RESET_CONFIRM_WORD}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== RESET_CONFIRM_WORD || loading}
              onClick={handleReset}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
