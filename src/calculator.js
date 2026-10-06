'use strict';

/**
 * PURE pricing engine that faithfully reproduces the
 * "MASTER - LOCATION LD CALCULATOR" long-distance moving quote spreadsheet.
 *
 * No I/O, no side effects: calculateQuote(input) -> result object.
 * All rates, constants and valuation tables come from config/rates.json
 * (see src/config.js) so the math stays tunable without touching code.
 */

const { loadConfig } = require('./config');

/** Round a currency amount to whole cents. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function requireFiniteNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`"${name}" must be a finite number (got ${JSON.stringify(value)})`);
  }
  return n;
}

function requireInt(value, name) {
  const n = requireFiniteNumber(value, name);
  if (!Number.isInteger(n)) {
    throw new Error(`"${name}" must be a whole number (got ${JSON.stringify(value)})`);
  }
  return n;
}

/**
 * Look up the valuation adjustment (a NEGATIVE number, or 0 for Full Value).
 *
 * Quirk/decision (documented in README): this uses THIS quote's own weightLbs.
 * The source spreadsheet had a cross-tab coupling bug that pulled weight from a
 * different tab; here each quote is self-contained.
 */
function lookupValuationAdjustment(valuation, cubes, config) {
  const table = config.valuations[valuation];
  if (!table) {
    throw new Error(`Unknown valuation "${valuation}"`);
  }
  // Full Value (empty table) => no adjustment.
  if (table.length === 0) {
    return 0;
  }
  for (const bracket of table) {
    if (bracket.under === undefined) {
      // Fallback bracket (the ">=" top tier).
      return bracket.value;
    }
    if (cubes < bracket.under) {
      return bracket.value;
    }
  }
  // Should be unreachable when a fallback bracket exists; be defensive.
  return table[table.length - 1].value;
}

/**
 * Tiered overnight rate, driven by the TRAVEL crew size:
 *   <=2 => 250; <=4 => 500; <=6 => 750; <=8 => 1000; <=10 => 1250; else throw.
 * Equivalent to baseOvernight * ceil(travelMovers / 2), capped at maxTravelMovers.
 */
function overnightRateFor(travelMovers, config) {
  const { baseOvernight, maxTravelMovers } = config.constants;
  if (travelMovers > maxTravelMovers) {
    throw new Error(
      `travelMovers (${travelMovers}) exceeds the maximum of ${maxTravelMovers}; ` +
        `no overnight tier is defined`
    );
  }
  return baseOvernight * Math.ceil(travelMovers / 2);
}

/**
 * @param {object} input
 * @param {string} input.location
 * @param {string} input.weightClass            "Over 6000lbs" | "Under 6000lbs"
 * @param {number} [input.trucks=1]
 * @param {number} input.travelMovers
 * @param {number} input.laborMovers
 * @param {number} input.totalMiles             one-way miles
 * @param {number} [input.additionalDriveHours=0]
 * @param {number} input.loadUnloadHours
 * @param {number} input.weightLbs
 * @param {number} [input.additionalDays=0]
 * @param {string} [input.valuation="Full Value"]
 */
