'use strict';

/**
 * Block Kit modal view for the /movequote command, plus a parser that turns a
 * Slack view-submission payload back into a plain input object for calculator.js.
 */

const { loadConfig } = require('./config');

const CALLBACK_ID = 'movequote_modal';
const VALUATIONS = ['Full Value', '$250 Deductible', '$500 Deductible', '$0.60 Per Pound'];

function option(text, value) {
  return { text: { type: 'plain_text', text }, value };
}

function plainTextInput(blockId, actionId, label, placeholder, initialValue, optional = false) {
  const element = {
    type: 'plain_text_input',
    action_id: actionId,
  };
  if (placeholder) {
    element.placeholder = { type: 'plain_text', text: placeholder };
  }
  if (initialValue !== undefined && initialValue !== null) {
    element.initial_value = String(initialValue);
  }
  return {
    type: 'input',
    block_id: blockId,
    optional,
    label: { type: 'plain_text', text: label },
    element,
  };
}

/** Build the modal view object to pass to views.open. */
function buildModalView() {
  const config = loadConfig();
  const locationOptions = Object.keys(config.locations).map((loc) => option(loc, loc));
  const weightClassOptions = config.weightClasses.map((c) => option(c, c));
  const valuationOptions = VALUATIONS.map((v) => option(v, v));

  return {
    type: 'modal',
    callback_id: CALLBACK_ID,
    title: { type: 'plain_text', text: 'LD Move Quote' },
    submit: { type: 'plain_text', text: 'Calculate' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'location',
        label: { type: 'plain_text', text: 'Location' },
        element: {
          type: 'static_select',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Select a location' },
          options: locationOptions,
        },
      },
      {
        type: 'input',
        block_id: 'weightClass',
        label: { type: 'plain_text', text: 'Weight Class' },
        element: {
          type: 'static_select',
          action_id: 'value',
          initial_option: weightClassOptions[0],
          options: weightClassOptions,
        },
      },
      plainTextInput('trucks', 'value', 'Trucks', 'e.g. 1', 1),
      plainTextInput('travelMovers', 'value', 'Travel Movers', 'e.g. 2'),
      plainTextInput('laborMovers', 'value', 'Labor Movers', 'e.g. 2'),
      plainTextInput(
        'totalMiles',
        'value',
        'Total Miles (one-way)',
        'e.g. 1827 — or leave blank and fill Origin/Destination below',
        undefined,
        true
      ),
      plainTextInput(
        'origin',
        'value',
        'Origin (ZIP or address, optional)',
        'e.g. 84101 — used only if Total Miles is blank',
        undefined,
        true
      ),
      plainTextInput(
        'destination',
        'value',
        'Destination (ZIP or address, optional)',
        'e.g. 97201 — used only if Total Miles is blank',
        undefined,
        true
      ),
      plainTextInput('additionalDriveHours', 'value', 'Additional Drive Hours', 'e.g. 0', 0),
      plainTextInput('loadUnloadHours', 'value', 'Load / Unload Hours', 'e.g. 5'),
      plainTextInput('weightLbs', 'value', 'Weight (lbs)', 'e.g. 1316'),
      plainTextInput('additionalDays', 'value', 'Additional Days', 'e.g. 0', 0),
      {
        type: 'input',
        block_id: 'valuation',
        label: { type: 'plain_text', text: 'Valuation' },
        element: {
          type: 'static_select',
          action_id: 'value',
          initial_option: valuationOptions[0],
          options: valuationOptions,
        },
      },
    ],
  };
}

function selectValue(stateValues, blockId) {
  const block = stateValues[blockId];
  const selected = block && block.value && block.value.selected_option;
  return selected ? selected.value : undefined;
}

function textValue(stateValues, blockId) {
  const block = stateValues[blockId];
  const v = block && block.value && block.value.value;
  return v === undefined || v === null ? '' : v;
}

/** Parse a number from a modal text field, throwing a friendly error if invalid. */
function parseNumberField(stateValues, blockId, label) {
  const raw = String(textValue(stateValues, blockId)).trim();
  if (raw === '') {
    throw new Error(`${label} is required`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a number (got "${raw}")`);
  }
  return n;
}

/**
 * Parse an OPTIONAL number field: returns undefined when blank, else validates.
 */
function parseOptionalNumberField(stateValues, blockId, label) {
  const raw = String(textValue(stateValues, blockId)).trim();
  if (raw === '') {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a number (got "${raw}")`);
  }
  return n;
}

/** Return the trimmed text of an optional field, or undefined when blank. */
function optionalText(stateValues, blockId) {
  const raw = String(textValue(stateValues, blockId)).trim();
  return raw === '' ? undefined : raw;
}

/**
 * Parse a Slack view-submission payload (view.state.values) into the input
 * object consumed by calculateQuote.
 */
function parseSubmission(view) {
  const stateValues = view.state.values;
  return {
    location: selectValue(stateValues, 'location'),
    weightClass: selectValue(stateValues, 'weightClass'),
    trucks: parseNumberField(stateValues, 'trucks', 'Trucks'),
    travelMovers: parseNumberField(stateValues, 'travelMovers', 'Travel Movers'),
    laborMovers: parseNumberField(stateValues, 'laborMovers', 'Labor Movers'),
    totalMiles: parseOptionalNumberField(stateValues, 'totalMiles', 'Total Miles'),
    origin: optionalText(stateValues, 'origin'),
    destination: optionalText(stateValues, 'destination'),
    additionalDriveHours: parseNumberField(
      stateValues,
      'additionalDriveHours',
      'Additional Drive Hours'
    ),
    loadUnloadHours: parseNumberField(stateValues, 'loadUnloadHours', 'Load / Unload Hours'),
    weightLbs: parseNumberField(stateValues, 'weightLbs', 'Weight (lbs)'),
    additionalDays: parseNumberField(stateValues, 'additionalDays', 'Additional Days'),
    valuation: selectValue(stateValues, 'valuation'),
  };
}

module.exports = { buildModalView, parseSubmission, CALLBACK_ID, VALUATIONS };
