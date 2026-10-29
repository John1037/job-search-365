import { FunctionsHttpError } from '@supabase/supabase-js';

// supabase-js's own error.message for a non-2xx Edge Function response is
// always the generic "Edge Function returned a non-2xx status code" — the
// actual reason (every edge function here responds with jsonResponse({
// error: "..." }) on failure) has to be read separately from the raw
// Response object on error.context. Falls back to the generic message if
// the body isn't readable/JSON for any reason, so this is always safe to
// call on any fnError.
export async function getFunctionErrorMessage(fnError) {
  if (fnError instanceof FunctionsHttpError) {
    try {
      const body = await fnError.context.json();
      if (body?.error) return body.error;
    } catch {
      // Body wasn't JSON, already consumed, etc. — fall through.
    }
  }
  return fnError.message;
}