function calculateQuote(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('calculateQuote requires an input object');
  }
  const config = loadConfig();
  const { milesPerDay, billableHrsPerDay, cubesPerLb } = config.constants;

  // --- Validate categorical inputs ---------------------------------------
  const location = input.location;
  if (!config.locations[location]) {
    throw new Error(
      `Unknown location "${location}". Known: ${Object.keys(config.locations).join(', ')}`
    );
  }
  const weightClass = input.weightClass;
  if (!config.weightClasses.includes(weightClass)) {
    throw new Error(
      `Unknown weightClass "${weightClass}". Known: ${config.weightClasses.join(', ')}`
    );
  }
  const valuation = input.valuation === undefined ? 'Full Value' : input.valuation;
  if (!config.valuations[valuation]) {
    throw new Error(
      `Unknown valuation "${valuation}". Known: ${Object.keys(config.valuations).join(', ')}`
    );
  }

  // --- Validate numeric inputs -------------------------------------------
  const trucks = input.trucks === undefined ? 1 : requireInt(input.trucks, 'trucks');
  const travelMovers = requireInt(input.travelMovers, 'travelMovers');
  const laborMovers = requireInt(input.laborMovers, 'laborMovers');
  const totalMiles = requireFiniteNumber(input.totalMiles, 'totalMiles');
  const additionalDriveHours =
    input.additionalDriveHours === undefined
      ? 0
      : requireFiniteNumber(input.additionalDriveHours, 'additionalDriveHours');
  const loadUnloadHours = requireFiniteNumber(input.loadUnloadHours, 'loadUnloadHours');
  const weightLbs = requireFiniteNumber(input.weightLbs, 'weightLbs');
  const additionalDays =
    input.additionalDays === undefined ? 0 : requireInt(input.additionalDays, 'additionalDays');

  if (trucks < 1) throw new Error('"trucks" must be >= 1');
  if (travelMovers < 1) throw new Error('"travelMovers" must be >= 1');
  if (laborMovers < 1) throw new Error('"laborMovers" must be >= 1');
  if (totalMiles <= 0) throw new Error('"totalMiles" must be > 0');
  if (additionalDriveHours < 0) throw new Error('"additionalDriveHours" must be >= 0');
  if (loadUnloadHours < 0) throw new Error('"loadUnloadHours" must be >= 0');
  if (weightLbs <= 0) throw new Error('"weightLbs" must be > 0');
  if (additionalDays < 0) throw new Error('"additionalDays" must be >= 0');

  // --- Rate card ----------------------------------------------------------
  const card = config.locations[location][weightClass];
  const { truckRate, manRate } = card;

  const truckCost = truckRate * trucks;
  const travelMoverCost = manRate * travelMovers;
  const laborMoverCost = manRate * laborMovers;

  // --- Core formula chain (reproduces the spreadsheet) --------------------
  const driveHrs = (totalMiles / milesPerDay) * billableHrsPerDay + additionalDriveHours;
  const driveCost = driveHrs * (travelMoverCost + truckCost);
  const loadUnloadCost = (laborMoverCost + truckCost) * loadUnloadHours;

  const daysOnSchedule = Math.ceil((driveHrs + loadUnloadHours) / billableHrsPerDay);
  const totalDays = additionalDays + daysOnSchedule;

  const overnightRate = overnightRateFor(travelMovers, config);
  // (totalDays - 1) nights.
  const overnightCost = totalDays * overnightRate - overnightRate;

  const cubes = weightLbs * cubesPerLb;
  const valuationAdjustment = lookupValuationAdjustment(valuation, cubes, config);

  const total = driveCost + loadUnloadCost + overnightCost + valuationAdjustment;

  const lineItems = [
    { label: 'Drive Cost', amount: round2(driveCost) },
    { label: 'Load / Unload Cost', amount: round2(loadUnloadCost) },
    { label: 'Overnight Cost', amount: round2(overnightCost) },
  ];
  if (valuation !== 'Full Value') {
    lineItems.push({
      label: `Valuation Adjustment (${valuation})`,
      amount: round2(valuationAdjustment),
    });
  }

  return {
    inputs: {
      location,
      weightClass,
      trucks,
      travelMovers,
      laborMovers,
      totalMiles,
      additionalDriveHours,
      loadUnloadHours,
      weightLbs,
      additionalDays,
      valuation,
    },
    rateCard: { truckRate, manRate },
    cubes,
    driveHrs: round2(driveHrs),
    daysOnSchedule,
    totalDays,
    overnightRate,
    lineItems,
    valuationAdjustment: round2(valuationAdjustment),
    total: round2(total),
  };
}

module.exports = {
  calculateQuote,
  lookupValuationAdjustment,
  overnightRateFor,
  round2,
};
