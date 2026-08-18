import { useEffect, useRef } from 'react';
import PersonIcon from './PersonIcon';

function AvatarUpload({ previewUrl, onFileSelected, error }) {
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onFileSelected(file);
  }

  return (
    <div className="avatar-upload">
      <div className="avatar-preview">
        {previewUrl ? (
          <img src={previewUrl} alt="Profile" />
        ) : (
          <PersonIcon size={36} />
        )}
      </div>

      <div>
        <button
          type="button"
          className="button-outline"
          onClick={() => fileInputRef.current?.click()}
        >
          {previewUrl ? 'Change photo' : 'Upload photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="avatar-file-input"
        />
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}

export default AvatarUpload;
