'use strict';

/**
 * Loads and validates the pricing configuration from config/rates.json.
 *
 * The config holds everything the pricing engine needs and is intended to be
 * fully tunable by editing config/rates.json (no code change required):
 *   - constants: milesPerDay, billableHrsPerDay, baseOvernight, cubesPerLb, maxTravelMovers
 *   - locations: per-location, per-weight-class { truckRate, manRate }
 *   - weightClasses: allowed weight-class labels
 *   - valuations: ordered bracket arrays keyed by cubes (weightLbs * cubesPerLb)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'rates.json');

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid config: expected an object');
  }

  const { constants, locations, weightClasses, valuations } = config;

  if (!constants || typeof constants !== 'object') {
    throw new Error('Invalid config: missing "constants"');
  }
  for (const key of [
    'milesPerDay',
    'billableHrsPerDay',
    'baseOvernight',
    'cubesPerLb',
    'maxTravelMovers',
  ]) {
    if (typeof constants[key] !== 'number' || !Number.isFinite(constants[key])) {
      throw new Error(`Invalid config: constants.${key} must be a finite number`);
    }
  }

  if (!locations || typeof locations !== 'object') {
    throw new Error('Invalid config: missing "locations"');
  }
  if (!Array.isArray(weightClasses) || weightClasses.length === 0) {
    throw new Error('Invalid config: "weightClasses" must be a non-empty array');
  }

  for (const [name, byClass] of Object.entries(locations)) {
    for (const cls of weightClasses) {
      const card = byClass[cls];
      if (!card || typeof card !== 'object') {
        throw new Error(`Invalid config: location "${name}" missing class "${cls}"`);
      }
      if (typeof card.truckRate !== 'number' || typeof card.manRate !== 'number') {
        throw new Error(
          `Invalid config: location "${name}" class "${cls}" needs numeric truckRate/manRate`
        );
      }
    }
  }

  if (!valuations || typeof valuations !== 'object') {
    throw new Error('Invalid config: missing "valuations"');
  }
  if (!Array.isArray(valuations['Full Value'])) {
    throw new Error('Invalid config: valuations must include a "Full Value" entry');
  }

  return config;
}

let cached = null;

function loadConfig(forceReload = false) {
  if (cached && !forceReload) {
    return cached;
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid config: could not parse ${CONFIG_PATH}: ${err.message}`);
  }
  cached = validateConfig(parsed);
  return cached;
}

module.exports = { loadConfig, validateConfig, CONFIG_PATH };
