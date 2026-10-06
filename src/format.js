'use strict';

/**
 * Builds the Slack result message (Block Kit) from a calculateQuote result:
 * a line-item breakdown followed by a bold Total.
 */

function money(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Build the chat.postMessage `blocks` array for a quote result. */
function buildResultBlocks(result) {
  const { inputs } = result;

  const summaryFields = [
    `*Location:*\n${inputs.location}`,
    `*Weight Class:*\n${inputs.weightClass}`,
    `*Trucks:*\n${inputs.trucks}`,
    `*Travel / Labor Movers:*\n${inputs.travelMovers} / ${inputs.laborMovers}`,
    `*Total Miles:*\n${inputs.totalMiles}`,
    `*Weight:*\n${inputs.weightLbs} lbs`,
    `*Drive Hours:*\n${result.driveHrs}`,
    `*Days (sched / total):*\n${result.daysOnSchedule} / ${result.totalDays}`,
  ].map((text) => ({ type: 'mrkdwn', text }));

  const lineItemText = result.lineItems
    .map((li) => `• ${li.label}: *${money(li.amount)}*`)
    .join('\n');

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Long-Distance Move Quote' },
    },
    { type: 'section', fields: summaryFields },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lineItemText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*TOTAL: ${money(result.total)}*` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Valuation: ${inputs.valuation} · Overnight rate: ${money(result.overnightRate)}/night · Replicates "MASTER - LOCATION LD CALCULATOR"`,
        },
      ],
    },
  ];
}

/** Plain-text fallback for notifications / non-block clients. */
function buildResultText(result) {
  const lines = result.lineItems.map((li) => `${li.label}: ${money(li.amount)}`);
  lines.push(`TOTAL: ${money(result.total)}`);
  return lines.join('\n');
}

module.exports = { buildResultBlocks, buildResultText, money };
