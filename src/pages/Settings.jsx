import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getStoredTheme, setTheme } from '../theme';
import { supabase } from '../supabaseClient';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const ALERT_WINDOW_OPTIONS = [7, 14, 30, 60, 90];

function Settings() {
  const navigate = useNavigate();
  const [theme, setThemeState] = useState(getStoredTheme());
  const { alertWindowDays, setAlertWindowDays } = useOutletContext();
  const [savingWindow, setSavingWindow] = useState(false);
  const [windowError, setWindowError] = useState(null);

  function handleSelect(value) {
    setTheme(value);
    setThemeState(value);
  }

  async function handleAlertWindowChange(e) {
    const days = Number(e.target.value);
    setWindowError(null);
    setSavingWindow(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSavingWindow(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        alert_window_days: days,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSavingWindow(false);

    if (error) {
      setWindowError(error.message);
      return;
    }

    setAlertWindowDays(days);
  }

  return (
    <div className="page-content">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Theme</h2>
        <div className="theme-toggle" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={theme === option.value}
              className={
                'theme-toggle-option' +
                (theme === option.value ? ' theme-toggle-option-active' : '')
              }
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Alerts</h2>
        <label htmlFor="alertWindow">Show alerts for events in the next</label>
        <select
          id="alertWindow"
          className="profile-select"
          value={alertWindowDays}
          onChange={handleAlertWindowChange}
          disabled={savingWindow}
        >
          {ALERT_WINDOW_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
        </select>
        {windowError && <p className="form-error">{windowError}</p>}
      </section>

      <button
        type="button"
        className="link-button"
        onClick={() => navigate('/main')}
      >
        Back to home
      </button>
    </div>
  );
}

export default Settings;
