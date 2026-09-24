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
2. **Start Simulation** compares the draft and original on paired seeds. **Auto-tune thresholds** explores the ticked numeric conditions. Leave either bound empty for an engine-derived domain; explicit bounds remain hard constraints. The step remains the final grid resolution. Automatic domains use tiered monsters, permitted spawn groups, living-unit aggregation, player resource formulas and consumable envelopes. They include the engine's empty-set percentage sentinel and one grid step outside the physical envelope to cover constant-condition behavior. Skill damage/cast/cooldown/DoT formulas supply initial search scales, not a claim about actual DPS or an optimal HP threshold. The coarse sweep retains up to three separated peak regions for refinement and revisits interacting coordinates in a second sweep; narrow unsampled peaks and coupled improvements can still be missed.
3. The equipment tab swaps a slot's item/enhancement or generates every +1 enhancement and +1 combat-room candidate for one player, priced against the live marketplace snapshot at the matching enhancement level. Sale tax is fixed at 5%. Missing prices stay unknown and are never treated as free.

All ticked members are simulated together in one run, so edits spread across several members are evaluated as one combined change, not one at a time. Editing ten triggers over five members and pressing **Start Simulation** answers "is this package better than the original team", with every change listed under *Changes added by this candidate*. To attribute the gain to individual edits, evaluate them one at a time (or in small groups) against the same original; to tune the numbers rather than the structure, tick *Auto-tune condition* on the numeric conditions you care about — the search handles several at once, coarse to fine, sharing the *Maximum evaluations* budget.

Each seed runs the requested number of dungeon attempts; successes and wipes both count, and failed runs are never discarded. Two independent random streams are used: spawns and combat. Same seed plus same configuration reproduces a run exactly, so the paired difference removes most spawn luck. Changing a trigger still shifts the combat stream, so wide intervals mean "raise the sample count", not "no difference". Reported 95% intervals are paired Student-t intervals for this candidate only, not a simultaneous guarantee across everything you tried.

Search cost is *exploration attempts × seeds × evaluations*. **Exploration dungeon attempts** defaults to 200 per seed and is capped at the full dungeon count. After selection, the original team and winner are evaluated at the full count on a disjoint set of holdout seeds. At a full count of 2000, exploration therefore uses one tenth as many attempts per evaluation, but wider ranges and multiple peak regions can increase the evaluation count. Cheap exploration may miss small improvements. The budget estimate is conservative and the UI caps its suggested value at 500; a run ending at budget is explicitly truncated, not converged. Completing refinement means only the selected regions reached the requested step, not that all peaks or the global optimum were found.

Work is scheduled as *configuration × seed* tasks. All uncached candidates in one search level, and the original team plus every candidate during final validation, share one queue, so an idle worker takes the next task instead of waiting for the slowest seed of the current configuration. Results are still consumed in candidate order, which keeps history, curves and the chosen thresholds identical to one-at-a-time evaluation. The gain depends on the seed/thread layout: 16 seeds on 15 threads previously ran each evaluation as a full wave plus a one-seed wave (about 53% utilization). A seed count that is a multiple of the thread count gains nothing. Measured in headless Chromium (Pirate Cove T1, 6 seeds, 4 threads, 40 attempts, 20 evaluations): 31.6–32.0 s before and 25.1–25.3 s after; 16 seeds on 4 threads ran in 32.3 s and 32.4 s respectively.

The results chart plots threshold versus search ΔDPS with paired 95% intervals. Each selectable context fixes all other thresholds, so points from different team configurations are never connected as one curve. The search baseline is the draft at scan start; the final holdout baseline is the captured original team. Up to five distinct whole configurations are retained as exploratory alternatives and can be loaded into the draft for another simulation. Their search ranking is not independent validation. Full history records exact threshold vectors, evaluation IDs, fixed-coordinate contexts, comparisons and per-seed samples. Export works while running and after cancellation.

Runs survive closing the optimizer window and closing or reloading the page. While a run is active the window can be closed; the run continues and a badge next to the **Team Optimizer** button shows it. Each run is stored as a plan (settings, master seed, teams, resolved scan variables) plus every completed per-seed sample in the browser's IndexedDB. On the next page load an unfinished plan resumes automatically: the search is replayed with cached seeds served from storage, so it follows exactly the same path and only unfinished seeds are simulated. Prices are fetched again. Only **Stop Simulation** (or an error) ends a run for good. Finished, stopped and failed reports go to the **History** tab, which keeps the last 20; reopening the optimizer shows the latest one by default until history is cleared or a new run starts. A report loaded from history applies with that run's roster. Web Locks keep two tabs from resuming the same plan; on plain-HTTP LAN addresses browsers do not expose Web Locks, so opening two tabs there can run a resumed plan twice. Private windows and cleared site data lose history and checkpoints.

Parallel workers trade memory for throughput; neither scaling nor a safe memory limit is guaranteed. Node probes of this fixture showed 160–175 MB heap peaks and 11–14 MB surviving forced GC. These are workload/runtime observations, not per-browser-worker memory limits. The UI's 200 MB/worker estimate is rough guidance only; the slider still follows the CPU-derived limit with no additional memory cap.

Local Node-process measurements on a 16-core/32-thread machine (Pirate Cove T1, five players, 500 attempts per process) reached 18 attempts/s with one process, 111/s with eight, 148/s with sixteen, and 168/s with thirty-two under a 96 MB old-space limit. They show diminishing returns in that test, not a browser-versus-Node speed comparison. End-of-run process RSS is not peak RSS and cannot be multiplied to infer browser worker usage.

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
