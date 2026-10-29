import { Link } from 'react-router-dom';
import { formatSalary, formatLocation, statusBadgeClass } from '../jobFormat';
import MatchRatingBadge from './MatchRatingBadge';

function JobCard({ job, children }) {
  const salary = formatSalary(job, { includeBasis: false });
  const location = formatLocation(job);
  const salaryLocation = [salary, location].filter(Boolean).join(' · ');

  return (
    <li className="job-card">
      <div className="job-card-top">
        <div className="job-card-title-row">
          <Link to={`/jobs/${job.id}`} className="job-card-title">
            {job.job_title}
          </Link>
          <MatchRatingBadge score={job.match_score} size="card" />
        </div>

        <span className="item-name">
          <span className="item-subtext">{job.employer}</span>
          {(salaryLocation || job.favorite_level != null) && (
            <span className="item-subtext job-card-salary-row">
              <span className="job-card-salary-text">{salaryLocation}</span>
              {job.favorite_level != null && (
                <span
                  className="job-card-favorite-stars"
                  aria-label={
                    job.favorite_level === 2
                      ? 'Marked Favorite'
                      : 'Marked Preferred'
                  }
                >
                  {'★'.repeat(job.favorite_level)}
                </span>
              )}
            </span>
          )}
        </span>
      </div>

      <div className="job-card-actions">
        <span className={`item-badge ${statusBadgeClass(job.status)}`}>
          {job.status}
        </span>
        <div className="item-actions">{children}</div>
      </div>
    </li>
  );
}

export default JobCard;
