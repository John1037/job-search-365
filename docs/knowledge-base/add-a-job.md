# Add a Job

## Starting the add-a-job flow

From the **Jobs** menu in the top nav, click **Add a job** (or click the **Add a job** button on the Manage jobs page). A dialog opens asking "How would you like to add this job?" with two choices:

- **Add manually** — fill in the details yourself.
- **Import from a URL** — paste a link to the job posting and let the app extract the details.

## Importing from a URL

1. Click **Import from a URL**.
2. Paste the job posting link into **Job posting URL**.
3. Click **Import** (shows "Importing…" while it works).
4. On success you're taken straight to that job's detail page, already filled in with whatever could be extracted (title, employer, salary, employment type, location, description, etc. — missing fields are just left blank/unspecified).

Click **Back** to return to the manual/import choice, or **Cancel** to close the dialog entirely.

## Adding manually

Clicking **Add manually** takes you to a form with these fields:

- **Job title** * and **Employer** * — required; these two are the only required fields.
- **Salary (min)** and **Salary (max)** — each with its own currency selector (defaults to GBP).
- **Salary type** — Not specified / Annual / Monthly / Weekly / Hourly.
- **Salary basis** — Not specified / Flat - stated / Flat - estimated / OTE - stated.
- **Employment type** — Not specified / Full time / Part time. Choosing Part time reveals an **Hours per week** field.
- **Location type** — Not specified / On-site / Hybrid / Remote. Choosing anything other than Remote (and not leaving it unset) reveals a **Location** field.

Click **Add job** to save (shows "Saving…"), or **Cancel** to abandon and return to the dashboard.

If you submit without a job title or employer, you'll see: "Missing required fields — Job title and Employer are both required before you can add this job."

On success, you're taken to the **Manage jobs** list (note: this differs from the URL-import flow, which lands you directly on the new job's detail page instead).

## After adding

Every newly added job — by either method — starts at status **Interested**. From there, its status only moves forward by logging an event on the job's own detail page (for example logging "Applied" moves it to Applied) — there's no separate status dropdown. All of a job's other details (salary, description, notes, contact person, and so on) are also edited from that same detail page.
