const { calculateNextReview } = require('./sm2');

describe('SM-2 Algorithm', () => {
  it('resets repetitions to 0 and interval to 1 on a fail (quality < 3)', () => {
    const initialState = { easeFactor: 2.5, intervalDays: 10, repetitions: 5, quality: 2 };
    const result = calculateNextReview(initialState);
    
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.5); // Ease factor remains unchanged on fail
  });

  it('grows the interval on three consecutive passes (quality >= 3)', () => {
    // First pass
    const state1 = calculateNextReview({ easeFactor: 2.5, intervalDays: 0, repetitions: 0, quality: 4 });
    expect(state1.repetitions).toBe(1);
    expect(state1.intervalDays).toBe(1);
    
    // Second pass
    const state2 = calculateNextReview({ easeFactor: state1.easeFactor, intervalDays: state1.intervalDays, repetitions: state1.repetitions, quality: 4 });
    expect(state2.repetitions).toBe(2);
    expect(state2.intervalDays).toBe(6);
    
    // Third pass
    const state3 = calculateNextReview({ easeFactor: state2.easeFactor, intervalDays: state2.intervalDays, repetitions: state2.repetitions, quality: 4 });
    expect(state3.repetitions).toBe(3);
    expect(state3.intervalDays).toBeGreaterThan(6);
  });

  it('ensures easeFactor never drops below 1.3', () => {
    // Drop ease factor significantly by repeatedly getting quality 3
    let currentState = { easeFactor: 1.4, intervalDays: 1, repetitions: 1, quality: 3 };
    const result = calculateNextReview(currentState);
    
    expect(result.easeFactor).toBe(1.3);
    
    const nextResult = calculateNextReview({ ...result, quality: 3 });
    expect(nextResult.easeFactor).toBe(1.3);
  });
});
