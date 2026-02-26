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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription?.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    if (!supabase) return;
    const { data, error } = await supabase.from('users').select('id, role, full_name, can_impersonate').eq('id', userId).single();
    if (data) {
      setProfile({ ...data, can_impersonate: data.can_impersonate ?? false });
      return;
    }
    if (error && error.code === '42703') {
      const { data: fallback } = await supabase.from('users').select('id, role, full_name').eq('id', userId).single();
      setProfile(fallback ? { ...fallback, can_impersonate: false } : null);
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
