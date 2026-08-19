import { Link } from 'react-router-dom';
import { formatSalary, formatLocation } from '../jobFormat';

function JobListItem({ job, children }) {
  const salary = formatSalary(job);
  const location = formatLocation(job);

  return (
    <li className="item-row job-list-item">
      <div className="job-list-item-top">
        <span className="item-name">
          <Link
            to={`/jobs/${job.id}`}
            className="item-name-primary item-name-link"
          >
            {job.job_title}
          </Link>
          <span className="item-subtext">{job.employer}</span>
          {(salary || location) && (
            <span className="item-subtext">
              {[salary, location].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span className="item-badge">{job.status}</span>
      </div>
      {children && <div className="item-actions">{children}</div>}
    </li>
  );
}

export default JobListItem;
