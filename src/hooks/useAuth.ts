import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Profile } from '../types'

const FIRST_ADMIN_EMAIL = import.meta.env.VITE_FIRST_ADMIN_EMAIL as string

let loadingProfileFor: string | null = null

export function useAuth() {
  const { session, user, profile, isLoading, setSession, setProfile, setLoading, clear } = useAuthStore()
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted.current) return
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '')
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted.current) return
      setSession(session)
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '')
      } else {
        clear()
      }
    })

    return () => {
      mounted.current = false
      subscription.unsubscribe()
    }
  }, [])

  async function loadProfile(userId: string, email: string) {
    // Prevent duplicate concurrent loads for the same user
    if (loadingProfileFor === userId) return
    loadingProfileFor = userId
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (!mounted.current) return

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
        // Use race with timeout to prevent infinite hang
        const rpcPromise = supabase.rpc('promote_first_admin', { target_user_id: userId })
        const timeout = new Promise(resolve => setTimeout(resolve, 5000))
        await Promise.race([rpcPromise, timeout])

        if (!mounted.current) return

        const { data: updated } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        setProfile(((updated ?? prof) as Profile))
      } else {
        setProfile(prof)
      }
    } finally {
      loadingProfileFor = null
      if (mounted.current) setLoading(false)
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
