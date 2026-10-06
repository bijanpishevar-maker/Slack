'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  calculateQuote,
  lookupValuationAdjustment,
  overnightRateFor,
} = require('../src/calculator');
const { loadConfig } = require('../src/config');

const config = loadConfig();

/** Assert two currency amounts are equal to the cent. */
function assertCents(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) < 0.005,
    `${msg || 'amount'}: expected ${expected}, got ${actual}`
  );
}

test('Fixture A — Salt Lake/Ogden, Under 6000lbs, Full Value', () => {
  const r = calculateQuote({
    location: 'Salt Lake/Ogden',
    weightClass: 'Under 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 3953,
    additionalDriveHours: 0,
    loadUnloadHours: 5,
    weightLbs: 1316,
    additionalDays: 0,
    valuation: 'Full Value',
  });

  assertCents(r.driveHrs, 79.06, 'driveHrs');
  const drive = r.lineItems.find((l) => l.label === 'Drive Cost').amount;
  const load = r.lineItems.find((l) => l.label === 'Load / Unload Cost').amount;
  const overnight = r.lineItems.find((l) => l.label === 'Overnight Cost').amount;
  assertCents(drive, 16207.3, 'driveCost');
  assertCents(load, 1025, 'loadUnloadCost');
  assert.strictEqual(r.daysOnSchedule, 8, 'daysOnSchedule');
  assertCents(overnight, 1750, 'overnightCost');
  assertCents(r.valuationAdjustment, 0, 'valuation');
  assertCents(r.total, 18982.3, 'TOTAL');
});

test('Fixture B — Spokane, Over 6000lbs, 2 trucks, Full Value', () => {
  const r = calculateQuote({
    location: 'Spokane',
    weightClass: 'Over 6000lbs',
    trucks: 2,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 1827,
    additionalDriveHours: 0.46,
    loadUnloadHours: 14,
    weightLbs: 1316,
    additionalDays: 0,
    valuation: 'Full Value',
  });

  assertCents(r.driveHrs, 37.0, 'driveHrs');
  const drive = r.lineItems.find((l) => l.label === 'Drive Cost').amount;
  const load = r.lineItems.find((l) => l.label === 'Load / Unload Cost').amount;
  const overnight = r.lineItems.find((l) => l.label === 'Overnight Cost').amount;
  assertCents(drive, 12950, 'driveCost');
  assertCents(load, 4900, 'loadUnloadCost');
  assert.strictEqual(r.daysOnSchedule, 5, 'daysOnSchedule');
  assertCents(overnight, 1000, 'overnightCost');
  assertCents(r.valuationAdjustment, 0, 'valuation');
  assertCents(r.total, 18850.0, 'TOTAL');
});

test('Valuation bracket lookup — weight 1316 -> cubes 7896 -> $250 Deductible => -53', () => {
  const cubes = 1316 * config.constants.cubesPerLb;
  assert.strictEqual(cubes, 7896, 'cubes');
  const adj = lookupValuationAdjustment('$250 Deductible', cubes, config);
  assert.strictEqual(adj, -53, 'adjustment for 7896 cubes ($250 Deductible)');
});

test('Valuation bracket boundaries are upper-bound exclusive', () => {
  // < 5001 => -40; at exactly 5001 => next bracket (-53).
  assert.strictEqual(lookupValuationAdjustment('$250 Deductible', 5000, config), -40);
  assert.strictEqual(lookupValuationAdjustment('$250 Deductible', 5001, config), -53);
  // Top fallback bracket (>= 100001).
  assert.strictEqual(lookupValuationAdjustment('$250 Deductible', 100001, config), -202);
  assert.strictEqual(lookupValuationAdjustment('$250 Deductible', 250000, config), -202);
});

test('Full Value valuation adjustment is 0', () => {
  assert.strictEqual(lookupValuationAdjustment('Full Value', 7896, config), 0);
});

test('Valuation uses THIS quote own weight (no coupling)', () => {
  const base = {
    location: 'Seattle',
    weightClass: 'Over 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 1000,
    additionalDriveHours: 0,
    loadUnloadHours: 4,
    additionalDays: 0,
    valuation: '$0.60 Per Pound',
  };
  // weight 1000 -> cubes 6000 -> <10001 => -138
  const light = calculateQuote({ ...base, weightLbs: 1000 });
  assert.strictEqual(light.valuationAdjustment, -138);
  // weight 10000 -> cubes 60000 -> <60001 => -537
  const heavy = calculateQuote({ ...base, weightLbs: 10000 });
  assert.strictEqual(heavy.valuationAdjustment, -537);
  // weight 12000 -> cubes 72000 -> <75001 => -620
  const heavier = calculateQuote({ ...base, weightLbs: 12000 });
  assert.strictEqual(heavier.valuationAdjustment, -620);
});

