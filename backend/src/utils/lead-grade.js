'use strict';

/**
 * Lead-score → letter-grade banding.
 *
 * These thresholds were previously hardcoded (and duplicated) in
 * record.service.js and lead-scoring.service.js, so they could silently drift
 * apart. They now live in ONE place and accept an override so a tenant's
 * scoring configuration can supply its own bands (metadata-driven) without
 * touching call sites.
 *
 * A "band" is `{ grade, min }`; the highest band whose `min` the score meets
 * wins. Bands are evaluated highest-min first regardless of input order.
 */
const DEFAULT_GRADE_BANDS = [
  { grade: 'A', min: 80 },
  { grade: 'B', min: 60 },
  { grade: 'C', min: 40 },
  { grade: 'D', min: 20 },
  { grade: 'F', min: 0 },
];

/**
 * @param {number} totalScore
 * @param {Array<{grade:string,min:number}>} [bands] optional tenant override
 * @returns {string} letter grade
 */
function leadScoreGrade(totalScore, bands = DEFAULT_GRADE_BANDS) {
  const score = Number(totalScore) || 0;
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  for (const band of ordered) {
    if (score >= band.min) return band.grade;
  }
  return ordered[ordered.length - 1]?.grade ?? 'F';
}

/** The distinct grades a band set can produce, in descending order. */
function gradeLetters(bands = DEFAULT_GRADE_BANDS) {
  return [...bands].sort((a, b) => b.min - a.min).map((b) => b.grade);
}

module.exports = { DEFAULT_GRADE_BANDS, leadScoreGrade, gradeLetters };
