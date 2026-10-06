'use strict';

/**
 * Optional ZIP/address -> driving-mileage auto-lookup.
 *
 * Manual miles ALWAYS win; the API lookup is only attempted when miles are not
 * supplied AND both an origin and destination are given AND an API key is set.
 * The whole app must keep working with manual miles when no key is configured,
 * so the absence of a key is never a hard failure here — it only disables the
 * lookup path. The API key is never logged.
 */

const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const METERS_PER_MILE = 1609.344;

/** Read the configured API key (Google Maps preferred, DISTANCE_API_KEY fallback). */
function getApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.DISTANCE_API_KEY || '';
}

/**
 * Default fetcher: query the Google Distance Matrix API for driving distance
 * between origin and destination and return the distance in miles.
 *
 * Uses the global fetch. Overridable via deps.fetchDrivingMiles for testing.
 *
 * @param {string} origin
 * @param {string} destination
 * @returns {Promise<number>} driving distance in miles
 */
async function defaultFetchDrivingMiles(origin, destination) {
  const apiKey = getApiKey();
  if (!apiKey) {
    // Should be unreachable (resolveMiles guards on the key) but be defensive.
    throw new Error('No distance API key configured');
  }

  const url = new URL(DISTANCE_MATRIX_URL);
  url.searchParams.set('origins', origin);
  url.searchParams.set('destinations', destination);
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Distance lookup failed (HTTP ${res.status})`);
  }
  const data = await res.json();

  if (data.status && data.status !== 'OK') {
    throw new Error(`Distance lookup failed: ${data.status}`);
  }
  const element =
    data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0];
  if (!element || element.status !== 'OK' || !element.distance) {
    const status = (element && element.status) || 'NO_RESULT';
    throw new Error(`Distance lookup failed for "${origin}" -> "${destination}" (${status})`);
  }

  const meters = element.distance.value;
  if (!Number.isFinite(meters)) {
    throw new Error('Distance lookup returned an invalid distance');
  }
  // Convert meters -> miles, rounded to one decimal place.
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

/**
 * Resolve driving miles for a quote.
 *
 *   - If manualMiles is a positive number, return it (manual always wins).
 *   - Else if origin and destination are given AND an API key is set, call the
 *     fetcher (default: Google Distance Matrix) to resolve the mileage.
 *   - Else throw a clear Error explaining both options.
 *
 * @param {object} args
 * @param {number} [args.manualMiles]
 * @param {string} [args.origin]
 * @param {string} [args.destination]
 * @param {object} [deps]
 * @param {function} [deps.fetchDrivingMiles] async (origin, destination) => miles
 * @returns {Promise<number>}
 */
async function resolveMiles({ manualMiles, origin, destination } = {}, deps = {}) {
  const manual = Number(manualMiles);
  if (Number.isFinite(manual) && manual > 0) {
    return manual;
  }

  // An injected fetcher is its own distance source, so it needs no API key.
  // The default (network) fetcher is only used when a key is configured.
  const hasBoth = Boolean(origin) && Boolean(destination);
  const fetcher = deps.fetchDrivingMiles || (getApiKey() ? defaultFetchDrivingMiles : null);
  if (hasBoth && fetcher) {
    const miles = await fetcher(origin, destination);
    const n = Number(miles);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('Mileage lookup returned an invalid distance');
    }
    return n;
  }

  throw new Error(
    'Provide miles directly, or set GOOGLE_MAPS_API_KEY and give both origin and destination.'
  );
}

module.exports = { resolveMiles, defaultFetchDrivingMiles, getApiKey };
