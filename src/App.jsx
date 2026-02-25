import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import My from './pages/My';
import Team from './pages/Team';
import TeamMember from './pages/TeamMember';
import Admin from './pages/Admin';
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
    const { data } = await supabase.from('users').select('id, role, full_name').eq('id', userId).single();
    setProfile(data ?? null);
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
    <Layout user={user} profile={profile} onSignOut={() => supabase?.auth.signOut()}>
      <Routes>
        <Route path="/my" element={<My />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/:userId" element={<TeamMember />} />
        <Route path="/admin" element={profile?.role === 'superadmin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="/" element={<Navigate to={profile?.role === 'superadmin' ? '/admin' : profile?.role === 'manager' ? '/team' : '/my'} replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
