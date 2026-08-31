import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import ControlBar from './ControlBar';

// Privacy Policy / Terms of Service are public routes (reachable while
// logged out, since Google's OAuth review and prospective sign-ups need
// to read them without an account) but are also linked from Settings for
// signed-in users, who expect the normal app chrome rather than a bare
// logo. Show the full nav when there's a session, and a minimal header
// otherwise — the dropdowns/profile menu only make sense once logged in.
function LegalPageHeader() {
  const [session, setSession] = useState(undefined);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [country, setCountry] = useState(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      if (!session) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, country')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile?.country) setCountry(profile.country);
    }

    load();
  }, []);

  if (session === undefined) return null;

  if (!session) {
    return (
      <header className="control-bar">
        <div className="control-bar-brand">
          <img src="/favicon.svg" alt="" className="brand-icon" />
          <span className="brand-text">Job Search 365</span>
        </div>
      </header>
    );
  }

  return <ControlBar avatarUrl={avatarUrl} country={country} />;
}

export default LegalPageHeader;
