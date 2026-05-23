// Shared status helpers used across tasks, sprints, projects, and reports.
// isDoneStatus stays in tasks/service (domain owner); this module only aggregates.

function statusBreakdown(tasks) {
  const counts = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return counts;
}

module.exports = { statusBreakdown };
