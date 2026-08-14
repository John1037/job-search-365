import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import ControlBar from './ControlBar';
import Footer from './Footer';

function Layout() {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [shortName, setShortName] = useState(null);
  const [country, setCountry] = useState(null);
  const [alertWindowDays, setAlertWindowDays] = useState(30);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load profile:', error.message);
        return;
      }

      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile?.short_name) setShortName(profile.short_name);
      if (profile?.country) setCountry(profile.country);
      if (profile?.alert_window_days) setAlertWindowDays(profile.alert_window_days);
    }

    loadProfile();
  }, []);

  return (
    <>
      <ControlBar avatarUrl={avatarUrl} country={country} />
      <Outlet
        context={{
          avatarUrl,
          setAvatarUrl,
          shortName,
          setShortName,
          country,
          setCountry,
          alertWindowDays,
          setAlertWindowDays,
        }}
      />
      <Footer />
    </>
  );
}

export default Layout;
