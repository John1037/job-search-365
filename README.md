# Job Search 365

A full-stack job application tracker — built to replace a spreadsheet for
managing an active job search: every application, its status pipeline,
key dates, documents, and notes in one place.

Live at [jobsearch365.com](https://jobsearch365.com).

## Features

- **Job pipeline tracking** — log a job as soon as it's of interest, then
  record events as they happen: Applied, Application acknowledged,
  Interview scheduled/cancelled/completed, Offer received/accepted,
  Unsuccessful, or a free-text Other. Status is derived from the event
  history, not set by hand, recalculates automatically if an event is
  deleted, and the event picker only offers what makes sense next given
  the job's current status. Selecting Unsuccessful closes the job
  automatically; Close/Reopen and Delete are also available directly from
  the job detail page.
- **Add a job manually or import it from a URL** — paste a job posting
  link and an Edge Function fetches the listing (via a rendering proxy, so
  JavaScript-heavy job boards work too) and extracts the title, employer,
  salary, location, employment type, and description with an LLM, landing
  you straight on the new job's page to review and correct anything it
  missed.
- **AI-drafted cover letters** — for a job with a description and a
  connected PDF CV, generate a tailored cover letter draft from both,
  editable before saving as both `.txt` and `.pdf`, with the PDF connected
  to the job automatically.
- **Gmail inbox scanning** — connect a Gmail account (read-only OAuth) and
  scan recent mail for application updates. Candidate emails are matched
  against your open jobs and classified into a suggested status update by
  an LLM, landing in a review queue — nothing is written to a job until
  you confirm it, opening the same event dialog used everywhere else,
  pre-filled with the suggested event and date. Scanning is manual
  ("Scan now") for now; nothing runs automatically in the background yet.
- **AI CV optimization** — reorders a connected PDF CV's own content
  (skills, experience bullets, categorized tool lists) by relevance to a
  specific job's description — never adding, removing, or rewording
  anything, only resequencing. Detects the CV's actual section and
  sub-section structure directly from the PDF (font size, bold weight,
  bullet vs. wrapped-continuation lines) and reproduces that structure,
  including page breaks, in the optimized output.
- **Full job detail editing** — title, employer, salary (min/max, currency,
  type, and basis — flat/estimated/OTE), employment type and duration,
  location type and location, job posting URL, contact person, application
  method, description, and notes.
- **Card grid with search, filter, and sort** — full-text search (Postgres
  `tsvector` + GIN index) across title, employer, location, description,
  and notes, with a cross-page hint when a search also matches jobs in the
  other open/closed view. Filter by status, salary range, location,
  location type, or employment type. Sort by up to three stacked criteria,
  with a sensible default (favorites first, then newest).
- **Favorites** — mark jobs as Preferred or Favorite; they're highlighted
  with star ratings and sort to the top by default.
- **Document management** — upload CVs, cover letters, certificates, and
  other supporting documents once, then connect them to any job via fixed
  slots; view or disconnect from the job detail page.
- **Account & profile** — avatar upload, contact details, LinkedIn/GitHub
  links, phone number with country code, timezone-aware date formatting
  (US vs. rest-of-world), account deletion.
- **Custom transactional email** — branded HTML templates (confirm signup,
  reset password, change email, and an email-changed security notice) sent
  via a custom SMTP provider rather than Supabase's default limited mailer.
- **Theme-aware UI** — full light/dark mode support, including third-party
  browser autofill styling.

## Tech stack

- **Frontend:** React 19 + Vite, React Router v7. No CSS framework — a
  single hand-written stylesheet with theme variables for light/dark mode.
- **Backend:** [Supabase](https://supabase.com) — Postgres (RLS-scoped to
  `auth.uid()` on every table), Auth, Storage (avatars, documents), and
  Edge Functions (Deno) for account deletion, email-change notifications,
  and three LLM-backed features (job import, cover letter drafting, CV
  optimization).
- **AI:** [DeepSeek](https://www.deepseek.com) for job-listing extraction,
  cover letter drafting, CV content reordering, and email-to-job matching
  (many small, targeted calls per operation rather than one large one, run
  concurrently under a shared limiter). PDF text/layout extraction via
  [`unpdf`](https://github.com/unjs/unpdf); PDF generation via
  [`jsPDF`](https://github.com/parallax/jsPDF).
- **Gmail:** OAuth 2.0 (read-only `gmail.readonly` scope) + the Gmail API,
  called directly via `fetch()` rather than a client library.
- **Email:** [Resend](https://resend.com) via custom SMTP, triggered
  partly by a Postgres trigger + `pg_net` calling an Edge Function
  directly from the database.
- **Hosting:** [Cloudflare Pages](https://pages.cloudflare.com/), deployed
  automatically on push via Git integration.

## Project structure

```
src/
  pages/         Route-level pages (Home, ManageJobs, JobDetail, AddJob,
                  Documents, Settings, EditProfile, Landing, Signup, ...)
  components/     Reusable UI: dialogs (Add event, Filter, Sort, Connect
                  document, Add job / import from URL, Suggest cover
                  letter, Optimize CV, ...), JobCard, LoadingBar, form
                  fields, layout chrome
  jobFormat.js    Shared job formatting/constants (labels, column list,
                  event-progression rules)
  jobFilters.js   Filter option derivation + predicate logic
  jobSort.js      Multi-level sort logic
  supabaseClient.js
supabase/
  functions/      Edge Functions — delete-account, notify-email-changed,
                  import-job-listing, generate-cover-letter, optimize-cv,
                  gmail-oauth-callback, scan-gmail-inbox
  config.toml     Local Supabase CLI config
```

## Local development

Requires Node.js and a Supabase project.

```bash
npm install
cp .env.example .env   # fill in your own Supabase project URL + publishable key
npm run dev
```

Environment variables (see `.env.example`):

| Variable                  | Description                                   |
| -------------------------- | ---------------------------------------------- |
| `VITE_SUPABASE_URL`        | Your Supabase project URL                      |
| `VITE_SUPABASE_ANON_KEY`   | Supabase publishable (client-safe) API key     |
| `VITE_GOOGLE_CLIENT_ID`    | Google OAuth 2.0 Client ID (Gmail inbox scanning) |

The AI-backed Edge Functions (`import-job-listing`, `generate-cover-letter`,
`optimize-cv`, `scan-gmail-inbox`) need a `DEEPSEEK_API_KEY` — this is a
**Supabase Edge Function secret**, not a Vite/frontend env var, so it never
goes in `.env`. Set it with `supabase secrets set DEEPSEEK_API_KEY=...` for
a deployed project, or in a local, gitignored `supabase/.env` for `supabase
functions serve`.

Gmail inbox scanning additionally needs a Google Cloud OAuth 2.0 Client
(Web application, `gmail.readonly` scope, authorized redirect URI
`<your origin>/inbox/callback`). The Client ID is not secret and goes in
`VITE_GOOGLE_CLIENT_ID` above; the Client Secret is a Supabase Edge
Function secret (`GOOGLE_CLIENT_SECRET`), same pattern as
`DEEPSEEK_API_KEY`. While the Google OAuth consent screen is in "Testing"
mode (fine for personal use, no Google verification needed), granted
refresh tokens expire after 7 days, so reconnecting periodically is
expected.

Other scripts:

```bash
npm run build     # production build
npm run preview   # preview the production build locally
npm run lint       # oxlint
```

## Deployment

Deploys automatically to Cloudflare Pages on push to `main`. Build
environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are
configured in the Cloudflare Pages project settings rather than committed
to the repo.

## License

All rights reserved — see [LICENSE](./LICENSE). This repository is public
for portfolio purposes only; it is not licensed for reuse.
