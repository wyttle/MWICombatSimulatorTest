# MWICombatSimulator

## Recommended importer

Use [MWI-Importer - Wyttle Guild Shrines](./MWI-Importer-Wyttle.user.js) to import character, party, loadout, achievement, house, and Guild Shrine data directly from Milky Way Idle.

Install the userscript from the public repository:

- [Install MWI-Importer - Wyttle Guild Shrines](https://raw.githubusercontent.com/wyttle/MWICombatSimulatorTest/testing/MWI-Importer-Wyttle.user.js)

Tampermonkey or Violentmonkey is required. After installing the userscript:

1. Refresh Milky Way Idle so the importer can capture the latest character and Guild Shrine data.
2. Open the [Wyttle Combat Simulator](https://wyttle.github.io/MWICombatSimulatorTest/).
3. Select the character or party from the importer dropdown.
4. Click the green character import button.

The importer supports all five combat shrines (`force`, `tempo`, `spirit`, `rarity`, and `scholar`) and keeps their levels with solo, group, and equipment-set data.

## Team Optimizer

Open **队伍优化器 / Team Optimizer** next to Import/Export. It captures the whole imported roster plus the main page's dungeon, tier, dungeon count, buffs, Guild Shrines, and parallel-worker setting on every open, and never writes back to the main page until **Apply** is clicked.

**Team members** at the top of the panel decides who fights: tick the members there instead of going back to the main page, or use **Select / Deselect All** to take the whole roster (clicking it again falls back to the first member; the roster is never empty). The list contains every member that actually has imported data, so a five-player import shows five members even when the main page is showing only three checkboxes. The initially ticked set comes from the main page's checkboxes when any of them are ticked; since the optimizer only ever simulates dungeons, an untouched main page (its team checkboxes are all clear while *Simulate Dungeon* is off) starts with the whole imported roster fighting rather than just the current tab. **Apply** writes the selection back to those checkboxes. Unticking a member keeps their edits — tick them again and the edits are still there — but it does invalidate the current candidates and results, since a different roster is a different fight.

1. Edit any equipped ability's trigger conditions with the same options and interlocks as the main trigger dialog: dependency, condition, comparator, optional value, up to four AND conditions, per-condition removal, and reset to the game defaults. Removing every condition means the ability fires as soon as it is off cooldown. Food and drink triggers are not editable here; they still take part in the simulation unchanged. Because the game stores triggers per ability HRID, one ability occupying two slots shares one condition list — the panel says so explicitly.
2. **Start Simulation** runs the edited draft and the captured original over the same seeds and reports the paired difference. **Auto-tune thresholds** additionally searches the numeric thresholds whose *Auto-tune condition* box you tick, then re-runs the winner as a normal paired comparison. The step you type is the *final* resolution, not the one the search starts with: it first sweeps the whole range with a multiplied step, then halves the step level by level while narrowing to the neighbourhood of the current best, so the last level lands exactly on your grid. Ticking a condition prefills a usable range from its type — HP/MP spans zero to twice the current value, unit counts span 0–5, *Lowest HP %* spans 0–100 — and fills in *Maximum evaluations* with an upper bound for finishing every resolution, alongside the dungeon runs that implies. Type your own number there and it is left alone from then on. Original values always stay candidates, the budget is shared by every ticked condition, and the auto-tune history lists the step used for each point.
3. The equipment tab swaps a slot's item/enhancement or generates every +1 enhancement and +1 combat-room candidate for one player, priced against the live marketplace snapshot at the matching enhancement level. Sale tax is fixed at 5%. Missing prices stay unknown and are never treated as free.

All ticked members are simulated together in one run, so edits spread across several members are evaluated as one combined change, not one at a time. Editing ten triggers over five members and pressing **Start Simulation** answers "is this package better than the original team", with every change listed under *Changes added by this candidate*. To attribute the gain to individual edits, evaluate them one at a time (or in small groups) against the same original; to tune the numbers rather than the structure, tick *Auto-tune condition* on the numeric conditions you care about — the search handles several at once, coarse to fine, sharing the *Maximum evaluations* budget.

Each seed runs the requested number of dungeon attempts; successes and wipes both count, and failed runs are never discarded. Two independent random streams are used: spawns and combat. Same seed plus same configuration reproduces a run exactly, so the paired difference removes most spawn luck. Changing a trigger still shifts the combat stream, so wide intervals mean "raise the sample count", not "no difference". Reported 95% intervals are paired Student-t intervals for this candidate only, not a simultaneous guarantee across everything you tried.

Cost scales as *seeds × dungeon attempts × evaluations*: one evaluation is one full sweep of every seed. Keeping the main page's 2000 attempts at 16 seeds means 32000 dungeon runs per evaluation, which is minutes per candidate and hours for a scan. Start at roughly 100–300 attempts with 8–16 seeds, and raise the attempt count only once the interval is narrow enough to matter. Coarse-to-fine keeps the evaluation count low — a 3000–6000 range at step 200 costs about 12 evaluations per threshold instead of the 30 a flat sweep of that grid would need, and a 200-point grid converges in about 20 — so the suggested budget stays modest even for ten thresholds. When the budget does run out the result is marked truncated; because the coarse level runs first, every threshold has still been explored rather than the first few consuming everything.

Worker count buys speed and costs memory, linearly. One simulation worker peaks around 160–175 MB of heap regardless of how many dungeons it runs, because V8 lets garbage pile up that far before collecting — the live data is only 11–14 MB, and the same workload finishes in the same wall time under a 64 MB heap cap. Browsers expose no such cap for workers, so the peak simply multiplies: a 16-core machine running 15 workers asks for roughly 3 GB and can crash the tab out of memory on long dungeon runs. The slider is not clamped, since threads are where the throughput comes from; instead the optimizer prints the projected footprint under it (`WORKER_PEAK_MB` in `src/workerBudget.js`). If a run dies, lower the worker count before lowering the dungeon count — workers multiply the peak, dungeon attempts do not.

Past roughly eight workers you are paying memory for very little speed. Measured on a 16-core/32-thread machine (Pirate Cove T1, five players, 500 dungeons per process): 1 process is 18 dungeons/s, 8 processes reach 111/s (77% parallel efficiency), 16 reach 148/s (51%), and 32 only 168/s (29%). The simulation is allocation-heavy, so sibling SMT threads fight over the same execution units and L3 rather than adding throughput. Eight to ten workers is the sweet spot on a 16-core machine; doubling that buys about a third more throughput for twice the memory. Per-process RSS is around 313 MB — higher than the 175 MB heap figure, since RSS also covers code and off-heap buffers — which is why fifteen workers can ask for over 4 GB.

Behavioral validation (needs Node.js 22.15+ or 24):

```bash
npm run validate:optimizer
# optional: also run an end-to-end Pirate Cove T1 check against a real team export
node validateOptimizer.cjs ../team.txt
```

### How to run locally for development purposes

Install dependencies: 

```bash
npm install
```

Build webpack bundle:

```bash
npm run build
```

Run locally:

```bash
npm start
```

### Updating Guild Shrine data

Export the live game's `initClientData` into `initClientData.json` at the project root. The full export is local-only and ignored by Git.

Generate the committed Guild Shrine data snapshots:

```bash
npm run extract:guild-shrines
```

Validate the generated data and combat effects:

```bash
npm run validate:guild-shrines
npm run validate:mwi-importer
```

The generated files are:

- `src/combatsimulator/data/guildShrineDetailMap.json`
- `src/combatsimulator/data/guildBuffDetailMap.json`
