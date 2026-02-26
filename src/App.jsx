import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { ImpersonationProvider } from './context/ImpersonationContext';
import Login from './pages/Login';
import My from './pages/My';
import Team from './pages/Team';
import TeamMember from './pages/TeamMember';
import Admin from './pages/Admin';
import AssessmentDetail from './pages/AssessmentDetail';
import CoachingSessionDetail from './pages/CoachingSessionDetail';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        await supabase.auth.setSession(session);
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription?.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    if (!supabase) return;
    const { data: dataFull } = await supabase.from('users').select('id, role, full_name, can_impersonate').eq('id', userId).maybeSingle();
    if (dataFull) {
      setProfile({ ...dataFull, can_impersonate: dataFull.can_impersonate ?? false });
      return;
    }
    const { data: dataMin } = await supabase.from('users').select('id, role, full_name').eq('id', userId).maybeSingle();
    if (dataMin) {
      setProfile({ ...dataMin, can_impersonate: false });
      return;
    }
    setProfile(null);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Wait for profile so /admin doesn't redirect away before we know role
  if (profile === undefined && user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (user && profile === null) {
    return (
      <div style={{ maxWidth: '560px', margin: '40px auto', padding: '24px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0, color: '#92400e' }}>Profile not found</h2>
        <p style={{ color: '#78350f', marginBottom: '16px' }}>
          You're signed in as <strong>{user.email}</strong>, but there's no matching row in <code>public.users</code> or it's not visible (e.g. RLS). Without that, your role can't be loaded and the Admin panel won't show.
        </p>
        <p style={{ color: '#78350f', marginBottom: '12px' }}>
          To set yourself as superadmin, run this in the Supabase SQL Editor (replace the email with yours):
        </p>
        <pre style={{ padding: '12px', background: '#fef3c7', borderRadius: '6px', overflow: 'auto', fontSize: '0.8125rem' }}>{`UPDATE public.users\nSET role = 'superadmin'\nWHERE email = '${user.email || 'your@email.com'}';`}</pre>
        <p style={{ color: '#78350f', marginTop: '16px', marginBottom: 0 }}>
          If your email doesn't exist in <code>public.users</code> yet, sign in once so the trigger creates a row, then run the UPDATE above. After that, refresh this page.
        </p>
      </div>
    );
  }

  return (
    <ImpersonationProvider user={user} profile={profile}>
      <Routes>
        <Route
          element={<Layout user={user} profile={profile} onSignOut={() => supabase?.auth.signOut()} />}
        >
        <Route path="my" element={<My />} />
        <Route path="my/assessment/:id" element={<AssessmentDetail />} />
        <Route path="my/session/:id" element={<CoachingSessionDetail />} />
        <Route path="team" element={<Team />} />
          <Route path="team/:userId" element={<TeamMember />} />
          <Route path="admin" element={profile?.role === 'superadmin' || (profile?.role === 'admin' && profile?.can_impersonate) ? <Admin /> : <Navigate to="/" replace />} />
          <Route index element={<Navigate to={profile?.role === 'superadmin' || (profile?.role === 'admin' && profile?.can_impersonate) ? '/admin' : profile?.role === 'manager' ? '/team' : '/my'} replace />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ImpersonationProvider>
  );
}
