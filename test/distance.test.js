'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { resolveMiles } = require('../src/distance');

test('Manual miles always win (no fetcher called)', async () => {
  let called = false;
  const fetchDrivingMiles = async () => {
    called = true;
    return 9999;
  };
  const miles = await resolveMiles(
    { manualMiles: 3953, origin: '84101', destination: '97201' },
    { fetchDrivingMiles }
  );
  assert.strictEqual(miles, 3953);
  assert.strictEqual(called, false, 'fetcher must not be called when manual miles given');
});

test('Resolves via injected fetcher when origin+destination given and no manual miles', async () => {
  const calls = [];
  const fetchDrivingMiles = async (origin, destination) => {
    calls.push([origin, destination]);
    return 1234.5;
  };
  const miles = await resolveMiles(
    { origin: '84101', destination: '97201' },
    { fetchDrivingMiles }
  );
  assert.strictEqual(miles, 1234.5);
  assert.deepStrictEqual(calls, [['84101', '97201']]);
});

test('Throws the clear error when neither manual miles nor lookup are available', async () => {
  // No fetcher injected and no API key env -> default fetcher is unavailable.
  const prevGoogle = process.env.GOOGLE_MAPS_API_KEY;
  const prevGeneric = process.env.DISTANCE_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.DISTANCE_API_KEY;
  try {
    await assert.rejects(
      () => resolveMiles({ origin: '84101', destination: '97201' }),
      /Provide miles directly, or set GOOGLE_MAPS_API_KEY and give both origin and destination\./
    );
    // Also throws when only one endpoint is present even with an injected fetcher.
    await assert.rejects(
      () => resolveMiles({ origin: '84101' }, { fetchDrivingMiles: async () => 100 }),
      /Provide miles directly/
    );
  } finally {
    if (prevGoogle !== undefined) process.env.GOOGLE_MAPS_API_KEY = prevGoogle;
    if (prevGeneric !== undefined) process.env.DISTANCE_API_KEY = prevGeneric;
  }
});
