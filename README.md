# The Deeping

An endless, AI-narrated dungeon crawler built as a single-file React component.

## Features
- Infinite procedural descent across 7 rotating biomes (Caverns, Blighted Swamp, Molten Forge, Frozen Wastes, Sunken Ruins, Astral Rift, Bonewoven Reliquary), each with its own 8 enemies
- Turn-based combat against 1-3 enemies per encounter, weighted 24/24/24/24/1/1/1/1 common-to-rare
- Full gear system: weapons, armor, chestpieces, greaves, footwear, up to 3 rings, 2 earrings, throwables, and relic-slot ranged weapons (Handcannon, Bow)
- Free-action consumables: Health Potions, Greater Elixirs, Throwing Knives, Bullets, Arrows — none trigger enemy retaliation
- Collectible cabinet (Coins, Cards, Stamps, Figures, 50 each), each individually AI-named and locked in permanently once discovered
- Bestiary with per-enemy kill tracking and combat bonuses at 20/40/60 kills
- Permanent prestige system (Souls, earned on death) with five trees: Body Modifications, Stat Training, Combat Tricks, Ready or Not, and Better Merchant
- Maps (rare drop) opening Legendary Rifts with unique boss-tier enemies
- Character naming on a title screen, with a hidden easter egg for one particular name
- Persistent autosave via the host platform's key-value storage API

## Running this project
This component was built for the Claude.ai Artifacts environment, which provides:
1. A `window.storage` API (get/set/delete) for persistence — **this won't exist in a plain React app**
2. A live fetch to `https://api.anthropic.com/v1/messages` for AI narration and collectible naming — this call has no API key attached and relies on the Artifacts sandbox's backend proxy

To run this outside Claude.ai (e.g. as a standalone Vite/CRA app), you'll need to:
- Replace `window.storage.get/set/delete` calls with `localStorage`, IndexedDB, or your own backend
- Replace the `fetch('https://api.anthropic.com/v1/messages', ...)` calls with your own Claude API proxy (the Anthropic API requires a server-side API key — never expose one in client-side code)
- Install dependencies: `react`, `lucide-react`

## Dependencies
```
npm install react lucide-react
```

Tailwind CSS utility classes are used throughout for layout; the visual theme itself is implemented via the inline `<style>` block in `GlobalStyle()`, so Tailwind is only needed for spacing/flex/grid utilities.
