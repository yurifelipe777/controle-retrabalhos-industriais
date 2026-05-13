import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const schema = z.object({
  full_name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  area: z.string().min(1, 'Área é obrigatória'),
  job_title: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function CaloiLogo() {
  return (
    <div className="inline-flex items-center bg-[#E8291C] rounded px-3 py-1">
      <span className="font-black text-white text-2xl tracking-[5px]">CALOI</span>
    </div>
  )
}

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
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'hsl(224, 43%, 5%)' }}>
        <div className="w-full max-w-sm text-center animate-fade-in-up">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Conta criada!</h2>
          <p className="text-white/40 text-sm mb-8 leading-relaxed">
            Seu cadastro aguarda aprovação do administrador. Você será notificado quando o acesso for liberado.
          </p>
          <Link to="/login">
            <button className="w-full h-12 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/20 transition-all text-sm font-medium flex items-center justify-center gap-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <ArrowLeft className="h-4 w-4" />
              Voltar para Login
            </button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'hsl(224, 43%, 5%)' }}>
      <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 opacity-10 pointer-events-none" style={{
        background: 'radial-gradient(ellipse, #E8291C 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8 animate-fade-in">
          <CaloiLogo />
          <p className="text-white/30 text-xs mt-2 tracking-wider uppercase">Controle de Retrabalhos</p>
        </div>

        <div className="rounded-2xl p-8 animate-fade-in-up" style={{ background: 'hsl(225, 40%, 8%)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h1 className="text-2xl font-bold text-white mb-1">Criar conta</h1>
          <p className="text-white/30 text-sm mb-6">Preencha seus dados para solicitar acesso</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs font-medium uppercase tracking-wider">Nome Completo *</Label>
              <Input placeholder="Seu nome completo" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#E8291C] focus:ring-[#E8291C]/20" {...register('full_name')} />
              {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs font-medium uppercase tracking-wider">E-mail *</Label>
              <Input type="email" placeholder="seu@caloi.com" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#E8291C] focus:ring-[#E8291C]/20" {...register('email')} />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs font-medium uppercase tracking-wider">Senha *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mín. 8 caracteres"
                  className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#E8291C] focus:ring-[#E8291C]/20 pr-10"
                  {...register('password')}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white/50 text-xs font-medium uppercase tracking-wider">Área *</Label>
                <Input placeholder="Ex: Qualidade" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#E8291C] focus:ring-[#E8291C]/20" {...register('area')} />
                {errors.area && <p className="text-xs text-red-400">{errors.area.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/50 text-xs font-medium uppercase tracking-wider">Cargo</Label>
                <Input placeholder="Opcional" className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#E8291C] focus:ring-[#E8291C]/20" {...register('job_title')} />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 mt-2"
              style={{
                background: 'linear-gradient(135deg, #E8291C 0%, #C41E13 100%)',
                boxShadow: '0 0 20px rgba(232,41,28,0.25)',
              }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Solicitar Acesso'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <span className="text-white/25 text-sm">Já tem conta? </span>
            <Link to="/login" className="text-sm font-semibold" style={{ color: '#E8291C' }}>Entrar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
