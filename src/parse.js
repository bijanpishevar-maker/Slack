'use strict';

/**
 * Text-mode parser for the /movequote slash command.
 *
 * Turns a `key:value` command string into the same plain input object that
 * calculateQuote (src/calculator.js) consumes. Supports quoted values (for
 * multi-word locations) and a set of friendly aliases for keys and for the
 * categorical class/valuation values.
 *
 * Example:
 *   /movequote location:"Salt Lake/Ogden" class:under trucks:1 travel:2 \
 *     labor:2 miles:3953 drivehrs:0 load:5 weight:1316 days:0 valuation:full
 *
 * Pure: no I/O, no Slack. Throws clear Errors naming the offending/missing
 * field on bad input.
 */

/** Usage hint shown alongside parse/calc errors in Slack. */
const USAGE_HINT =
  'Usage: /movequote location:"Salt Lake/Ogden" class:under trucks:1 travel:2 ' +
  'labor:2 miles:3953 load:5 weight:1316 [drivehrs:0 days:0 valuation:full from:84101 to:97201]';

/** Normalize a token for alias matching: lowercase, strip non-alphanumerics. */
function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Map of normalized key alias -> canonical input field name.
const KEY_ALIASES = {
  location: 'location',
  class: 'weightClass',
  weightclass: 'weightClass',
  trucks: 'trucks',
  travel: 'travelMovers',
  travelmovers: 'travelMovers',
  labor: 'laborMovers',
  labormovers: 'laborMovers',
  miles: 'totalMiles',
  totalmiles: 'totalMiles',
  drivehrs: 'additionalDriveHours',
  additionaldrivehours: 'additionalDriveHours',
  load: 'loadUnloadHours',
  loadhrs: 'loadUnloadHours',
  loadunloadhours: 'loadUnloadHours',
  weight: 'weightLbs',
  weightlbs: 'weightLbs',
  days: 'additionalDays',
  additionaldays: 'additionalDays',
  valuation: 'valuation',
  from: 'origin',
  origin: 'origin',
  to: 'destination',
  destination: 'destination',
};

// Normalized class value -> canonical weight-class label.
const CLASS_ALIASES = {
  under: 'Under 6000lbs',
  u: 'Under 6000lbs',
  under6000: 'Under 6000lbs',
  under6000lbs: 'Under 6000lbs',
  over: 'Over 6000lbs',
  o: 'Over 6000lbs',
  over6000: 'Over 6000lbs',
  over6000lbs: 'Over 6000lbs',
};

// Normalized valuation value -> canonical valuation label.
const VALUATION_ALIASES = {
  full: 'Full Value',
  fullvalue: 'Full Value',
  '250': '$250 Deductible',
  '250deductible': '$250 Deductible',
  '500': '$500 Deductible',
  '500deductible': '$500 Deductible',
  '060': '$0.60 Per Pound',
  perpound: '$0.60 Per Pound',
  pp: '$0.60 Per Pound',
};

// Fields parsed as numbers.
const NUMERIC_FIELDS = new Set([
  'trucks',
  'travelMovers',
  'laborMovers',
  'totalMiles',
  'additionalDriveHours',
  'loadUnloadHours',
  'weightLbs',
  'additionalDays',
]);

/**
 * Tokenize a `key:value` string into [key, value] pairs, honoring double or
 * single quoted values. Throws if any non-whitespace text is left unmatched.
 */
function tokenize(text) {
  const re = /([A-Za-z]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  const pairs = [];
  let consumed = '';
  let match;
  while ((match = re.exec(text)) !== null) {
    consumed += text.slice(match.index, re.lastIndex);
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
    pairs.push([key, value]);
  }
  // Anything left over that isn't whitespace is garbage (e.g. a bare word).
  const leftover = text.replace(re, '').trim();
  if (leftover !== '') {
    throw new Error(
      `Could not parse "${leftover}". Expected key:value pairs (e.g. location:"Salt Lake/Ogden").`
    );
  }
  return pairs;
}

/** Parse a numeric field value, throwing a friendly error if invalid. */
function parseNumber(field, raw) {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    throw new Error(`"${field}" must be a number (got "${raw}")`);
  }
  return n;
}

/**
 * Parse a /movequote command string into the input object for calculateQuote.
 *
 * @param {string} text
 * @returns {object} input object (may include optional origin/destination, and
 *   may omit totalMiles when origin+destination are supplied for lookup).
 */
function parseCommandText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('No input provided. ' + USAGE_HINT);
  }

  const pairs = tokenize(text);
  const raw = {};
  for (const [key, value] of pairs) {
    const field = KEY_ALIASES[normalize(key)];
    if (!field) {
      throw new Error(`Unknown field "${key}". ${USAGE_HINT}`);
    }
    raw[field] = value;
  }

  const input = {};

  // Location (required, free text).
  if (raw.location !== undefined) {
    input.location = raw.location;
  }

  // Weight class (required, aliased).
  if (raw.weightClass !== undefined) {
    const cls = CLASS_ALIASES[normalize(raw.weightClass)];
    if (!cls) {
      throw new Error(
        `Unknown class "${raw.weightClass}". Use under / over (aliases: u, o, under6000, over6000).`
      );
    }
    input.weightClass = cls;
  }

  // Valuation (optional, aliased; defaults to Full Value).
  if (raw.valuation !== undefined) {
    const val = VALUATION_ALIASES[normalize(raw.valuation)];
    if (!val) {
      throw new Error(
        `Unknown valuation "${raw.valuation}". Use full / 250 / 500 / 0.60 (aliases: perpound, pp).`
      );
    }
    input.valuation = val;
  } else {
    input.valuation = 'Full Value';
  }

  // Optional origin/destination for mileage lookup (free text / ZIP / address).
  if (raw.origin !== undefined) {
    input.origin = raw.origin;
  }
  if (raw.destination !== undefined) {
    input.destination = raw.destination;
  }

  // Numeric fields.
  for (const field of NUMERIC_FIELDS) {
    if (raw[field] !== undefined) {
      input[field] = parseNumber(field, raw[field]);
    }
  }

  // Defaults mirroring the modal.
  if (input.trucks === undefined) input.trucks = 1;
  if (input.additionalDriveHours === undefined) input.additionalDriveHours = 0;
  if (input.additionalDays === undefined) input.additionalDays = 0;

  // Required-field checks (clear, named errors).
  const requiredAlways = [
    ['location', 'location'],
    ['weightClass', 'class'],
    ['travelMovers', 'travel'],
    ['laborMovers', 'labor'],
    ['loadUnloadHours', 'load'],
    ['weightLbs', 'weight'],
  ];
  for (const [field, key] of requiredAlways) {
    if (input[field] === undefined) {
      throw new Error(`Missing required field "${key}". ${USAGE_HINT}`);
    }
  }

  // Miles is required unless both origin and destination are given (then it is
  // resolved downstream via src/distance.js).
  if (input.totalMiles === undefined && !(input.origin && input.destination)) {
    throw new Error(
      'Missing required field "miles" (or provide both from: and to: for mileage lookup). ' +
        USAGE_HINT
    );
  }

  return input;
}

module.exports = { parseCommandText, USAGE_HINT };
