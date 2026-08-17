import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  console.log('[delete-account] request received:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    console.log('[delete-account] missing authorization header');
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  // Client scoped to the caller's own token — used only to find out who
  // they are, never to perform the deletion itself.
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    console.log('[delete-account] auth.getUser failed:', userError?.message);
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  console.log('[delete-account] authenticated as user:', user.id);

  // Admin client using the service role key. This key stays server-side in
  // this function's environment and must never be shipped to the browser.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Storage objects aren't covered by the database's foreign-key cascades,
  // so remove each bucket's files for this user explicitly.
  for (const bucket of ['avatars', 'documents']) {
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from(bucket)
      .list(user.id);

    console.log(`[delete-account] ${bucket} list:`, {
      count: files?.length ?? 0,
      listError: listError?.message,
    });

    if (files && files.length > 0) {
      const paths = files.map((file) => `${user.id}/${file.name}`);
      const { error: removeError } = await supabaseAdmin.storage
        .from(bucket)
        .remove(paths);
      console.log(`[delete-account] ${bucket} remove error:`, removeError?.message);
    }
  }

  console.log('[delete-account] deleting auth user:', user.id);

  // Deleting the auth user cascades to profiles/documents/jobs/events via
  // their "on delete cascade" foreign keys.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id,
  );

  if (deleteError) {
    console.log('[delete-account] deleteUser failed:', deleteError.message);
    return jsonResponse({ error: deleteError.message }, 500);
  }

  console.log('[delete-account] success for user:', user.id);
  return jsonResponse({ success: true }, 200);
});
