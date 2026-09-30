# Days off, planned

An employee self-service planner for public holidays and annual leave. Employees pick where they work and their work week, see every holiday and day in lieu for the year, find the long breaks that cost the least leave, and plan dates before applying through their company's leave system.

It runs entirely in the browser. There is no server, no login and no personal data leaves the device.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | The planner page, served by GitHub Pages |
| `engine/engine.js` | The working-calendar engine: days in lieu, leave cost, best breaks. Pure functions, usable in the browser or Node |
| `data/holidays.json` | Holiday and closure dates. This is the file HR edits |
| `data/settings.json` | Places, days-in-lieu rule per country, and the leave application link |
| `tests/` | Engine and data checks, run with `node --test` |
| `.github/workflows/check.yml` | Runs the tests on every change, and once a month flags missing next-year holidays as an issue |

## Updating holidays

Edit `data/holidays.json` on GitHub (pencil icon), then commit. Each row looks like this:

```json
{
  "id": "2027-03-10-hari-raya-aidilfitri-my-kul-my-sgr",
  "date": "2027-03-10",
  "name": "Hari Raya Aidilfitri",
  "places": ["MY-KUL", "MY-SGR"],
  "kind": "public",
  "status": "projected",
  "alCost": 0,
  "verified": false,
  "source": "Starter data, check against the official gazette"
}
```

- `kind` is `public` or `closure`. For a closure, set `alCost` to `1` if it uses annual leave.
- `status` is `confirmed` or `projected`. Projected dates show hatched.
- Only enter the gazetted date. Days in lieu are worked out automatically from the rule in `settings.json`.
- Set `verified` to `true` once you've checked the row against the official gazette.

If a change breaks the data (a typo'd date, an unknown place), the check fails and GitHub shows a red cross on the commit.

## Days-in-lieu rules

| Rule | Behaviour |
|---|---|
| `next-working` | A holiday on any rest day moves to the next working day that isn't already a holiday |
| `sunday` | Only a Sunday holiday moves |
| `none` | No days in lieu |

Set these to match your employment contracts and company practice.

## Using the engine elsewhere

```js
const DaysOff = require('./engine/engine.js');
const { holidays } = require('./data/holidays.json');

const cal = DaysOff.buildCalendar({ year: 2027, place: 'MY-SGR', pattern: 'mon-fri', holidays });
DaysOff.rangeStats(cal, '2027-02-05', '2027-02-10');   // { al: 1, total: 6, ... }
DaysOff.workingDaysBetween(cal, '2027-01-01', '2027-03-31');
DaysOff.findBreaks(cal, 3);                             // ranked long breaks
```

The raw data files are also reachable as read-only URLs once Pages is on, for example `https://<username>.github.io/<repo>/data/holidays.json`.

## Limits

- Informational only. It does not submit or approve leave and does not know anyone's leave balance.
- Saved plans live in the employee's browser and don't follow them to another device.
- Starter holiday data must be checked against the official gazette before real use.
