import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { ImpersonationProvider } from './context/ImpersonationContext';
import Login from './pages/Login';
import My from './pages/My';
import Team from './pages/Team';
import TeamMember from './pages/TeamMember';
import CourseBreakdown from './pages/CourseBreakdown';
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

    // onAuthStateChange fires synchronously for the initial session
    // (including after an OAuth callback hash exchange), so we rely on it
    // as the single source of truth and only use getSession() as a fallback
    // to end the loading state if the auth event is slow.
    let initialised = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      initialised = true;
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Fallback: if onAuthStateChange hasn't fired within the tick,
    // getSession() will resolve it (covers cases where no event fires).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initialised) {
        setUser(session?.user ?? null);
        if (session?.user) fetchProfile(session.user.id);
        else {
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data: rpcData } = await supabase.rpc('get_my_profile');
      if (rpcData && Array.isArray(rpcData) && rpcData[0]) {
        const row = rpcData[0];
        setProfile({
          id: row.id,
          role: row.role,
          full_name: row.full_name,
          can_impersonate: row.can_impersonate ?? false,
        });
        return;
      }
      const { data } = await supabase.from('users').select('id, role, full_name, can_impersonate').eq('id', userId).single();
      if (data) {
        setProfile({ ...data, can_impersonate: data.can_impersonate ?? false });
        return;
      }
      const { data: fallback } = await supabase.from('users').select('id, role, full_name').eq('id', userId).single();
      setProfile(fallback ? { ...fallback, can_impersonate: false } : null);
    } finally {
      setLoading(false);
    }
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '24px' }}>
        <div style={{ maxWidth: '480px', width: '100%', background: 'white', border: '1px solid #fcd34d', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
          <h2 style={{ marginTop: 0, color: '#92400e', fontSize: '1.2rem' }}>Access not provisioned</h2>
          <p style={{ color: '#78350f', marginBottom: '20px', lineHeight: '1.6' }}>
            You've signed in as <strong>{user.email}</strong>, but your account hasn't been set up in the system yet. Please contact your administrator to get access.
          </p>
          <button
            onClick={() => supabase?.auth.signOut()}
            style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Sign out
          </button>
        </div>
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
          <Route path="team/view/:viewAsId" element={<Team />} />
          <Route path="team/course/:managerId/:courseId" element={<CourseBreakdown />} />
          <Route path="team/:userId" element={<TeamMember />} />
          <Route path="team/:userId/assessment/:id" element={<AssessmentDetail />} />
          <Route path="team/:userId/session/:id" element={<CoachingSessionDetail />} />
          <Route path="admin" element={profile?.role === 'superadmin' || (profile?.role === 'admin' && profile?.can_impersonate) ? <Admin /> : <Navigate to="/" replace />} />
          <Route index element={<Navigate to={profile?.role === 'superadmin' || (profile?.role === 'admin' && profile?.can_impersonate) ? '/admin' : profile?.role === 'manager' ? '/team' : '/my'} replace />} />
        </Route>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ImpersonationProvider>
  );
}
