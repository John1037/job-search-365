// A small colored circle showing a 0-100 CV-fit score. Color is a
// continuous hue ramp (red -> orange -> yellow -> green), not fixed
// breakpoints, so it reads as a smooth scale rather than hard bands.
function scoreToColor(score) {
  const hue = (Math.max(0, Math.min(100, score)) / 100) * 120;
  return `hsl(${hue}, 70%, 45%)`;
}

function MatchRatingBadge({ score, size = 'card' }) {
  if (score == null) return null;

  return (
    <span
      className={`match-rating-badge match-rating-badge-${size}`}
      style={{ borderColor: scoreToColor(score) }}
      aria-label={`CV match rating: ${score} out of 100`}
      title={`CV match rating: ${score}/100`}
    >
      {score}
    </span>
  );
}

export default MatchRatingBadge;
