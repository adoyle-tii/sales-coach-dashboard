import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true });
    });
  }, [navigate]);

  async function handleGoogleSignIn() {
    if (!supabase) {
      alert('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable or anon key).');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) alert(error.message);
  }

  return (
    <div style={{ maxWidth: '400px', margin: '80px auto', padding: '24px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ marginTop: 0 }}>Sales Coach Dashboard</h2>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>Sign in with your work Google account.</p>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        style={{ width: '100%', padding: '12px 16px', fontSize: '1rem', cursor: 'pointer', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px' }}
      >
        Sign in with Google
      </button>
    </div>
  );
}
