import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})

type FormData = z.infer<typeof schema>

function CaloiLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-lg tracking-[4px] px-2 py-0.5', md: 'text-2xl tracking-[5px] px-3 py-1', lg: 'text-3xl tracking-[6px] px-4 py-1.5' }
  return (
    <div className={`inline-flex items-center bg-[#E8291C] rounded ${sizes[size]}`}>
      <span className="font-black text-white" style={{ fontFamily: 'Inter, sans-serif' }}>CALOI</span>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Erro ao entrar',
          description: error.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos.'
            : error.message,
        })
      } else {
        navigate('/dashboard')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: 'hsl(224, 43%, 5%)' }}>
      {/* Left panel - branding */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] relative p-12 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, #0D0507 0%, #1A0808 50%, #0D0507 100%)',
        }} />
        <div className="absolute top-0 left-0 w-full h-full opacity-30" style={{
          background: 'radial-gradient(ellipse 70% 60% at 30% 40%, rgba(232,41,28,0.35) 0%, transparent 70%)',
        }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-10" style={{
          background: 'radial-gradient(circle, #E8291C 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />

        {/* Grid lines */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />

        {/* Content */}
        <div className="relative z-10 animate-fade-in-up">
          <CaloiLogo size="lg" />
        </div>

        <div className="relative z-10 space-y-6 animate-fade-in-up delay-100">
          <div>
            <h2 className="text-4xl font-black text-white leading-tight tracking-tight">
              Gestão de<br />
              <span style={{ color: '#E8291C' }}>Retrabalhos</span><br />
              em Tempo Real
            </h2>
            <p className="mt-4 text-base text-white/50 max-w-sm leading-relaxed">
              Rastreie lotes, controle movimentações e monitore indicadores de retrabalho com precisão industrial.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-8">
            {[
              { value: 'Lotes', label: 'rastreados' },
              { value: 'Movimentações', label: 'registradas' },
              { value: 'Real-time', label: 'dashboard' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 animate-fade-in-up delay-200">
          <p className="text-xs text-white/25">© 2026 Caloi S.A. — Sistema Industrial</p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-5" style={{
          background: 'radial-gradient(circle, #E8291C 0%, transparent 70%)',
          filter: 'blur(80px)',
          transform: 'translate(30%, -30%)',
        }} />

        <div className="w-full max-w-sm relative z-10">
          {/* Mobile logo */}
          <div className="flex flex-col items-center mb-10 lg:hidden animate-fade-in">
            <CaloiLogo size="md" />
            <p className="text-white/50 text-sm mt-3">Controle de Retrabalhos Industriais</p>
          </div>

          <div className="animate-fade-in-up">
            <h1 className="text-3xl font-bold text-white mb-1">Bem-vindo</h1>
            <p className="text-white/40 text-sm mb-8">Acesse sua conta para continuar</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-white/70 text-xs font-medium uppercase tracking-wider">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@caloi.com"
                  autoComplete="email"
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#E8291C] focus:ring-[#E8291C]/20 transition-all"
                  {...register('email')}
                />
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-white/70 text-xs font-medium uppercase tracking-wider">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[#E8291C] focus:ring-[#E8291C]/20 pr-10 transition-all"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{
                  background: loading ? 'rgba(232,41,28,0.7)' : 'linear-gradient(135deg, #E8291C 0%, #C41E13 100%)',
                  boxShadow: loading ? 'none' : '0 0 20px rgba(232,41,28,0.3), 0 4px 15px rgba(232,41,28,0.2)',
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <span className="text-white/30 text-sm">Não tem conta? </span>
              <Link to="/signup" className="text-sm font-semibold transition-colors" style={{ color: '#E8291C' }}>
                Criar conta
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
