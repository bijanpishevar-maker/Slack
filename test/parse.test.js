'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { parseCommandText } = require('../src/parse');
const { calculateQuote } = require('../src/calculator');

test('Full valid parse yields a complete input object', () => {
  const input = parseCommandText(
    'location:"Salt Lake/Ogden" class:under trucks:1 travel:2 labor:2 ' +
      'miles:3953 drivehrs:0 load:5 weight:1316 days:0 valuation:full'
  );
  assert.strictEqual(input.location, 'Salt Lake/Ogden');
  assert.strictEqual(input.weightClass, 'Under 6000lbs');
  assert.strictEqual(input.trucks, 1);
  assert.strictEqual(input.travelMovers, 2);
  assert.strictEqual(input.laborMovers, 2);
  assert.strictEqual(input.totalMiles, 3953);
  assert.strictEqual(input.additionalDriveHours, 0);
  assert.strictEqual(input.loadUnloadHours, 5);
  assert.strictEqual(input.weightLbs, 1316);
  assert.strictEqual(input.additionalDays, 0);
  assert.strictEqual(input.valuation, 'Full Value');

  // The parsed object feeds calculateQuote and matches the spreadsheet fixture.
  const r = calculateQuote(input);
  assert.ok(Math.abs(r.total - 18982.3) < 0.005, `expected 18982.3, got ${r.total}`);
});

test('Alias handling — class and valuation aliases map to canonical labels', () => {
  const over = parseCommandText(
    'location:Seattle class:o travel:2 labor:2 miles:1000 load:4 weight:2000 valuation:pp'
  );
  assert.strictEqual(over.weightClass, 'Over 6000lbs');
  assert.strictEqual(over.valuation, '$0.60 Per Pound');

  const under = parseCommandText(
    'location:Spokane class:under6000 travel:2 labor:2 miles:1000 load:4 weight:2000 valuation:250'
  );
  assert.strictEqual(under.weightClass, 'Under 6000lbs');
  assert.strictEqual(under.valuation, '$250 Deductible');

  const perPound = parseCommandText(
    'location:Spokane class:u travel:2 labor:2 miles:1000 load:4 weight:2000 valuation:0.60'
  );
  assert.strictEqual(perPound.valuation, '$0.60 Per Pound');

  const ded500 = parseCommandText(
    'location:Spokane class:u travel:2 labor:2 miles:1000 load:4 weight:2000 valuation:500'
  );
  assert.strictEqual(ded500.valuation, '$500 Deductible');
});

test('Defaults applied — trucks=1, drivehrs=0, days=0, valuation=Full Value', () => {
  const input = parseCommandText(
    'location:"Salt Lake/Ogden" class:under travel:2 labor:2 miles:3953 load:5 weight:1316'
  );
  assert.strictEqual(input.trucks, 1);
  assert.strictEqual(input.additionalDriveHours, 0);
  assert.strictEqual(input.additionalDays, 0);
  assert.strictEqual(input.valuation, 'Full Value');

  const r = calculateQuote(input);
  assert.ok(Math.abs(r.total - 18982.3) < 0.005, `expected 18982.3, got ${r.total}`);
});

test('Quoted location preserves spaces and slashes', () => {
  const input = parseCommandText(
    "location:'Salt Lake/Ogden' class:under travel:2 labor:2 miles:100 load:4 weight:2000"
  );
  assert.strictEqual(input.location, 'Salt Lake/Ogden');
});

test('Key aliases — travelmovers/labormovers/totalmiles/loadhrs/weightlbs/additionaldays', () => {
  const input = parseCommandText(
    'location:Spokane class:over travelmovers:3 labormovers:4 totalmiles:500 ' +
      'loadhrs:6 weightlbs:7000 additionaldays:1 additionaldrivehours:2'
  );
  assert.strictEqual(input.travelMovers, 3);
  assert.strictEqual(input.laborMovers, 4);
  assert.strictEqual(input.totalMiles, 500);
  assert.strictEqual(input.loadUnloadHours, 6);
  assert.strictEqual(input.weightLbs, 7000);
  assert.strictEqual(input.additionalDays, 1);
  assert.strictEqual(input.additionalDriveHours, 2);
});

test('from/to are captured and miles may be omitted when both given', () => {
  const input = parseCommandText(
    'location:Spokane class:under travel:2 labor:2 load:4 weight:2000 from:84101 to:97201'
  );
  assert.strictEqual(input.origin, '84101');
  assert.strictEqual(input.destination, '97201');
  assert.strictEqual(input.totalMiles, undefined);
});

test('Throws a clear error on an unknown field', () => {
  assert.throws(
    () =>
      parseCommandText(
        'location:Spokane class:under travel:2 labor:2 miles:500 load:4 weight:2000 bogus:1'
      ),
    /Unknown field "bogus"/
  );
});

test('Throws a clear error on a missing required field', () => {
  // Missing weight.
  assert.throws(
    () => parseCommandText('location:Spokane class:under travel:2 labor:2 miles:500 load:4'),
    /Missing required field "weight"/
  );
  // Missing miles with no from/to for lookup.
  assert.throws(
    () =>
      parseCommandText('location:Spokane class:under travel:2 labor:2 load:4 weight:2000'),
    /Missing required field "miles"/
  );
});

test('Throws on an unknown class or valuation alias', () => {
  assert.throws(
    () =>
      parseCommandText(
        'location:Spokane class:medium travel:2 labor:2 miles:500 load:4 weight:2000'
      ),
    /Unknown class "medium"/
  );
  assert.throws(
    () =>
      parseCommandText(
        'location:Spokane class:under travel:2 labor:2 miles:500 load:4 weight:2000 valuation:gold'
      ),
    /Unknown valuation "gold"/
  );
});
