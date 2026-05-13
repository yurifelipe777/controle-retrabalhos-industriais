import { Clock, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'

export default function PendingApprovalPage() {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-8 pb-8">
          <div className="w-16 h-16 rounded-full bg-yellow-400/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Aguardando Aprovação</h2>
          <p className="text-muted-foreground text-sm mb-2">
            Seu cadastro foi recebido e está aguardando aprovação do administrador.
          </p>
          <p className="text-muted-foreground text-sm mb-6">
            Você receberá acesso assim que sua conta for aprovada. Entre em contato com seu gestor caso precise de acesso urgente.
          </p>
          <Button variant="outline" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
