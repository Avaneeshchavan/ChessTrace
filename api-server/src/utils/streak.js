/**
 * Calculates the current streak of consecutive days with activity.
 * @param {Array<{createdAt: Date}>} logs - Array of activity log records containing a `createdAt` date.
 * @returns {number} The current streak in days.
 */
function calculateStreak(logs) {
  if (!logs || logs.length === 0) return 0;

  const activeDates = new Set(
    logs.map(log => log.createdAt.toISOString().split('T')[0])
  );

  let streak = 0;
  let currentDate = new Date();
  let currentStr = currentDate.toISOString().split('T')[0];
  
  // Allow the streak to start from today or yesterday
  if (!activeDates.has(currentStr)) {
    currentDate.setDate(currentDate.getDate() - 1);
    currentStr = currentDate.toISOString().split('T')[0];
  }

  if (activeDates.has(currentStr)) {
    while (activeDates.has(currentStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
      currentStr = currentDate.toISOString().split('T')[0];
    }
  }

  return streak;
}

module.exports = { calculateStreak };
