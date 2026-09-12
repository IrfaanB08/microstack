/**
 * A single macro's progress toward its daily target: a label, the
 * consumed/target numbers, and a bar that fills up as the day goes and
 * turns amber past 100% so over-target stands out at a glance.
 */
function MacroProgress({ label, unit, consumed, target, percentage }) {
  const clampedPercentage = percentage === null || percentage === undefined
    ? 0
    : Math.min(percentage, 100);
  const isOver = percentage !== null && percentage !== undefined && percentage > 100;

  return (
    <div className="macro-progress">
      <div className="macro-progress-header">
        <span className="macro-progress-label">{label}</span>
        <span className="macro-progress-values">
          {Math.round(consumed)}
          {target !== null && target !== undefined ? ` / ${Math.round(target)}` : ''}
          {unit}
        </span>
      </div>
      <div className="macro-progress-track">
        <div
          className={`macro-progress-fill${isOver ? ' macro-progress-fill--over' : ''}`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      {percentage !== null && percentage !== undefined && (
        <span className="macro-progress-percentage">{percentage}%</span>
      )}
    </div>
  );
}

export default MacroProgress;
