# Empire LD Move Calculator (Slack app)

A Node.js [Slack Bolt](https://slack.dev/bolt-js/) app that reproduces the
**"MASTER - LOCATION LD CALCULATOR"** long-distance moving quote spreadsheet.
A `/movequote` slash command opens a modal, collects the move inputs, runs a
pure pricing engine that faithfully reproduces the sheet's math, and posts a
line-item quote (breakdown + bold total) back to the user.

The pricing engine (`src/calculator.js`) is pure and testable — no Slack, no
I/O — so the math can be verified independently of the chat integration. The
regression suite asserts the spreadsheet's totals **to the cent**.

## What it does

1. A user runs `/movequote` in Slack.
2. The app opens a modal form with all the move inputs.
3. On submit, the inputs are validated and fed to the pricing engine.
4. The resulting quote (drive cost, load/unload cost, overnight cost, optional
   valuation adjustment, and total) is posted back to the user via DM.

## The formula chain (reproduced exactly)

Rates come from the **GM Adjustments** rate card, keyed by
`(location, weightClass)`. `weightClass` is a **manual** input
(`"Over 6000lbs"` / `"Under 6000lbs"`), not derived from the weight.

```
truckCost        = truckRate * trucks
travelMoverCost  = manRate   * travelMovers
laborMoverCost   = manRate   * laborMovers

driveHrs         = (totalMiles / 550) * 11 + additionalDriveHours
driveCost        = driveHrs * (travelMoverCost + truckCost)
loadUnloadCost   = (laborMoverCost + truckCost) * loadUnloadHours

daysOnSchedule   = CEIL((driveHrs + loadUnloadHours) / 11)   // round up to whole days
totalDays        = additionalDays + daysOnSchedule

overnightRate    = tiered by travelMovers (see below)
overnightCost    = (totalDays * overnightRate) - overnightRate   // i.e. (totalDays - 1) nights

cubes            = weightLbs * 6
valuationAdjustment = 0 for "Full Value", else a NEGATIVE bracket value by cubes

total = driveCost + loadUnloadCost + overnightCost + valuationAdjustment
```

### Overnight tiers (driven by travel-crew size)

| travelMovers | overnight rate / night |
| ------------ | ---------------------- |
| ≤ 2          | $250                   |
| ≤ 4          | $500                   |
| ≤ 6          | $750                   |
| ≤ 8          | $1,000                 |
| ≤ 10         | $1,250                 |
| > 10         | **error (throws)**     |

Equivalent to `baseOvernight * ceil(travelMovers / 2)`, capped at 10 travel movers.

## Configuration (`config/rates.json`)

Everything below is editable in `config/rates.json` — no code changes needed.

### Rate card (per location, per weight class)

| Location        | Class         | truckRate | manRate |
| --------------- | ------------- | --------- | ------- |
| Fort Collins    | Over 6000lbs  | 120       | 55      |
| Fort Collins    | Under 6000lbs | 95        | 55      |
| Spokane         | Over 6000lbs  | 120       | 55      |
| Spokane         | Under 6000lbs | 95        | 55      |
| Salt Lake/Ogden | Over 6000lbs  | 120       | 55      |
| Salt Lake/Ogden | Under 6000lbs | 95        | 55      |
| Evansville      | Over 6000lbs  | 120       | 60      |
| Evansville      | Under 6000lbs | 100       | 60      |
| Seattle         | Over 6000lbs  | 120       | 65      |
| Seattle         | Under 6000lbs | 110       | 60      |

### Constants

| Constant          | Value |
| ----------------- | ----- |
| milesPerDay       | 550   |
| billableHrsPerDay | 11    |
| baseOvernight     | 250   |
| cubesPerLb        | 6     |
| maxTravelMovers   | 10    |

### Valuation tables (NEGATIVE adjustments, keyed by `cubes = weightLbs * 6`)

Brackets are **upper-bound exclusive**: a bracket `under: N` applies when
`cubes < N`. The last entry (no `under`) is the `>=` top-tier fallback.
`"Full Value"` is an empty table and always yields `0`.

| cubes <      | $250 Deductible | $500 Deductible | $0.60 Per Pound |
| ------------ | --------------- | --------------- | --------------- |
| 5001         | -40             | -56             | -93             |
| 10001        | -53             | -82             | -138            |
| 15001        | -64             | -101            | -182            |
| 20001        | -71             | -121            | -222            |
| 25001        | -89             | -142            | -264            |
| 30001        | -107            | -172            | -315            |
| 35001        | -134            | -203            | -364            |
| 40001        | -153            | -234            | -416            |
| 50001        | —               | —               | -464            |
| 60001        | —               | —               | -537            |
| 75001        | —               | —               | -620            |
| 100001       | -201            | -326            | -762            |
| 125001       | —               | —               | -921            |
| 150001       | —               | —               | -1079           |
| 175001       | —               | —               | -1397           |
| 200001       | —               | —               | -1556           |
| ≥ top        | -202            | -326            | -1714           |

## Documented quirks & decisions

1. **Valuation uses each quote's OWN weight.** The source spreadsheet had a
   cross-tab coupling bug where the valuation lookup read a weight value from a
   different tab. This implementation deliberately fixes that: the valuation
   adjustment is computed from the `weightLbs` entered for *this* quote, so each
   quote is self-contained.
2. **Overnight tiering is replicated as-is.** Overnight cost is driven by the
   **travel-crew size** (`travelMovers`), and the same tier table applies to
   every branch/location. This mirrors the sheet exactly rather than
   second-guessing it.

## Slack app setup

1. Create a Slack app at <https://api.slack.com/apps> (from scratch).
2. **OAuth & Permissions → Bot Token Scopes:** add `commands` and `chat:write`.
3. **Slash Commands:** create `/movequote`
   (Request URL is only needed in HTTP mode — e.g. `https://your-host/slack/events`).
4. **Interactivity & Shortcuts:** turn **Interactivity ON** (required for modals).
   In HTTP mode set the Request URL to `https://your-host/slack/events`.
5. Choose a connection mode:
   - **Socket Mode (easiest, no public URL):** enable **Socket Mode**, create an
     **app-level token** with `connections:write`, and set `SLACK_APP_TOKEN`.
   - **HTTP mode:** leave `SLACK_APP_TOKEN` unset; the app listens on `PORT`
     (default 3000) and you point Slack's Request URLs at `/slack/events`.
6. Install the app to your workspace and copy the **Bot User OAuth Token**
   (`xoxb-…`) into `SLACK_BOT_TOKEN`, and the **Signing Secret** into
   `SLACK_SIGNING_SECRET`.

## Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable               | Required            | Purpose                                              |
| ---------------------- | ------------------- | ---------------------------------------------------- |
| `SLACK_BOT_TOKEN`      | yes                 | Bot token (`xoxb-…`), scopes `commands`, `chat:write`|
| `SLACK_SIGNING_SECRET` | yes (HTTP mode)     | Verifies requests from Slack                         |
| `SLACK_APP_TOKEN`      | socket mode only    | App-level token (`xapp-…`), `connections:write`      |
| `PORT`                 | no (default 3000)   | HTTP listen port when not in socket mode             |

If `SLACK_APP_TOKEN` is set the app starts in **socket mode**; otherwise it
starts an **HTTP** server on `PORT`.

## Running

```bash
npm install
cp .env.example .env   # then fill in real values
npm start
```

## Running tests

```bash
npm test
```

The suite (`test/calculator.test.js`, run with Node's built-in test runner)
covers the two spreadsheet regression fixtures asserted to the cent, valuation
bracket lookups and boundaries, overnight tiers (including the out-of-range
throw), ROUNDUP day behavior, input validation, and defaults.

## Example

Running `/movequote` for Salt Lake/Ogden, Under 6000lbs, 1 truck, 2 travel
movers, 2 labor movers, 3953 one-way miles, 5 load/unload hours, 1316 lbs, Full
Value produces:

```
Drive Cost:          $16,207.30
Load / Unload Cost:   $1,025.00
Overnight Cost:       $1,750.00
TOTAL:               $18,982.30
```

You can verify the engine directly:

```bash
node -e "console.log(require('./src/calculator').calculateQuote({location:'Salt Lake/Ogden',weightClass:'Under 6000lbs',trucks:1,travelMovers:2,laborMovers:2,totalMiles:3953,additionalDriveHours:0,loadUnloadHours:5,weightLbs:1316,additionalDays:0,valuation:'Full Value'}).total)"
# -> 18982.3
```

## Context

Built to replicate the "MASTER - LOCATION LD CALCULATOR" spreadsheet. Related
Slack thread:
<https://westtmtempire.slack.com/archives/D0C82M489DW/p1791323693407739?thread_ts=1791323608.808889&cid=D0C82M489DW>
