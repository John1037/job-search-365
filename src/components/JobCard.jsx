import { Link } from 'react-router-dom';
import { formatSalary, formatLocation } from '../jobFormat';

function JobCard({ job, children }) {
  const salary = formatSalary(job);
  const location = formatLocation(job);

  return (
    <li className="job-card">
      <div className="job-card-top">
        <div className="job-card-title-row">
          <Link to={`/jobs/${job.id}`} className="job-card-title">
            {job.job_title}
          </Link>
          {job.favorite_level != null && (
            <span
              className="job-card-favorite-stars"
              aria-label={
                job.favorite_level === 2 ? 'Marked Favorite' : 'Marked Preferred'
              }
            >
              {'★'.repeat(job.favorite_level)}
            </span>
          )}
        </div>

        <span className="item-name">
          <span className="item-subtext">{job.employer}</span>
          {(salary || location) && (
            <span className="item-subtext">
              {[salary, location].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </div>

      <div className="job-card-actions">
        <span className="item-badge">{job.status}</span>
        <div className="item-actions">{children}</div>
      </div>
    </li>
  );
}

export default JobCard;
