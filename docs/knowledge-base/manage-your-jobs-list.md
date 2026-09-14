# Manage Your Jobs List

The Manage jobs page (`/jobs`, or **Jobs → Manage jobs**) lists every open job. **Jobs → View closed jobs** (`/jobs/closed`) shows the same view scoped to jobs you've closed.

## Searching

Type into the search box (placeholder: "Search title, employer, location, description, notes…") — it searches across all of those fields, with a short delay after you stop typing. If your search matches jobs in the *other* list (e.g. you're on the open list but your search only matches closed jobs), a link appears: "{N} more match in closed jobs" (or "open jobs") to jump straight there.

## Filtering

Click **Filter by** (it shows a count once filters are active, e.g. "Filter by (2)") to open the filter dialog. Available filters:

- **Status** — checkboxes for every status currently in use among your jobs.
- **Salary (min)** — a minimum threshold, with an option to also include jobs that have no salary minimum stated.
- **Salary (max)** — same pattern.
- **Location type** — On-site / Hybrid / Remote / Not specified.
- **Location** — a multi-select built from the actual locations you've entered.
- **Employment type** — Full time / Part time / Not specified.

Click **Apply** to apply them, **Clear all** to reset, or **Cancel** to close without changing anything. Active filters show as removable chips above the list.

## Sorting

Click **Sort by** to add up to three sort levels (it disables itself once you've added three, with a tooltip: "Maximum 3 sort levels reached"). For each level, choose a field — **Status**, **Date logged**, **Last updated**, **Last status update**, **Salary (min)**, or **Salary (max)** — and a direction, **Ascending** or **Descending**. Active sort levels show as removable, numbered chips (with ▲/▼ showing direction).

If you haven't set any sort, jobs are ordered by favorite level first (Favorite, then Preferred, then unmarked), then by date logged, newest first.

## Actions on each job

- Click the job title to open its detail page.
- **Close** — closes the job (moves it to the closed list). No confirmation needed.
- **Reopen** — (on the closed list) reopens it.
- **Delete** — permanently deletes the job, after confirming "Delete '{title}' at '{employer}'? This can't be undone."
