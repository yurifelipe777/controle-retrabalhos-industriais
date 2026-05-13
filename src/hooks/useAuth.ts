import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Profile } from '../types'

const FIRST_ADMIN_EMAIL = import.meta.env.VITE_FIRST_ADMIN_EMAIL as string

export function useAuth() {
  const { session, user, profile, isLoading, setSession, setProfile, setLoading, clear } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '')
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '')
      } else {
        clear()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string, email: string) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error || !data) {
        setLoading(false)
        return
      }

      const prof = data as Profile

      // Verificação do primeiro admin
      if (
        FIRST_ADMIN_EMAIL &&
        email === FIRST_ADMIN_EMAIL &&
        prof.status === 'pending'
      ) {
        await supabase.rpc('promote_first_admin', { target_user_id: userId })
        const { data: updated } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        setProfile((updated ?? prof) as Profile)
      } else {
        setProfile(prof)
      }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    clear()
  }

  const isAdmin = profile?.role === 'admin'
  const isQuality = profile?.role === 'quality' || profile?.role === 'admin'
  const isApproved = profile?.status === 'approved'
  const isPending = profile?.status === 'pending'

  return { session, user, profile, isLoading, isAdmin, isQuality, isApproved, isPending, signOut }
}
