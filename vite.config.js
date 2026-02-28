import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Defensive patch for any @supabase/auth-js version that uses a Map-style
// storage adapter (.get/.set/.remove) instead of the localStorage-style
// (.getItem/.setItem/.removeItem). Applied at transform time so it works
// regardless of which version Cloudflare's CI resolves.
function patchSupabaseStorage() {
  return {
    name: 'patch-supabase-storage',
    transform(code, id) {
      if (!id.includes('@supabase')) return null;

      let patched = code;
      // Storage Map-style -> localStorage-style
      patched = patched.replace(/\bstorage\.get\b\s*\(/g, 'storage.getItem(');
      patched = patched.replace(/\bstorage\.set\b\s*\(/g, 'storage.setItem(');
      patched = patched.replace(/\bstorage\.remove\b\s*\(/g, 'storage.removeItem(');

      if (patched !== code) {
        return { code: patched, map: null };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), patchSupabaseStorage()],
  build: {
    outDir: 'dist',
  },
});