test('Overnight tier — travelMovers 4 => 500, 6 => 750', () => {
  assert.strictEqual(overnightRateFor(4, config), 500);
  assert.strictEqual(overnightRateFor(6, config), 750);
});

test('Overnight tier — boundaries 2/8/10', () => {
  assert.strictEqual(overnightRateFor(2, config), 250);
  assert.strictEqual(overnightRateFor(8, config), 1000);
  assert.strictEqual(overnightRateFor(10, config), 1250);
});

test('Out-of-range overnight (travelMovers 12) throws', () => {
  assert.throws(() => overnightRateFor(12, config), /exceeds the maximum/);
  assert.throws(
    () =>
      calculateQuote({
        location: 'Seattle',
        weightClass: 'Over 6000lbs',
        trucks: 1,
        travelMovers: 12,
        laborMovers: 2,
        totalMiles: 1000,
        loadUnloadHours: 4,
        weightLbs: 2000,
      }),
    /exceeds the maximum/
  );
});

test('ROUNDUP day behavior — daysOnSchedule rounds up to whole days', () => {
  // driveHrs = (550/550)*11 = 11; load 1 => (11+1)/11 = 1.0909 -> ceil 2
  const r = calculateQuote({
    location: 'Fort Collins',
    weightClass: 'Under 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 550,
    additionalDriveHours: 0,
    loadUnloadHours: 1,
    weightLbs: 2000,
    additionalDays: 0,
    valuation: 'Full Value',
  });
  assert.strictEqual(r.driveHrs, 11);
  assert.strictEqual(r.daysOnSchedule, 2);

  // Exactly 11 hrs total => ceil(11/11) = 1 (no round up when exact)
  const exact = calculateQuote({
    location: 'Fort Collins',
    weightClass: 'Under 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 500,
    additionalDriveHours: 0,
    loadUnloadHours: 1,
    weightLbs: 2000,
    additionalDays: 0,
    valuation: 'Full Value',
  });
  // driveHrs = (500/550)*11 = 10; +1 load = 11 => ceil(1.0) = 1
  assert.strictEqual(exact.driveHrs, 10);
  assert.strictEqual(exact.daysOnSchedule, 1);
});

test('additionalDays adds to totalDays and raises overnightCost', () => {
  const r = calculateQuote({
    location: 'Salt Lake/Ogden',
    weightClass: 'Under 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 3953,
    additionalDriveHours: 0,
    loadUnloadHours: 5,
    weightLbs: 1316,
    additionalDays: 2,
    valuation: 'Full Value',
  });
  // daysOnSchedule 8 + 2 = 10 total; overnight = (10-1)*250 = 2250
  assert.strictEqual(r.totalDays, 10);
  const overnight = r.lineItems.find((l) => l.label === 'Overnight Cost').amount;
  assertCents(overnight, 2250, 'overnightCost with extra days');
});

test('Input validation throws clear errors', () => {
  const good = {
    location: 'Spokane',
    weightClass: 'Over 6000lbs',
    trucks: 1,
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 1000,
    loadUnloadHours: 4,
    weightLbs: 2000,
  };
  assert.throws(() => calculateQuote({ ...good, location: 'Nowhere' }), /Unknown location/);
  assert.throws(() => calculateQuote({ ...good, weightClass: 'Medium' }), /Unknown weightClass/);
  assert.throws(() => calculateQuote({ ...good, valuation: 'Bogus' }), /Unknown valuation/);
  assert.throws(() => calculateQuote({ ...good, totalMiles: 0 }), /totalMiles/);
  assert.throws(() => calculateQuote({ ...good, totalMiles: -5 }), /totalMiles/);
  assert.throws(() => calculateQuote({ ...good, loadUnloadHours: -1 }), /loadUnloadHours/);
  assert.throws(() => calculateQuote({ ...good, travelMovers: 0 }), /travelMovers/);
  assert.throws(() => calculateQuote({ ...good, laborMovers: 0 }), /laborMovers/);
});

test('Defaults — trucks=1, additionalDriveHours=0, additionalDays=0, valuation=Full Value', () => {
  const r = calculateQuote({
    location: 'Salt Lake/Ogden',
    weightClass: 'Under 6000lbs',
    travelMovers: 2,
    laborMovers: 2,
    totalMiles: 3953,
    loadUnloadHours: 5,
    weightLbs: 1316,
  });
  assert.strictEqual(r.inputs.trucks, 1);
  assert.strictEqual(r.inputs.additionalDriveHours, 0);
  assert.strictEqual(r.inputs.additionalDays, 0);
  assert.strictEqual(r.inputs.valuation, 'Full Value');
  assertCents(r.total, 18982.3, 'TOTAL with defaults');
});
