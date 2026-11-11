const profiles = Object.freeze({
  mvp: Object.freeze({
    minRating: 2300, maxPly: 60, occurrenceCap: 25,
    vectorMinPly: 10, vectorMaxPly: 60, annCandidateLimit: 1000,
    benchmarkRecallSubset: 5000, maxDbBytes: 700_000_000,
  }),
  scale: Object.freeze({
    minRating: 2100, maxPly: 160, occurrenceCap: 100,
    vectorMinPly: 6, vectorMaxPly: 160, annCandidateLimit: 1000,
    benchmarkRecallSubset: 20000, maxDbBytes: 50_000_000_000,
  }),
});

function storageProfile(name = process.env.STORAGE_PROFILE || 'mvp') {
  if (!Object.hasOwn(profiles, name)) throw new Error(`Unknown storage profile: ${name}`);
  return profiles[name];
}

module.exports = { storageProfile };
