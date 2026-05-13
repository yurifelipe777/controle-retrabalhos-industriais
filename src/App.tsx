import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { Toaster } from './components/ui/toaster'

import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import DashboardPage from './pages/DashboardPage'
import LotsListPage from './pages/LotsListPage'
import NewLotPage from './pages/NewLotPage'
import LotDetailPage from './pages/LotDetailPage'
import MoveLotPage from './pages/MoveLotPage'
import QualityPage from './pages/QualityPage'
import ScrapPage from './pages/ScrapPage'
import MaterialsPage from './pages/MaterialsPage'
import UsersAdminPage from './pages/UsersAdminPage'
import AuditPage from './pages/AuditPage'
import SettingsPage from './pages/SettingsPage'
import Layout from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading, signOut } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-red-400 mb-2">Perfil indisponível</h1>
        <p className="text-muted-foreground mb-4">Não foi possível carregar seu perfil. Tente entrar novamente.</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
        >
          Sair
        </button>
      </div>
    </div>
  )
  if (profile?.status === 'pending') return <Navigate to="/pending-approval" replace />
  if (profile?.status === 'rejected') return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-red-400 mb-2">Cadastro Rejeitado</h1>
        <p className="text-muted-foreground">Seu cadastro foi rejeitado. Entre em contato com o administrador.</p>
      </div>
    </div>
  )
  if (profile?.status === 'inactive') return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-slate-400 mb-2">Usuário Inativo</h1>
        <p className="text-muted-foreground">Sua conta foi desativada. Entre em contato com o administrador.</p>
      </div>
    </div>
  )
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function QualityRoute({ children }: { children: React.ReactNode }) {
  const { isQuality, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (!isQuality) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, isLoading } = useAuth()
  if (isLoading) return <LoadingScreen />
  if (session) {
    if (profile?.status === 'pending') return <Navigate to="/pending-approval" replace />
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

export default function App() {
  useAuth()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/lotes" element={<LotsListPage />} />
          <Route path="/lotes/novo" element={<NewLotPage />} />
          <Route path="/lotes/:id" element={<LotDetailPage />} />
          <Route path="/lotes/:id/movimentar" element={<MoveLotPage />} />
          <Route path="/qualidade" element={<QualityRoute><QualityPage /></QualityRoute>} />
          <Route path="/sucata" element={<QualityRoute><ScrapPage /></QualityRoute>} />
          <Route path="/materiais" element={<MaterialsPage />} />
          <Route path="/admin/usuarios" element={<AdminRoute><UsersAdminPage /></AdminRoute>} />
          <Route path="/auditoria" element={<AdminRoute><AuditPage /></AdminRoute>} />
          <Route path="/configuracoes" element={<AdminRoute><SettingsPage /></AdminRoute>} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
