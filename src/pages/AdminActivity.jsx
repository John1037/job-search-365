import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

// Placeholder — confirms the admin route/nav/gating pre-requisites work.
// The actual activity-log browsing UI is a separate, later piece of work.
// The redirect below is a UX nicety only: the real security boundary is
// the RLS policy on activity_log (admin/owner account_level required to
// read any rows), not this client-side check.
function AdminActivity() {
  const navigate = useNavigate();
  const { accountLevel } = useOutletContext();

  useEffect(() => {
    if (accountLevel && accountLevel !== 'admin' && accountLevel !== 'owner') {
      navigate('/main');
    }
  }, [accountLevel, navigate]);

  return (
    <div className="page-content">
      <h1>Activity log</h1>
      <p>Signed in as {accountLevel}.</p>
    </div>
  );
}

export default AdminActivity;
