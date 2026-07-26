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
