# Connecting and Disconnecting Gmail

The Inbox feature (Jobs menu → **Inbox**, or `/inbox`) can scan Gmail for application-related emails and suggest matching status updates for review before anything is added to a job. This document covers connecting and disconnecting the account; scanning is manual, triggered by a "Scan now" button on the same Inbox page once connected.

## Connecting

1. Go to **Inbox**.
2. Click **Connect Gmail**.
3. You're redirected to Google's sign-in/consent screen. The app only ever requests **read-only** access to Gmail — it can never send email or modify/delete anything in your mailbox.
4. After granting access, you're redirected back and automatically returned to the Inbox page, now showing "Connected as {your email address}."

If something goes wrong partway through, you'll see one of:
- "Google sign-in was cancelled or failed (...)" — you cancelled or Google returned an error.
- "This sign-in link is invalid or has expired. Please try connecting again." — the link was reused or timed out; just start over.
- "Not signed in." — your JobSearch 365 session had logged out; log back in and try again.

## Disconnecting

1. On the Inbox page, click **Disconnect** next to "Connected as {email}."
2. Confirm: "Disconnect Gmail? — JobSearch 365 will no longer be able to scan your inbox for application updates." Click **Disconnect** to confirm.

This fully revokes the app's access on Google's side too, not just locally — you'd need to go through the connect flow again (and grant access again) to reconnect.
