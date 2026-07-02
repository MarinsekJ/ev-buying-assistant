import vehicles from '../data/vehicles.json';

const MILES_TO_KILOMETERS = 1.60934;
const DEFAULT_ANNUAL_INCOME = 85000;
const DEFAULT_RANGE_ANXIETY_SCORE = 4;
const DEFAULT_BATTERY_CONCERN_SCORE = 3;
const AVERAGE_EV_EFFICIENCY_KWH_PER_100KM = 18.5;

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeVehicle(vehicle) {
  return {
    brand: vehicle['Manufacturer Brand'],
    model: vehicle['Model Name'],
    baseMsrp: vehicle['Base MSRP price'],
    realWorldRangeKm: vehicle['Real-world battery range in kilometers'],
    efficiencyKwhPer100Km: vehicle['Efficiency Index in kilowatt-hours per 100 kilometers'],
    batteryWarrantyYears: vehicle['Manufacturer Battery Warranty in years'],
    maxDcFastChargingKw: vehicle['Maximum DC Fast Charging speed in kilowatts']
  };
}

function normalizePracticality(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function matchVehicles(userInputs = {}, modelPredictions = {}) {
  const annualIncome = finiteNumber(
    userInputs.annualIncome,
    userInputs.Annual_Income,
    userInputs.income
  ) ?? DEFAULT_ANNUAL_INCOME;

  const weeklyCommuteMiles = finiteNumber(
    userInputs.weeklyCommuteMiles,
    userInputs.Weekly_Commute_Miles
  );

  const dailyCommuteKm = finiteNumber(
    userInputs.dailyCommuteDistanceKm,
    userInputs.dailyCommuteKm,
    userInputs.Daily_Commute_Km
  ) ?? (
    finiteNumber(userInputs.dailyCommuteDistanceMiles, userInputs.dailyCommuteMiles) ??
    (weeklyCommuteMiles == null ? null : weeklyCommuteMiles / 5)
  ) * MILES_TO_KILOMETERS;

  const rangeAnxietyScore = Math.min(
    Math.max(
      finiteNumber(userInputs.rangeAnxietyScore, userInputs.Range_Anxiety_Score) ??
        (userInputs.infrastructureWarning ? 6 : DEFAULT_RANGE_ANXIETY_SCORE),
      0
    ),
    10
  );

  const batteryConcernScore = Math.min(
    Math.max(
      finiteNumber(
        userInputs.batteryReplacementConcern,
        userInputs.batteryConcernScore,
        userInputs.Battery_Replacement_Concern
      ) ?? DEFAULT_BATTERY_CONCERN_SCORE,
      0
    ),
    10
  );

  const annualSavings = finiteNumber(
    modelPredictions.Annual_Savings,
    modelPredictions.annual_savings,
    modelPredictions.annualSavings
  ) ?? 0;

  const practicalityRating = normalizePracticality(
    modelPredictions.Practicality_Rating ?? modelPredictions.practicality_rating
  );

  const infrastructureDensity = finiteNumber(
    userInputs.infrastructureDensity,
    userInputs.infrastructureDensityPer100k,
    modelPredictions.infrastructure_density_per_100k
  );

  const lowInfrastructure = Boolean(userInputs.infrastructureWarning) ||
    Boolean(modelPredictions.infrastructure_warning) ||
    (infrastructureDensity != null && infrastructureDensity < 15);

  const incomePriceCeiling = Math.max(32000, annualIncome * 0.7);
  const anxietyRangeMultiplier = 1.15 + rangeAnxietyScore * 0.08;
  const minimumRangeKm = Math.max(80, dailyCommuteKm * anxietyRangeMultiplier);
  const showBatteryWarranty = batteryConcernScore >= 7 || rangeAnxietyScore >= 8;

  return vehicles
    .map(normalizeVehicle)
    .filter(vehicle => vehicle.baseMsrp <= incomePriceCeiling)
    .filter(vehicle => vehicle.realWorldRangeKm >= minimumRangeKm)
    .map(vehicle => {
      const efficiencyAdvantage = AVERAGE_EV_EFFICIENCY_KWH_PER_100KM - vehicle.efficiencyKwhPer100Km;
      const efficiencySavingsBoost = Math.max(annualSavings, 0) / 1000 * efficiencyAdvantage * 4;
      const fastChargeBoost = lowInfrastructure ? vehicle.maxDcFastChargingKw / 10 : vehicle.maxDcFastChargingKw / 30;
      const affordabilityScore = (incomePriceCeiling - vehicle.baseMsrp) / incomePriceCeiling * 30;
      const rangeMarginScore = Math.min((vehicle.realWorldRangeKm - minimumRangeKm) / minimumRangeKm, 2) * 12;
      const practicalityScore = practicalityRating === 'practical' ? 8 : practicalityRating === 'challenging' ? -4 : 0;
      const valueScore = affordabilityScore + rangeMarginScore + efficiencySavingsBoost + fastChargeBoost + practicalityScore;
      const estimatedNetPurchasePrice = vehicle.baseMsrp;
      const estimatedBreakEvenYears = annualSavings > 0
        ? Number((estimatedNetPurchasePrice / annualSavings).toFixed(1))
        : null;

      return {
        ...vehicle,
        valueScore: Number(valueScore.toFixed(1)),
        estimatedNetPurchasePrice,
        estimatedBreakEvenYears,
        showBatteryWarranty
      };
    })
    .sort((left, right) => right.valueScore - left.valueScore);
}
