function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function calculateNextReview({ easeFactor, intervalDays, repetitions, quality }) {
  // quality: 0-5 (0-2 = fail/reset, 3-5 = pass with increasing confidence)
  // Returns { easeFactor, intervalDays, repetitions, nextReviewAt }
  
  if (quality < 3) {
    return { 
      easeFactor, 
      intervalDays: 1, 
      repetitions: 0, 
      nextReviewAt: addDays(new Date(), 1) 
    };
  }
  
  const newEase = Math.max(1.3, 
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  
  let newInterval;
  if (repetitions === 0) newInterval = 1;
  else if (repetitions === 1) newInterval = 6;
  else newInterval = Math.round(intervalDays * newEase);
  
  return {
    easeFactor: newEase,
    intervalDays: newInterval,
    repetitions: repetitions + 1,
    nextReviewAt: addDays(new Date(), newInterval)
  };
}

module.exports = {
  calculateNextReview,
  addDays
};
