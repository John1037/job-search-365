import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ControlBar from './ControlBar';

function Layout() {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [shortName, setShortName] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url, short_name')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile?.short_name) setShortName(profile.short_name);
    }

    loadProfile();
  }, []);

  return (
    <>
      <ControlBar avatarUrl={avatarUrl} />
      <Outlet context={{ avatarUrl, setAvatarUrl, shortName, setShortName }} />
    </>
  );
}

export default Layout;
