import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PersonIcon from './PersonIcon';
import NavDropdown from './NavDropdown';

function ControlBar({ avatarUrl, country }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogOut() {
    setMenuOpen(false);
    await supabase.auth.signOut();
  }

  const cvLabel = country === 'US' ? 'Manage Resumes' : 'Manage CVs';
  const documentsItems = [
    { label: cvLabel, onClick: () => navigate('/documents/cv') },
    {
      label: 'Manage cover letters',
      onClick: () => navigate('/documents/cover_letter'),
    },
    {
      label: 'Manage certificates',
      onClick: () => navigate('/documents/certificate'),
    },
  ];

  return (
    <header className="control-bar">
      <Link to="/" className="control-bar-brand">
        <img src="/favicon.svg" alt="" className="brand-icon" />
        <span className="brand-text">Job Search 365</span>
      </Link>

      <div className="control-bar-right">
        <nav className="control-bar-menu">
          <NavDropdown label="Documents" items={documentsItems} />
        </nav>

        <div className="control-bar-profile" ref={menuRef}>
          <button
            type="button"
            className="profile-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Profile menu"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="profile-avatar-img" />
            ) : (
              <PersonIcon />
            )}
          </button>

          {menuOpen && (
            <div className="profile-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/profile');
                }}
              >
                Edit profile
              </button>
              <button type="button" role="menuitem" onClick={handleLogOut}>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default ControlBar;
