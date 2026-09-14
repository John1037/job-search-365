# Job Details and Status Updates

The job detail page (click any job title, or go to `/jobs/{id}`) is where you edit everything about a single job and track its progress.

## Editable fields

All of these are on one form, saved together with a single **Save details** button at the bottom (there's no per-field save):

- **Job title** *, **Employer** * (required)
- **Salary (min)** / **Salary (max)**, each with a currency selector
- **Salary type** — Annual / Monthly / Weekly / Hourly
- **Salary basis** — Not specified / Flat - stated / Flat - estimated / OTE - stated
- **Employment type** — Not specified / Full time / Part time (choosing Part time reveals **Hours per week**)
- **Employment duration** — free text (appears once Employment type is set; defaults to "Permanent")
- **Location type** — Not specified / On-site / Hybrid / Remote (choosing anything but Remote reveals **Location**)
- **Job description** — a larger text box; needed for the CV-building and cover-letter-suggestion features to work at all — both are disabled until a description is filled in here
- **Job posting URL** — with an "Open" link once filled in
- **Contact person**
- **Application method** — Not specified / Online - job search site / Online - direct / LinkedIn / Online - other / Online (legacy)
- **Notes** — freeform

Click **Save details**; you'll see "Details saved." when it completes.

## Status and events

There's no direct status dropdown — a job's status changes only by **logging an event**. Click **Add event** (top of the right-hand action column) and choose:

- **Event** — the list of events offered depends on the job's current status (you can't jump backwards; "Other" is always available). The full set of possible statuses/events is: Interested, Applied, Application acknowledged, Interview scheduled, Interview cancelled, Interview completed, Offer received, Offer accepted, Unsuccessful, Other.
- Depending on which event you pick, extra fields appear:
  - **Applied** → Application method, and a required Date.
  - **Application acknowledged** → an optional "Employer response date," with a hint that if you give one, the job will be automatically assumed unsuccessful and closed if nothing else is logged within 7 days of it.
  - **Interview scheduled / cancelled / completed** → a required Type (AI, Remote, In person), a required Date, and an optional Time.
  - **Other** → a free-text Details field.
  - **Offer received / Offer accepted / Unsuccessful** → no extra fields needed.

Click **Add event** to save it. The job's status updates to match the event you just logged, and a "Status updated {date}" line at the top of the page reflects it.

Logging an **Unsuccessful** event automatically closes the job. Deleting that event reopens it automatically.

## Deleting an event

Each logged event has its own **Delete** button, with a confirmation prompt ("Delete '{event name}'? This can't be undone."). Deleting an event recalculates the job's status back to whatever the next-most-recent remaining event is, or back to "Interested" if none are left.

## Other things done from this same page

The job's detail page is also where a job gets closed, reopened, or deleted; marked as Preferred or Favorite; connected to CV/cover-letter/certificate/other documents; and where a tailored CV or a suggested cover letter is generated for it.
