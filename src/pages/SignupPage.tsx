import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Factory, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'

const schema = z.object({
  full_name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  area: z.string().min(1, 'Área é obrigatória'),
  job_title: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
            area: data.area,
            job_title: data.job_title ?? null,
          },
        },
      })
      if (error) {
        toast({ variant: 'destructive', title: 'Erro no cadastro', description: error.message })
      } else {
        setDone(true)
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Cadastro enviado!</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Seu cadastro foi enviado para aprovação do administrador.
              Você será notificado quando sua conta for aprovada.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">Voltar para Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
            <Factory className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Criar Conta</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle de Retrabalhos — Caloi</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Novo Usuário</CardTitle>
            <CardDescription>Preencha seus dados para solicitar acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input placeholder="Seu nome completo" {...register('full_name')} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input type="email" placeholder="seu@caloi.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Mín. 8 caracteres"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Área *</Label>
                <Input placeholder="Ex: Qualidade, Produção, Engenharia..." {...register('area')} />
                {errors.area && <p className="text-xs text-destructive">{errors.area.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Cargo / Função</Label>
                <Input placeholder="Opcional" {...register('job_title')} />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Solicitar Acesso
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-muted-foreground">
              Já tem conta?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Entrar
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
