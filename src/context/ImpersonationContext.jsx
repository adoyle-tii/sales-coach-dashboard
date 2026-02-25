import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'sales_coach_impersonating_user_id';

const ImpersonationContext = createContext(null);

export function ImpersonationProvider({ children, user, profile }) {
  const [impersonatingUserId, setImpersonatingUserIdState] = useState(() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored || null;
  });
  const [viewProfile, setViewProfile] = useState(profile);

  const dataUserId = impersonatingUserId || (user?.id ?? null);
  const isImpersonating = Boolean(impersonatingUserId);

  useEffect(() => {
    if (impersonatingUserId) {
      sessionStorage.setItem(STORAGE_KEY, impersonatingUserId);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [impersonatingUserId]);

  useEffect(() => {
    if (!impersonatingUserId) {
      setViewProfile(profile);
      return;
    }
    if (!supabase) {
      setViewProfile(null);
      return;
    }
    let cancelled = false;
    supabase.from('users').select('id, role, full_name, team_id').eq('id', impersonatingUserId).single()
      .then(({ data }) => {
        if (!cancelled) setViewProfile(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setViewProfile(null);
      });
    return () => { cancelled = true; };
  }, [impersonatingUserId, profile]);

  const setImpersonatingUserId = useCallback((id) => {
    setImpersonatingUserIdState(id || null);
  }, []);

  const exitImpersonation = useCallback(() => {
    setImpersonatingUserIdState(null);
  }, []);

  const value = {
    dataUserId,
    viewProfile: impersonatingUserId ? viewProfile : profile,
    isImpersonating,
    setImpersonatingUserId,
    exitImpersonation,
    realProfile: profile,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
  return ctx;
}
