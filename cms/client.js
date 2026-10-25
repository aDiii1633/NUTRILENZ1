import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_PUBLIC'));
export function getClient(admin = false) {
  return configured ? createClient(url, key, {
    auth: { persistSession: admin, autoRefreshToken: admin, detectSessionInUrl: false, storageKey: 'nutrilenz-admin-auth' },
    global: { fetch: async (input, options = {}) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) controller.abort();
      const timer = setTimeout(abort, 10000);
      try { return await fetch(input, { ...options, signal: controller.signal }); }
      finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
    } },
  }) : null;
}
