import { createClient } from '@supabase/supabase-js';

// Supabase's browser URL and anon key are designed to be public. Database
// policies and the protected RPC below enforce what visitors can do.
const supabaseUrl = 'https://mmuqrizmpfqgyajgcfwa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tdXFyaXptcGZxZ3lhamdjZndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNzE5NTUsImV4cCI6MjEwMzc0Nzk1NX0.KEgQ9iYtzvrUigafGSXioMF0COrIn7wksk684y6gIWg';

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
