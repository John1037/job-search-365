import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

const GMAIL_OAUTH_STATE_KEY = 'gmail_oauth_state';

function InboxCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function run() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const oauthError = params.get('error');

      const expectedState = sessionStorage.getItem(GMAIL_OAUTH_STATE_KEY);
      sessionStorage.removeItem(GMAIL_OAUTH_STATE_KEY);

      if (oauthError) {
        setError(`Google sign-in was cancelled or failed (${oauthError}).`);
        return;
      }

      // The random state value round-trips through Google — if it doesn't
      // match what we stashed before redirecting, this isn't a response to
      // a sign-in we actually started, so don't proceed with it.
      if (!code || !state || state !== expectedState) {
        setError(
          'This sign-in link is invalid or has expired. Please try connecting again.',
        );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('Not signed in.');
        return;
      }

      const { error: fnError } = await supabase.functions.invoke(
        'gmail-oauth-callback',
        {
          body: {
            code,
            redirect_uri: `${window.location.origin}/inbox/callback`,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (fnError) {
        setError(fnError.message);
        return;
      }

      navigate('/inbox', { replace: true });
    }

    run();
  }, [navigate]);

  return (
    <div className="page-content">
      <h1>Connecting Gmail…</h1>
      {error ? (
        <>
          <p className="form-error">{error}</p>
          <button
            type="button"
            className="button-outline"
            onClick={() => navigate('/inbox', { replace: true })}
          >
            Back to Inbox
          </button>
        </>
      ) : (
        <p>Please wait…</p>
      )}
    </div>
  );
}

export default InboxCallback;
