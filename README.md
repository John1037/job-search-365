# Job Search 365

A full-stack job application tracker — built to replace a spreadsheet for
managing an active job search: every application, its status pipeline,
key dates, documents, and notes in one place.

Live at [jobsearch365.com](https://jobsearch365.com).

## Features

- **Job pipeline tracking** — log a job as soon as it's of interest, then
  record events as they happen (Applied, Application acknowledged,
  Interview scheduled/completed, Offer received, etc.). Status is derived
  from the event history, not set by hand, and recalculates automatically
  if an event is deleted.
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
  Edge Functions (Deno) for account deletion and email-change
  notifications.
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
                  document, ...), JobCard, form fields, layout chrome
  jobFormat.js    Shared job formatting/constants (labels, column list)
  jobFilters.js   Filter option derivation + predicate logic
  jobSort.js      Multi-level sort logic
  supabaseClient.js
supabase/
  functions/      Edge Functions (delete-account, notify-email-changed)
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
