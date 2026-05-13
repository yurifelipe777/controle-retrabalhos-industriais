import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Profile } from '../types'

const FIRST_ADMIN_EMAIL = import.meta.env.VITE_FIRST_ADMIN_EMAIL as string
const AUTH_TIMEOUT_MS = 7000

let authInitialized = false
let activeLoadUserId: string | null = null
let loadedUserId: string | null = null

function withTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs = AUTH_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    }),
  ])
}

async function loadProfile(userId: string, email: string) {
  const { setProfile, setLoading } = useAuthStore.getState()

  if (loadedUserId === userId || activeLoadUserId === userId) return

  activeLoadUserId = userId
  setLoading(true)

  try {
    let { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
      'Profile load',
      15000,
    )

    if (error || !data) {
      const recovered = await withTimeout(
        supabase.rpc('ensure_current_user_profile'),
        'Profile recovery',
        15000,
      )

      if (recovered.error || !recovered.data) {
        setProfile(null)
        return
      }

      data = recovered.data as Profile
    }

    const prof = data as Profile

    if (
      FIRST_ADMIN_EMAIL &&
      email === FIRST_ADMIN_EMAIL &&
      prof.status === 'pending'
    ) {
      await withTimeout(
        supabase.rpc('promote_first_admin', { target_user_id: userId }),
        'First admin promotion',
        5000,
      ).catch(() => null)

      const { data: updated } = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        'Updated profile load',
      ).catch(() => ({ data: null }))

      setProfile((updated ?? prof) as Profile)
    } else {
      setProfile(prof)
    }

    loadedUserId = userId
  } catch (error) {
    console.error('[auth] Failed to load profile', error)
    setProfile(null)
  } finally {
    activeLoadUserId = null
    setLoading(false)
  }
}

function handleSession(session: Session | null) {
  const { setSession, setLoading, clear } = useAuthStore.getState()

  if (session?.user) {
    setLoading(true)
    setSession(session)
    window.setTimeout(() => {
      void loadProfile(session.user.id, session.user.email ?? '')
    }, 0)
    return
  }

  setSession(session)

  loadedUserId = null
  activeLoadUserId = null
  clear()
}

function initializeAuth() {
  if (authInitialized) return
  authInitialized = true

  useAuthStore.getState().setLoading(true)

  supabase.auth.onAuthStateChange((_event, session) => {
    handleSession(session)
  })
}

export function useAuth() {
  const store = useAuthStore()
  const { session, user, profile, isLoading, clear } = store

  useEffect(() => {
    initializeAuth()
  }, [])

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
