# JobSearch 365

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
  Access (and the local connection record) can be revoked at any time.
- **AI CV building with a real template engine** — maintain a reusable
  library of CV components (profile summary, skills, work history with
  achievement bullets, education, certifications, custom sections) on the
  "Manage CV components" page — either built up by hand or imported
  wholesale from an existing `.pdf`/`.docx` CV, with the extracted content
  reviewed and edited before anything is saved. Building a CV for a
  specific job: the LLM selects and orders only what's relevant from the
  library (it's never asked to invent or reword a stored skill/bullet —
  only to choose ids) and drafts a tailored profile paragraph, with an
  editable review step before rendering. Rendering goes through a
  config-driven PDF engine (`src/cvTemplates/`) offering 8 layouts
  (single-column, sidebar-left/right, compact, and bolder color-block
  variants), 6 curated color palettes per layout, a serif/sans-serif font
  toggle, optional profile photo, and an in-dialog live PDF preview before
  saving.
- **A dedicated "email address for applications"** — separate from the
  account's login email, so CVs, cover letters, and anywhere else a user
  is contacted about a job use an address that doesn't have to be the
  same one they log in with.
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
- **Account & profile** — avatar upload, contact details, LinkedIn/GitHub/
  portfolio/website links (surfaced on generated CVs as a Links section),
  phone number with country code, timezone-aware date formatting (US vs.
  rest-of-world), account deletion.
- **Guided onboarding** — a welcome screen shown at the start of a session
  whenever profile completion, CV-library completion, or "has ever added a
  job" isn't yet satisfied, with live progress indicators per step and a
  "don't show again" opt-out.
- **Custom transactional email** — branded HTML templates (confirm signup,
  reset password, change email, and an email-changed security notice) sent
  via a custom SMTP provider rather than Supabase's default limited mailer.
- **Theme-aware UI** — full light/dark mode support, including third-party
  browser autofill styling.
- **Embedded support chat widget** — a third-party chat widget (a separate
  project, `chat365`) is embedded site-wide via a `<script>` tag in
  `index.html`, backed by its own knowledge base (see `docs/knowledge-base/`
  below).

## Tech stack

- **Frontend:** React 19 + Vite, React Router v7. No CSS framework — a
  single hand-written stylesheet with theme variables for light/dark mode.
