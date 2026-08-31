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

  // Client scoped to the caller's own token — RLS means the read/delete
  // below only ever touch this user's own row, so no manual ownership
  // checks. The refresh token never leaves this function.
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

  const { data: connection, error: connectionError } = await supabaseUser
    .from('email_connections')
    .select('id, refresh_token')
    .eq('provider', 'gmail')
    .maybeSingle();

  if (connectionError) {
    return jsonResponse({ error: connectionError.message }, 500);
  }

  if (!connection) {
    return jsonResponse({ success: true }, 200);
  }

  // Revoking the refresh token invalidates the whole grant (and any
  // derived access token) on Google's side, so it also disappears from
  // the user's Google Account connected-apps list — deleting our own row
  // alone would leave access silently still active there. Best-effort:
  // if the token's already invalid (e.g. the user revoked it manually),
  // this will fail, but we still proceed to remove our own record either
  // way since that's the user's clear intent.
  const revokeResponse = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: connection.refresh_token }),
  });

  if (!revokeResponse.ok) {
    const detail = await revokeResponse.text();
    console.log('[gmail-disconnect] revoke failed (proceeding anyway):', detail);
  }

  const { error: deleteError } = await supabaseUser
    .from('email_connections')
    .delete()
    .eq('id', connection.id);

  if (deleteError) {
    return jsonResponse({ error: deleteError.message }, 500);
  }

  return jsonResponse({ success: true }, 200);
});
