import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Profile } from '../types'

const FIRST_ADMIN_EMAIL = import.meta.env.VITE_FIRST_ADMIN_EMAIL as string

// Module-level guards — shared across all hook instances in the app
let activeLoadUserId: string | null = null
let loadedUserId: string | null = null

export function useAuth() {
  const store = useAuthStore()
  const { session, user, profile, isLoading, setSession, setProfile, setLoading, clear } = store

  useEffect(() => {
    // Supabase v2: onAuthStateChange fires INITIAL_SESSION immediately
    // No need for getSession() — this avoids the double-call race condition
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '')
      } else {
        loadedUserId = null
        activeLoadUserId = null
        clear()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string, email: string) {
    // Already loaded for this user → skip (covers re-renders from multiple useAuth() callsites)
    if (loadedUserId === userId) return
    // Another instance is currently loading → skip
    if (activeLoadUserId === userId) return

    activeLoadUserId = userId
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

      if (
        FIRST_ADMIN_EMAIL &&
        email === FIRST_ADMIN_EMAIL &&
        prof.status === 'pending'
      ) {
        // Timeout guard: never hang longer than 5 s waiting for RPC
        await Promise.race([
          supabase.rpc('promote_first_admin', { target_user_id: userId }),
          new Promise(r => setTimeout(r, 5000)),
        ])

        const { data: updated } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        setProfile((updated ?? prof) as Profile)
      } else {
        setProfile(prof)
      }

      loadedUserId = userId
    } finally {
      activeLoadUserId = null
      setLoading(false)
    }
  }

  const signOut = async () => {
    loadedUserId = null
    activeLoadUserId = null
    await supabase.auth.signOut()
    clear()
  }

  const isAdmin = profile?.role === 'admin'
  const isQuality = profile?.role === 'quality' || profile?.role === 'admin'
  const isApproved = profile?.status === 'approved'
  const isPending = profile?.status === 'pending'

  return { session, user, profile, isLoading, isAdmin, isQuality, isApproved, isPending, signOut }
}
