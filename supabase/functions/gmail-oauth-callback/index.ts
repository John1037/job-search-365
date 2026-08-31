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

  // Client scoped to the caller's own token — RLS means the upsert below
  // only ever touches this user's own row, so no manual ownership checks.
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

  const { code, redirect_uri } = await req.json();
  if (!code || !redirect_uri) {
    return jsonResponse({ error: 'Missing code or redirect_uri' }, 400);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      redirect_uri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    console.log('[gmail-oauth-callback] token exchange failed:', detail);
    return jsonResponse({ error: 'Failed to connect Gmail' }, 502);
  }

  const tokens = await tokenResponse.json();

  if (!tokens.refresh_token) {
    // Google only returns a refresh_token on first consent (or when
    // prompt=consent is forced, as it is here) — without one, storing an
    // access-token-only connection would silently stop working once that
    // token expires in about an hour, with no way to renew it. Treat this
    // as a hard failure rather than a partial connection.
    return jsonResponse(
      {
        error:
          "Google didn't grant offline access. Remove Job Search 365 from your Google account's connected apps (myaccount.google.com/permissions) and try connecting again.",
      },
      400,
    );
  }

  const profileResponse = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );

  let emailAddress: string | null = null;
  if (profileResponse.ok) {
    const profile = await profileResponse.json();
    emailAddress = profile.emailAddress ?? null;
  }

  const accessTokenExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000,
  ).toISOString();

  const { error: upsertError } = await supabaseUser
    .from('email_connections')
    .upsert(
      {
        user_id: user.id,
        provider: 'gmail',
        email_address: emailAddress,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: accessTokenExpiresAt,
      },
      { onConflict: 'user_id,provider' },
    );

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, 500);
  }

  return jsonResponse({ email_address: emailAddress }, 200);
});
