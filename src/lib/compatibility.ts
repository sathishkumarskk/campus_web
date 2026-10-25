import type { Profile, StudentPreferences } from '../types/database';

export interface CompatibilityFactor {
  key: 'diet' | 'smoking_alcohol' | 'sleep_study' | 'cleanliness' | 'budget' | 'guests' | 'campus_city';
  label: string;
  earnedPoints: number;
  maxPoints: number;
  status: 'exact' | 'partial' | 'mismatch';
  viewerValueLabel: string;
  candidateValueLabel: string;
  explanation: string;
}

export interface CompatibilityBreakdown {
  score: number; // Deterministic integer 0..100
  matchedFactorsCount: number;
  totalFactorsCount: number;
  factors: CompatibilityFactor[];
  highlights: string[];
  differences: string[];
}

const DIET_LABELS: Record<StudentPreferences['diet'], string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  eggetarian: 'Eggetarian',
  non_vegetarian: 'Non-Vegetarian',
};

const SLEEP_LABELS: Record<StudentPreferences['sleep_schedule'], string> = {
  early_riser: 'Early Riser',
  night_owl: 'Night Owl',
  flexible: 'Flexible Hours',
};

const CLEAN_LABELS: Record<StudentPreferences['cleanliness'], string> = {
  very_tidy: 'Very Clean & Tidy',
  tidy: 'Moderately Tidy',
  relaxed: 'Relaxed',
};

const SMOKE_LABELS: Record<StudentPreferences['smoking'], string> = {
  no: 'Non-smoker',
  outside_only: 'Outside only',
  yes: 'Smoker',
};

const ALCOHOL_LABELS: Record<StudentPreferences['alcohol'], string> = {
  no: 'No alcohol',
  socially: 'Social',
  yes: 'Regular',
};

const STUDY_LABELS: Record<StudentPreferences['study_habit'], string> = {
  quiet_hours: 'Quiet study hours',
  library_studier: 'Studies at library',
  collaborative: 'Group study friendly',
  flexible: 'Flexible study routine',
};

const GUEST_LABELS: Record<StudentPreferences['guest_policy'], string> = {
  no_overnight: 'No overnight guests',
  occasional: 'Occasional daytime guests',
  weekends_ok: 'Weekend guests OK',
  open: 'Open guest policy',
};

/**
 * Transparent, deterministic 100-point FlatMate compatibility engine:
 * 1. Dietary Alignment: 20 pts
 * 2. Smoking & Alcohol Habits: 20 pts
 * 3. Sleep & Study Routine: 15 pts
 * 4. Cleanliness Standard: 15 pts
 * 5. Monthly Budget Overlap: 15 pts
 * 6. Guest Policy: 10 pts
 * 7. City & College Commute Alignment: 5 pts
 */
