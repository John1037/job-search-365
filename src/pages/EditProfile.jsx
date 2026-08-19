import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PhoneField from '../components/PhoneField';
import AvatarUpload from '../components/AvatarUpload';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import ChangeEmailDialog from '../components/ChangeEmailDialog';
import { sortedCountries } from '../data/countries';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const EXTENSION_BY_MIME_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function EditProfile() {
  const navigate = useNavigate();
  const {
    setAvatarUrl: setLayoutAvatarUrl,
    setShortName: setLayoutShortName,
    setCountry: setLayoutCountry,
  } = useOutletContext();
  const [userId, setUserId] = useState(null);
  const [fullName, setFullName] = useState('');
  const [shortName, setShortName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('GB');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('GB');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarError, setAvatarError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setUserId(user.id);
      setEmail(user.email ?? '');

      const { data: profile, error } = await supabase
        .from('profiles')
        .select(
          'full_name, short_name, phone_country, phone_number, location, country, avatar_url, linkedin_url',
        )
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        setError(error.message);
      } else if (profile) {
        setFullName(profile.full_name ?? '');
        setShortName(profile.short_name ?? '');
        if (profile.phone_country) setPhoneCountry(profile.phone_country);
        setPhoneNumber(profile.phone_number ?? '');
        setLocation(profile.location ?? '');
        if (profile.country) setCountry(profile.country);
        setLinkedinUrl(profile.linkedin_url ?? '');
        setAvatarUrl(profile.avatar_url ?? null);
        setAvatarPreview(profile.avatar_url ?? null);
      }

      setLoading(false);
    }

    loadProfile();
  }, []);

  function handleAvatarSelected(file) {
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError('Image must be smaller than 5MB.');
      return;
    }

    setAvatarError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    let newAvatarUrl = avatarUrl;

    if (avatarFile) {
      const ext = EXTENSION_BY_MIME_TYPE[avatarFile.type] ?? 'png';
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
        });

      if (uploadError) {
        setError(uploadError.message);
        setSaving(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);
      newAvatarUrl = `${publicUrl}?t=${Date.now()}`;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      short_name: shortName,
      phone_country: phoneCountry,
      phone_number: phoneNumber,
      location,
      country,
      linkedin_url: linkedinUrl || null,
      avatar_url: newAvatarUrl,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    setAvatarUrl(newAvatarUrl);
    setAvatarFile(null);
    setLayoutAvatarUrl(newAvatarUrl);
    setLayoutShortName(shortName);
    setLayoutCountry(country);

    setMessage('Profile saved.');
    setSaving(false);
  }

  async function handleDeleteAccount() {
    console.log('[delete-account] starting');

    const {
      data: { session },
    } = await supabase.auth.getSession();

    console.log('[delete-account] session present:', !!session);

    if (!session) return { error: 'Not signed in.' };

    console.log('[delete-account] invoking edge function');

    const { data: functionData, error: functionError } =
      await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

    console.log('[delete-account] invoke result:', {
      functionData,
      functionError,
    });

    if (functionError) {
      return { error: functionError.message };
    }

    console.log('[delete-account] signing out');
    await supabase.auth.signOut();
    navigate('/');
    return {};
  }

  if (loading) {
    return <div className="page-content">Loading…</div>;
  }

  return (
    <div className="page-content">
      <form className="profile-form" onSubmit={handleSubmit}>
        <h1>Edit profile</h1>

        <AvatarUpload
          previewUrl={avatarPreview}
          onFileSelected={handleAvatarSelected}
          error={avatarError}
        />

        <label htmlFor="fullName">Full legal name</label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <p className="field-warning">
          This will be visible to potential employers.
        </p>

        <label htmlFor="shortName">Short-form name</label>
        <input
          id="shortName"
          type="text"
          value={shortName}
          onChange={(e) => setShortName(e.target.value)}
        />
        <p className="field-hint">How this app should address you.</p>

        <label htmlFor="email">Email address</label>
        <div className="email-field">
          <input id="email" type="email" value={email} disabled />
          <button
            type="button"
            className="email-field-change"
            onClick={() => setChangeEmailOpen(true)}
          >
            Change
          </button>
        </div>

        <label htmlFor="phoneNumber">Phone number</label>
        <PhoneField
          countryCode={phoneCountry}
          phoneNumber={phoneNumber}
          onCountryChange={setPhoneCountry}
          onNumberChange={setPhoneNumber}
          numberInputId="phoneNumber"
        />

        <label htmlFor="location">Location (city)</label>
        <input
          id="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <label htmlFor="country">Country</label>
        <select
          id="country"
          className="profile-select"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          {sortedCountries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>

        <label htmlFor="linkedinUrl">LinkedIn profile</label>
        <div className="url-field">
          <input
            id="linkedinUrl"
            type="url"
            placeholder="https://www.linkedin.com/in/..."
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="url-field-open"
            >
              Open
            </a>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-message">{message}</p>}

        <div className="profile-form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="button-outline"
            onClick={() => navigate('/main')}
          >
            Back to home
          </button>
        </div>
      </form>

      <hr className="danger-zone-divider" />

      <section className="danger-zone">
        <h2>Danger Zone</h2>
        <button
          type="button"
          className="confirm-danger-button"
          onClick={() => setDeleteDialogOpen(true)}
        >
          Delete my account
        </button>
        <p className="field-warning">
          This will permanently delete ALL of your data. This cannot be undone.
        </p>
      </section>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteAccount}
      />

      <ChangeEmailDialog
        open={changeEmailOpen}
        onClose={() => setChangeEmailOpen(false)}
        currentEmail={email}
      />
    </div>
  );
}

export default EditProfile;