- **Backend:** [Supabase](https://supabase.com) — Postgres (RLS-scoped to
  `auth.uid()` on every table), Auth (served from a custom domain,
  `auth.jobsearch365.com`, via Supabase's custom domain feature), Storage
  (avatars, documents), and Edge Functions (Deno) for account deletion,
  email-change notifications, and several LLM-backed features (job import,
  CV import, cover letter drafting, CV building, email-to-job matching).
- **AI:** [Amazon Bedrock](https://aws.amazon.com/bedrock/) (NVIDIA Nemotron
  3 Super, `eu-west-2`/London, for UK/EU data residency) for job-listing
  extraction, CV import extraction, cover letter drafting, CV building, and
  email-to-job matching — via Bedrock's OpenAI-compatible Chat Completions
  endpoint, authenticated with a long-term Bedrock API key rather than
  AWS-signed requests (many small, targeted calls per operation rather
  than one large one, run concurrently under a shared limiter). PDF
  text/layout extraction via [`unpdf`](https://github.com/unjs/unpdf); PDF
  generation via [`jsPDF`](https://github.com/parallax/jsPDF).
- **Gmail:** OAuth 2.0 (read-only `gmail.readonly` scope) + the Gmail API,
  called directly via `fetch()` rather than a client library.
- **Email:** [Resend](https://resend.com) via custom SMTP, triggered
  partly by a Postgres trigger + `pg_net` calling an Edge Function
  directly from the database.
- **Hosting:** [Cloudflare Pages](https://pages.cloudflare.com/), deployed
  automatically on push via Git integration. Deploys go through Wrangler's
  unified Workers-with-Assets path (`wrangler.jsonc` at the repo root) —
  see [Deployment](#deployment).

## Project structure

```
src/
  pages/          Route-level pages (Home, Welcome, ManageJobs, JobDetail,
                  AddJob, Documents, CvComponents, Settings, EditProfile,
                  Landing, Signup, ...)
  components/     Reusable UI: dialogs (Add event, Filter, Sort, Connect
                  document, Add job / import from URL, Suggest cover
                  letter, Build CV, Import CV, Experience/Education/
                  Certification/Custom section, ...), JobCard, LoadingBar,
                  form fields, layout chrome (nav, footer, chat widget host)
  cvTemplates/    The CV rendering engine — renderCvPdf.js (generic,
                  config-driven PDF renderer) and templates.js (per-template
                  layout/palette/font data; adding a template needs no
                  renderer changes)
  jobFormat.js    Shared job formatting/constants (labels, column list,
                  event-progression rules, CV date-range formatting)
  jobFilters.js   Filter option derivation + predicate logic
  jobSort.js      Multi-level sort logic
  jobEvents.js    Event-logging side effects (status recalculation, auto
                  close/reopen)
  onboarding.js   Shared "is profile/CV-library/first-job complete" checks,
                  used by both the session-start redirect and the welcome
                  screen's live checklist
  fileNaming.js   Sanitized, consistent filenames for generated documents
  theme.js        Light/dark/system theme persistence
  supabaseClient.js
supabase/
  functions/      Edge Functions — delete-account, notify-email-changed,
                  import-job-listing, import-cv, generate-cover-letter,
                  build-cv, gmail-oauth-callback, gmail-disconnect,
                  scan-gmail-inbox
  config.toml     Local Supabase CLI config
docs/
  knowledge-base/ Standalone how-to documents (one per app function),
                  written for embedding in a RAG vector store — not
                  imported or referenced by the app itself. Each document
                  is self-contained (no cross-document links), since
                  neither the RAG agent nor the end user browsing chat
                  answers has access to the file tree.
wrangler.jsonc    Cloudflare Workers-with-Assets deploy config — see
                  Deployment
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

The AI-backed Edge Functions (`import-job-listing`, `import-cv`,
`generate-cover-letter`, `build-cv`, `scan-gmail-inbox`) need a
`BEDROCK_API_KEY` (a long-term Amazon Bedrock API key) — this is a
**Supabase Edge Function secret**, not a Vite/frontend env var, so it
never goes in `.env`. Set it with `supabase secrets set
BEDROCK_API_KEY=...` for a deployed project, or in a local, gitignored
`supabase/.env` for `supabase functions serve`.

Gmail inbox scanning additionally needs a Google Cloud OAuth 2.0 Client
(Web application, `gmail.readonly` scope, authorized redirect URI
`<your origin>/inbox/callback`). The Client ID is not secret and goes in
`VITE_GOOGLE_CLIENT_ID` above; the Client Secret is a Supabase Edge
Function secret (`GOOGLE_CLIENT_SECRET`), same pattern as
`BEDROCK_API_KEY`. While the Google OAuth consent screen is in "Testing"
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

Deploys automatically to Cloudflare Pages on push to `main`, via
`npx wrangler versions upload` (Cloudflare's unified Workers-with-Assets
deploy path — plain static-Pages deploys without a Wrangler config are no
longer sufficient). `wrangler.jsonc` at the repo root is required for this
to work at all:

```jsonc
{
  "name": "job-search-365",
  "compatibility_date": "2026-09-10",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

`not_found_handling: "single-page-application"` is what makes deep links
and page refreshes (e.g. `/jobs/123`) resolve correctly instead of 404ing —
without it, only paths matching an actual file in `dist/` would resolve,
since this deploy path doesn't auto-detect an SPA and fall back to
`index.html` the way classic Pages hosting did.

Build environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
are configured in the Cloudflare Pages project settings rather than
committed to the repo. `VITE_SUPABASE_URL` points at a custom domain
(`auth.jobsearch365.com`, set up via Supabase's Custom Domains feature)
rather than the default `*.supabase.co` URL — the original project URL
still works in parallel if ever needed.

## License

All rights reserved — see [LICENSE](./LICENSE). This repository is public
for portfolio purposes only; it is not licensed for reuse.
