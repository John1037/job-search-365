import Footer from '../components/Footer';
import LegalPageHeader from '../components/LegalPageHeader';

function PrivacyPolicy() {
  return (
    <>
      <LegalPageHeader />

      <main className="legal-page">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 31 August 2026</p>

        <p>
          Job Search 365 ("the Service") is a job-application tracker,
          provided under the name 365 Applications ("we", "us"). This
          policy explains what information the Service collects, how it's
          used, and your choices. This is a personal, independently-run
          project rather than a large company — if anything here is
          unclear, email us and we'll answer directly.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your email address, and
            any profile details you choose to add — name, phone number,
            location, LinkedIn/GitHub links, avatar image.
          </li>
          <li>
            <strong>Job application data:</strong> everything you enter
            about jobs you're tracking (titles, employers, salary, dates,
            status history, notes) and any documents you upload (CVs,
            cover letters, certificates, other files).
          </li>
          <li>
            <strong>Gmail data (only if you choose to connect it):</strong>{' '}
            with your explicit permission, read-only access to search your
            Gmail account for messages that may relate to a job
            application you're tracking, and to read the sender, subject,
            date, and a short preview snippet of matching messages. We
            never request write access, never send email on your behalf,
            and don't read full email bodies or messages unrelated to your
            tracked applications.
          </li>
          <li>
            <strong>Usage data:</strong> standard technical logs (e.g. from
            our hosting provider) needed to operate and secure the
            Service.
          </li>
        </ul>

        <h2>How we use your information</h2>
        <ul>
          <li>
            To provide the Service's core features: tracking applications,
            storing your documents, and surfacing alerts for upcoming
            events.
          </li>
          <li>
            To power optional AI features you choose to use — drafting a
            cover letter, reordering CV content by relevance, extracting
            job details from a posting URL, and matching Gmail messages to
            your tracked applications. Content you submit or connect for
            these features (job descriptions, CV text, email metadata and
            snippets) is sent to our AI provider, DeepSeek, solely to
            perform the specific feature you requested.
          </li>
          <li>
            To send account-related email (signup confirmation, password
            resets, security notices) via our email provider, Resend.
          </li>
        </ul>

        <h2>Gmail data and Google's user data policy</h2>
        <p>
          Job Search 365's use and transfer of information received from
          Google APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Gmail data is used
          only to power the inbox-scanning feature described above, is
          never used for advertising, and is never viewed by a human
          except where necessary to provide support you request,
          investigate misuse, or comply with the law. Suggested matches
          are never applied to your job records automatically — you review
          and confirm every one. You can disconnect Gmail access at any
          time from the Inbox page in the Service, and independently
          revoke access from your Google Account at{' '}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2>Who processes your data</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — database, authentication, and file
            storage. Every table is access-controlled so you can only ever
            read or write your own data.
          </li>
          <li>
            <strong>DeepSeek</strong> — processes content you submit to the
            AI-assisted features (cover letters, CV optimization, job
            import, Gmail matching) via their API, solely to generate the
            result for that feature.
          </li>
          <li>
            <strong>Resend</strong> — delivers account-related
            transactional email.
          </li>
          <li>
            <strong>Cloudflare</strong> — hosts the web app.
          </li>
          <li>
            <strong>Google</strong> — provides Gmail API access, only if
            and while you've connected Gmail.
          </li>
        </ul>
        <p>We don't sell your data, and don't share it for advertising.</p>

        <h2>Data retention</h2>
        <p>
          Your data is kept for as long as your account is active.
          Deleting your account (available from your profile page) deletes
          your account data, including any connected Gmail access.
        </p>

        <h2>Your choices</h2>
        <p>
          You can view, edit, or delete most of your data directly in the
          Service. You can disconnect Gmail at any time. For anything else
          — including requests to access or delete data not covered by
          the app's own tools — contact us below.
        </p>

        <h2>Security</h2>
        <p>
          Data is transmitted over HTTPS and stored with per-user access
          controls at the database level, so one account can't read
          another's data.
        </p>

        <h2>Children's privacy</h2>
        <p>
          The Service isn't directed at children and isn't intended for
          use by anyone under 16.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this page from time to time. Material changes will
          be reflected here with an updated date.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy:{' '}
          <a href="mailto:support@jobsearch365.com">
            support@jobsearch365.com
          </a>
        </p>
      </main>

      <Footer />
    </>
  );
}

export default PrivacyPolicy;
