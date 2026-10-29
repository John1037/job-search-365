// User-invoked "Recalculate match scores" button on the CV components page.
// Finds every open job (is_closed = false) with a description for the
// calling user, and re-runs job-match-rating for each — calling that
// function the same way its own DB-trigger webhook does (shared secret),
// rather than duplicating its CV-fit scoring logic here.

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

// Bounded concurrency, same rationale as build-cv's Bedrock semaphore — an
// unbounded Promise.all across every open job risks tripping a soft
// per-key concurrency ceiling on the model API.
function createSemaphore(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  async function acquire() {
    if (active < limit) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
  }
  function release() {
    active--;
    waiting.shift()?.();
  }
  return { acquire, release };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  // Client scoped to the caller's own token — RLS means the job query
  // below only ever sees this user's own rows.
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

  const { data: jobs, error: jobsError } = await supabaseUser
    .from('jobs')
    .select('id')
    .eq('is_closed', false)
    .not('description', 'is', null);

  if (jobsError) {
    console.log('[recalculate-match-ratings] jobs query failed:', jobsError);
    return jsonResponse({ error: jobsError.message }, 500);
  }

  const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/job-match-rating`;
  const webhookSecret = Deno.env.get('JOB_MATCH_WEBHOOK_SECRET')!;
  const semaphore = createSemaphore(4);

  let succeeded = 0;
  let failed = 0;

  await Promise.all(
    (jobs ?? []).map(async (job) => {
      await semaphore.acquire();
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhookSecret,
          },
          body: JSON.stringify({ job_id: job.id }),
          signal: AbortSignal.timeout(60000),
        });
        if (response.ok) {
          succeeded++;
        } else {
          failed++;
          console.log(
            '[recalculate-match-ratings] job-match-rating failed for',
            job.id,
            await response.text(),
          );
        }
      } catch (err) {
        failed++;
        console.log(
          '[recalculate-match-ratings] job-match-rating call errored for',
          job.id,
          err,
        );
      } finally {
        semaphore.release();
      }
    }),
  );

  return jsonResponse({ total: jobs?.length ?? 0, succeeded, failed }, 200);
});
