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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
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
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  // Admin client using the service role key. This key stays server-side in
  // this function's environment and must never be shipped to the browser.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Storage objects aren't covered by the database's foreign-key cascades,
  // so remove each bucket's files for this user explicitly.
  for (const bucket of ['avatars', 'documents']) {
    const { data: files } = await supabaseAdmin.storage
      .from(bucket)
      .list(user.id);

    if (files && files.length > 0) {
      const paths = files.map((file) => `${user.id}/${file.name}`);
      await supabaseAdmin.storage.from(bucket).remove(paths);
    }
  }

  // Deleting the auth user cascades to profiles/documents/jobs/events via
  // their "on delete cascade" foreign keys.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id,
  );

  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
