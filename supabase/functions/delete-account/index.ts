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
  //
  // list() returns at most `limit` entries per call (default 100), so a
  // single call silently missed everything past the first page for a user
  // with many documents. Each batch is removed before the next list, so
  // every call re-reads from the start: loop until the folder lists empty.
  // Stop early if a remove fails or removes nothing, so a stuck object
  // can't spin this forever. All uploads are flat `${user.id}/<file>` paths
  // (see Documents.jsx / EditProfile.jsx), so there are no subfolders to
  // recurse into.
  const STORAGE_LIST_BATCH = 1000;
  const MAX_STORAGE_BATCHES = 50;

  for (const bucket of ['avatars', 'documents']) {
    let removedTotal = 0;

    for (let batch = 0; batch < MAX_STORAGE_BATCHES; batch++) {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(bucket)
        .list(user.id, { limit: STORAGE_LIST_BATCH });

      if (listError) {
        console.log(`[delete-account] ${bucket} list failed:`, listError.message);
        break;
      }

      if (!files || files.length === 0) break;

      const paths = files.map((file) => `${user.id}/${file.name}`);
      const { data: removed, error: removeError } = await supabaseAdmin.storage
        .from(bucket)
        .remove(paths);

      if (removeError || !removed || removed.length === 0) {
        console.log(
          `[delete-account] ${bucket} remove stopped:`,
          removeError?.message ?? 'nothing removed',
        );
        break;
      }

      removedTotal += removed.length;
    }

    console.log(`[delete-account] ${bucket} files removed:`, removedTotal);
  }

  console.log('[delete-account] deleting auth user:', user.id);

  // Logged before deletion, while the user still exists — activity_log's
  // user_id is ON DELETE SET NULL (not cascade) specifically so this row
  // survives the account being deleted, but the email is only available
  // right now, so it's captured into `details` rather than relied on later.
  // Wrapped so a logging hiccup can never block the actual deletion below.
  try {
    const { error: logError } = await supabaseAdmin
      .from('activity_log')
      .insert({ user_id: user.id, action: 'account_deleted', details: { email: user.email } });
    if (logError) {
      console.log('[delete-account] activity_log insert failed (non-fatal):', logError.message);
    }
  } catch (err) {
    console.log('[delete-account] activity_log insert failed (non-fatal):', err);
  }

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
