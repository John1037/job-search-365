// Fires when a database trigger detects auth.users.email changed. Sends a
// heads-up notice to the OLD address only — with "Secure email change"
// turned off, Supabase itself no longer tells the old address anything, so
// this is the only signal an account owner gets if their email was switched
// without their knowledge.

import { timingSafeEqual } from 'jsr:@std/crypto/timing-safe-equal';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-webhook-secret',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildEmailHtml(newEmail: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your email address was changed</title>
</head>
<body style="margin:0; padding:0; background-color:#e7f6f6; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e7f6f6;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%; background-color:#ffffff; border-radius:10px; overflow:hidden; border:1px solid #d5d8dc;">

          <tr>
            <td style="padding: 28px 40px; border-bottom:1px solid #d5d8dc;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle; padding-right:10px;">
                    <img src="https://jobsearch365.com/logo-email.png" width="30" height="29" alt="" style="display:block; border:0;">
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:19px; font-weight:800; font-style:italic; letter-spacing:-0.4px; text-transform:uppercase; color:#7e14ff;">Job Search 365</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 36px 40px 8px;">
              <h1 style="margin:0 0 20px; font-size:22px; line-height:1.3; color:#1f2328;">Your account email address was changed</h1>

              <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#1f2328;">
                The email address on your Job Search 365 account was just changed to <strong>${newEmail}</strong>. This inbox will no longer receive notifications for this account.
              </p>

              <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#1f2328;">
                If you made this change, no action is needed.
              </p>

              <p style="margin:0 0 4px; font-size:15px; line-height:1.6; color:#1f2328;">
                If you didn't make this change, please contact <a href="mailto:support@jobsearch365.com" style="color:#2563eb;">support@jobsearch365.com</a> right away so we can help secure your account.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 24px 40px 32px; border-top:1px solid #d5d8dc;">
              <p style="margin:0 0 6px; font-size:13px; color:#5b6169;">
                Need help? <a href="mailto:support@jobsearch365.com" style="color:#2563eb;">support@jobsearch365.com</a>
              </p>
              <p style="margin:0; font-size:13px; color:#5b6169;">&copy; 2026 &middot; 365 Applications</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const providedSecret = req.headers.get('X-Webhook-Secret');
  const expectedSecret = Deno.env.get('EMAIL_CHANGE_WEBHOOK_SECRET');

  // Constant-time comparison — a plain !== leaks a timing signal that
  // could in principle help an attacker recover the secret byte-by-byte.
  const encoder = new TextEncoder();
  const secretIsValid =
    !!expectedSecret &&
    !!providedSecret &&
    providedSecret.length === expectedSecret.length &&
    timingSafeEqual(encoder.encode(providedSecret), encoder.encode(expectedSecret));

  if (!secretIsValid) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { old_email, new_email } = await req.json();

  if (!old_email || !new_email) {
    return jsonResponse({ error: 'Missing old_email or new_email' }, 400);
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Job Search 365 <support@jobsearch365.com>',
      to: [old_email],
      subject: 'Your Job Search 365 email address was changed',
      html: buildEmailHtml(new_email),
    }),
  });

  if (!resendResponse.ok) {
    const detail = await resendResponse.text();
    console.log('[notify-email-changed] Resend send failed:', detail);
    return jsonResponse({ error: 'Failed to send notification' }, 502);
  }

  return jsonResponse({ success: true }, 200);
});
