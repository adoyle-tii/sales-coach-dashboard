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
      alert('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) alert(error.message);
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'white',
        borderRadius: '16px',
        padding: '40px 36px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px', height: '52px',
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem',
            margin: '0 auto 16px',
            boxShadow: '0 8px 20px rgba(124,58,237,0.35)',
          }}>🎯</div>
          <h1 style={{ margin: '0 0 6px', fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Sales Coach
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
            Sign in with your work Google account
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white" fillOpacity="0.9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56C11.24 14.1 10.211 14.42 9 14.42c-2.392 0-4.416-1.615-5.14-3.788H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="white" fillOpacity="0.9"/>
            <path d="M3.86 10.632A5.422 5.422 0 0 1 3.556 9c0-.562.097-1.107.304-1.632V5.036H.957A9.01 9.01 0 0 0 0 9c0 1.452.348 2.827.957 4.045l2.903-2.413z" fill="white" fillOpacity="0.9"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.955L3.86 7.368C4.584 5.195 6.608 3.58 9 3.58z" fill="white" fillOpacity="0.9"/>
          </svg>
          Continue with Google
        </button>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.8rem', color: '#94a3b8' }}>
          Contact your administrator if you don't have access.
        </p>
      </div>
    </div>
  );
}