export function calculateFlatmateCompatibility(
  viewerPrefs: StudentPreferences,
  viewerProfile: Pick<Profile, 'city' | 'college_name'>,
  candidatePrefs: StudentPreferences,
  candidateProfile: Pick<Profile, 'city' | 'college_name'>
): CompatibilityBreakdown {
  const factors: CompatibilityFactor[] = [];

  // 1. Dietary Alignment (20 pts)
  const vDiet = viewerPrefs.diet;
  const cDiet = candidatePrefs.diet;
  let dietPts = 0;
  let dietStatus: CompatibilityFactor['status'] = 'mismatch';
  if (vDiet === cDiet) {
    dietPts = 20;
    dietStatus = 'exact';
  } else if (
    (vDiet === 'vegan' && cDiet === 'vegetarian') ||
    (vDiet === 'vegetarian' && cDiet === 'vegan') ||
    (vDiet === 'vegetarian' && cDiet === 'eggetarian') ||
    (vDiet === 'eggetarian' && cDiet === 'vegetarian') ||
    (vDiet === 'eggetarian' && cDiet === 'non_vegetarian') ||
    (vDiet === 'non_vegetarian' && cDiet === 'eggetarian')
  ) {
    dietPts = 12;
    dietStatus = 'partial';
  } else {
    dietPts = 4;
    dietStatus = 'mismatch';
  }
  factors.push({
    key: 'diet',
    label: 'Diet & Kitchen',
    earnedPoints: dietPts,
    maxPoints: 20,
    status: dietStatus,
    viewerValueLabel: DIET_LABELS[vDiet],
    candidateValueLabel: DIET_LABELS[cDiet],
    explanation:
      dietStatus === 'exact'
        ? `${DIET_LABELS[cDiet]} (Exact Match)`
        : `${DIET_LABELS[cDiet]} vs your ${DIET_LABELS[vDiet]}`,
  });

  // 2. Smoking & Alcohol (20 pts: 12 smoking + 8 alcohol)
  let smokePts = 0;
  if (viewerPrefs.smoking === candidatePrefs.smoking) {
    smokePts = 12;
  } else if (
    viewerPrefs.smoking !== 'no' &&
    candidatePrefs.smoking !== 'no'
  ) {
    smokePts = 8;
  } else if (candidatePrefs.smoking === 'outside_only' || viewerPrefs.smoking === 'outside_only') {
    smokePts = 5;
  }

  let alcoholPts = 0;
  if (viewerPrefs.alcohol === candidatePrefs.alcohol) {
    alcoholPts = 8;
  } else if (
    (viewerPrefs.alcohol === 'socially' && candidatePrefs.alcohol === 'no') ||
    (viewerPrefs.alcohol === 'no' && candidatePrefs.alcohol === 'socially') ||
    (viewerPrefs.alcohol === 'socially' && candidatePrefs.alcohol === 'yes') ||
    (viewerPrefs.alcohol === 'yes' && candidatePrefs.alcohol === 'socially')
  ) {
    alcoholPts = 4;
  }

  const habitPts = smokePts + alcoholPts;
  const habitStatus: CompatibilityFactor['status'] =
    habitPts >= 18 ? 'exact' : habitPts >= 10 ? 'partial' : 'mismatch';
  factors.push({
    key: 'smoking_alcohol',
    label: 'Smoking & Lifestyle',
    earnedPoints: habitPts,
    maxPoints: 20,
    status: habitStatus,
    viewerValueLabel: `${SMOKE_LABELS[viewerPrefs.smoking]}, ${ALCOHOL_LABELS[viewerPrefs.alcohol]}`,
    candidateValueLabel: `${SMOKE_LABELS[candidatePrefs.smoking]}, ${ALCOHOL_LABELS[candidatePrefs.alcohol]}`,
    explanation:
      habitStatus === 'exact'
        ? `${SMOKE_LABELS[candidatePrefs.smoking]} (Match)`
        : `${SMOKE_LABELS[candidatePrefs.smoking]} • ${ALCOHOL_LABELS[candidatePrefs.alcohol]}`,
  });

  // 3. Sleep & Study Routine (15 pts: 9 sleep + 6 study)
  let sleepPts = 2;
  if (viewerPrefs.sleep_schedule === candidatePrefs.sleep_schedule) {
    sleepPts = 9;
  } else if (
    viewerPrefs.sleep_schedule === 'flexible' ||
    candidatePrefs.sleep_schedule === 'flexible'
  ) {
    sleepPts = 6;
  }

  let studyPts = 2;
  if (viewerPrefs.study_habit === candidatePrefs.study_habit) {
    studyPts = 6;
  } else if (
    viewerPrefs.study_habit === 'flexible' ||
    candidatePrefs.study_habit === 'flexible' ||
    viewerPrefs.study_habit === 'library_studier' ||
    candidatePrefs.study_habit === 'library_studier'
  ) {
    studyPts = 4;
  }

  const routinePts = sleepPts + studyPts;
  const routineStatus: CompatibilityFactor['status'] =
    routinePts >= 13 ? 'exact' : routinePts >= 9 ? 'partial' : 'mismatch';
  factors.push({
    key: 'sleep_study',
    label: 'Sleep & Study Schedule',
    earnedPoints: routinePts,
    maxPoints: 15,
    status: routineStatus,
    viewerValueLabel: `${SLEEP_LABELS[viewerPrefs.sleep_schedule]} • ${STUDY_LABELS[viewerPrefs.study_habit]}`,
    candidateValueLabel: `${SLEEP_LABELS[candidatePrefs.sleep_schedule]} • ${STUDY_LABELS[candidatePrefs.study_habit]}`,
    explanation:
      routineStatus === 'exact'
        ? `${SLEEP_LABELS[candidatePrefs.sleep_schedule]} & ${STUDY_LABELS[candidatePrefs.study_habit]} (Match)`
        : `${SLEEP_LABELS[candidatePrefs.sleep_schedule]} vs ${SLEEP_LABELS[viewerPrefs.sleep_schedule]}`,
  });

  // 4. Cleanliness Standard (15 pts)
  const cleanOrder: Record<StudentPreferences['cleanliness'], number> = {
    very_tidy: 3,
    tidy: 2,
    relaxed: 1,
  };
  const cleanDiff = Math.abs(
    cleanOrder[viewerPrefs.cleanliness] - cleanOrder[candidatePrefs.cleanliness]
  );
  const cleanPts = cleanDiff === 0 ? 15 : cleanDiff === 1 ? 9 : 2;
  const cleanStatus: CompatibilityFactor['status'] =
    cleanDiff === 0 ? 'exact' : cleanDiff === 1 ? 'partial' : 'mismatch';
  factors.push({
    key: 'cleanliness',
    label: 'Cleanliness',
    earnedPoints: cleanPts,
    maxPoints: 15,
    status: cleanStatus,
    viewerValueLabel: CLEAN_LABELS[viewerPrefs.cleanliness],
    candidateValueLabel: CLEAN_LABELS[candidatePrefs.cleanliness],
    explanation:
      cleanStatus === 'exact'
        ? `${CLEAN_LABELS[candidatePrefs.cleanliness]} (Exact Match)`
        : `${CLEAN_LABELS[candidatePrefs.cleanliness]} vs your ${CLEAN_LABELS[viewerPrefs.cleanliness]}`,
  });

  // 5. Monthly Budget Overlap (15 pts)
  const overlapMin = Math.max(viewerPrefs.budget_min, candidatePrefs.budget_min);
  const overlapMax = Math.min(viewerPrefs.budget_max, candidatePrefs.budget_max);
  let budgetPts = 0;
  let budgetStatus: CompatibilityFactor['status'] = 'mismatch';
  if (overlapMax >= overlapMin) {
    budgetPts = 15;
    budgetStatus = 'exact';
  } else {
    const gap = overlapMin - overlapMax;
    if (gap <= 1500) {
      budgetPts = 9;
      budgetStatus = 'partial';
    } else if (gap <= 3000) {
      budgetPts = 4;
      budgetStatus = 'mismatch';
    }
  }
  factors.push({
    key: 'budget',
    label: 'Monthly Rent Budget',
    earnedPoints: budgetPts,
    maxPoints: 15,
    status: budgetStatus,
    viewerValueLabel: `₹${viewerPrefs.budget_min.toLocaleString('en-IN')}–₹${viewerPrefs.budget_max.toLocaleString('en-IN')}`,
    candidateValueLabel: `₹${candidatePrefs.budget_min.toLocaleString('en-IN')}–₹${candidatePrefs.budget_max.toLocaleString('en-IN')}`,
    explanation:
      budgetStatus === 'exact'
        ? `Overlapping budget (₹${overlapMin.toLocaleString('en-IN')}–₹${overlapMax.toLocaleString('en-IN')}/mo)`
        : `Candidate budget ₹${candidatePrefs.budget_min.toLocaleString('en-IN')}–₹${candidatePrefs.budget_max.toLocaleString('en-IN')}/mo`,
  });

  // 6. Guest Policy (10 pts)
  const guestOrder: Record<StudentPreferences['guest_policy'], number> = {
    no_overnight: 1,
    occasional: 2,
    weekends_ok: 3,
    open: 4,
  };
  const guestDiff = Math.abs(
    guestOrder[viewerPrefs.guest_policy] - guestOrder[candidatePrefs.guest_policy]
  );
  const guestPts = guestDiff === 0 ? 10 : guestDiff === 1 ? 7 : guestDiff === 2 ? 3 : 0;
  const guestStatus: CompatibilityFactor['status'] =
    guestDiff === 0 ? 'exact' : guestDiff === 1 ? 'partial' : 'mismatch';
  factors.push({
    key: 'guests',
    label: 'Guest Policy',
    earnedPoints: guestPts,
    maxPoints: 10,
    status: guestStatus,
    viewerValueLabel: GUEST_LABELS[viewerPrefs.guest_policy],
    candidateValueLabel: GUEST_LABELS[candidatePrefs.guest_policy],
    explanation:
      guestStatus === 'exact'
        ? `${GUEST_LABELS[candidatePrefs.guest_policy]} (Exact Match)`
        : `${GUEST_LABELS[candidatePrefs.guest_policy]} vs ${GUEST_LABELS[viewerPrefs.guest_policy]}`,
  });

  // 7. Campus & City Alignment (5 pts)
  const sameCity =
    (viewerPrefs.preferred_city || viewerProfile.city).trim().toLowerCase() ===
    (candidatePrefs.preferred_city || candidateProfile.city).trim().toLowerCase();
  const sameCollege =
    Boolean(viewerProfile.college_name?.trim()) &&
    viewerProfile.college_name.trim().toLowerCase() ===
      candidateProfile.college_name?.trim().toLowerCase();

  const geoPts = sameCollege ? 5 : sameCity ? 3 : 0;
  const geoStatus: CompatibilityFactor['status'] =
    sameCollege ? 'exact' : sameCity ? 'partial' : 'mismatch';
  factors.push({
    key: 'campus_city',
    label: 'Campus & City',
    earnedPoints: geoPts,
    maxPoints: 5,
    status: geoStatus,
    viewerValueLabel: `${viewerProfile.college_name || 'Campus'} (${viewerPrefs.preferred_city || viewerProfile.city})`,
    candidateValueLabel: `${candidateProfile.college_name || 'Campus'} (${candidatePrefs.preferred_city || candidateProfile.city})`,
    explanation: sameCollege
      ? `Same college (${candidateProfile.college_name})`
      : sameCity
        ? `Same city (${candidatePrefs.preferred_city || candidateProfile.city})`
        : `Different city (${candidatePrefs.preferred_city || candidateProfile.city})`,
  });

  const totalEarned = factors.reduce((acc, f) => acc + f.earnedPoints, 0);
  const score = Math.max(0, Math.min(100, Math.round(totalEarned)));

  const matchedFactorsCount = factors.filter((f) => f.status === 'exact').length;
  const highlights = factors
    .filter((f) => f.status === 'exact' || f.status === 'partial')
    .map((f) => f.explanation);
  const differences = factors
    .filter((f) => f.status === 'mismatch')
    .map((f) => f.explanation);

  return {
    score,
    matchedFactorsCount,
    totalFactorsCount: factors.length,
    factors,
    highlights,
    differences,
  };
}

export const PREFERENCE_LABELS = {
  diet: DIET_LABELS,
  sleep: SLEEP_LABELS,
  cleanliness: CLEAN_LABELS,
  smoking: SMOKE_LABELS,
  alcohol: ALCOHOL_LABELS,
  study: STUDY_LABELS,
  guests: GUEST_LABELS,
};
