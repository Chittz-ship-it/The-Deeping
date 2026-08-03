import React, { useReducer, useEffect, useState, useRef } from 'react';
import {
  Flame, Heart, Shield, Sword, Coins, Sparkles, Package,
  ArrowDownCircle, Skull, Store, FlaskConical, HeartPulse, Star, Footprints,
  Gem, BookOpen, ArrowLeftRight, Compass
} from 'lucide-react';
import { installLocalStorageShim } from './storageShim';

// In Claude.ai's Artifacts sandbox, window.storage already exists and this
// is a no-op. In a standalone deploy (this Vite scaffold), it installs a
// localStorage-backed version with a matching async API.
installLocalStorageShim();

/* =========================================================
   MUSIC — procedurally synthesized medieval theme, no audio
   files. A panpipe-ish melody (sine fundamental + soft octave
   harmonic + light vibrato) over a sustained fifth drone
   (D3 + A3), in D Dorian for a heroic/adventurous modal feel.
========================================================= */

class MedievalMusicEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.started = false;
    this.muted = true;
    this.scheduledUntil = 0;
    this.timerId = null;
    this.stepIdx = 0;

    // D Dorian, D4 up to D5
    this.scale = [293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33];

    // A simple heroic phrase, as scale-degree indices (0 = D4, 7 = D5)
    this.melody =    [0, 2, 4, 5, 4, 2, 0, 2, 4, 5, 7, 5, 4, 2, 0, 0];
    this.durations = [0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.7, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.7, 0.7];
  }

  init() {
    if (this.started) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.started = true;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);
    this.startDrone();
    this.scheduledUntil = this.ctx.currentTime + 0.1;
    this.timerId = setInterval(() => this.scheduler(), 200);
  }

  startDrone() {
    const ctx = this.ctx;
    // D3 and A3 — a perfect fifth, the classic drone interval
    [{ freq: 146.83, target: 0.05 }, { freq: 220.0, target: 0.035 }].forEach(({ freq, target }, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 3);

      // very slow LFO so the drone breathes instead of sitting dead-static
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.015;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 1.2;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      osc.connect(gain).connect(this.masterGain);
      osc.start();
    });
  }

  playNote(freq, time, dur) {
    const ctx = this.ctx;

    const fundamental = ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.value = freq;

    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.value = freq * 2;

    // vibrato, fading in slightly after the note starts (like breath control)
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.4;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.setValueAtTime(0, time);
    vibratoGain.gain.linearRampToValueAtTime(3, time + 0.15);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(fundamental.frequency);
    vibratoGain.connect(harmonic.frequency);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = 0.16;

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(0.17, time + 0.07);
    envelope.gain.setValueAtTime(0.17, Math.max(time + 0.07, time + dur - 0.15));
    envelope.gain.linearRampToValueAtTime(0, time + dur);

    fundamental.connect(envelope);
    harmonic.connect(harmonicGain).connect(envelope);
    envelope.connect(this.masterGain);

    fundamental.start(time); fundamental.stop(time + dur + 0.05);
    harmonic.start(time); harmonic.stop(time + dur + 0.05);
    vibrato.start(time); vibrato.stop(time + dur + 0.05);
  }

  scheduler() {
    while (this.scheduledUntil < this.ctx.currentTime + 2) {
      const degree = this.melody[this.stepIdx % this.melody.length];
      const dur = this.durations[this.stepIdx % this.durations.length];
      this.playNote(this.scale[degree], this.scheduledUntil, dur * 0.92);
      this.scheduledUntil += dur;
      this.stepIdx++;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, this.ctx.currentTime + 0.3);
    }
  }
}

const musicEngine = new MedievalMusicEngine();

/* =========================================================
   SFX — short, procedurally synthesized combat sound cues.
   Same philosophy as the music engine: no audio files, just
   oscillators/noise shaped with envelopes and filters. Runs on
   its own AudioContext (unlocked on first tap anywhere) so it
   works independent of the music toggle.
========================================================= */

class SFXEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.enabled = true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const bufferSize = this.ctx.sampleRate * 0.6;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    return src;
  }

  // Sword clank — a noise transient (the "impact") plus two short
  // inharmonic metallic partials ringing out.
  clank() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const noise = this._noise();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2200;
    noiseFilter.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    noise.connect(noiseFilter).connect(noiseGain).connect(this.master);
    noise.start(t); noise.stop(t + 0.1);

    [1450, 2350].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22 - i * 0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + i * 0.05);
      osc.connect(gain).connect(this.master);
      osc.start(t); osc.stop(t + 0.25);
    });
  }

  // Whoosh — bandpass-filtered noise sweeping quickly downward. Played on dodge.
  whoosh() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = this._noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.28);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t); noise.stop(t + 0.32);
  }

  // Thud — low pitch-dropping sine plus a soft low-passed noise thump.
  // Played when an enemy's attack actually lands on the player.
  thud() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + 0.2);

    const noise = this._noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    noise.connect(filter).connect(noiseGain).connect(this.master);
    noise.start(t); noise.stop(t + 0.12);
  }

  // Crit ting — a bright rising ring layered on top of a strike.
  critTing() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(3400, t + 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + 0.22);
  }

  // Defeat crunch — a low-passed noise burst sweeping down. Played when an enemy falls.
  defeatCrunch() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const noise = this._noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(t); noise.stop(t + 0.4);
  }

  // Twang — a plucked, quickly pitch-dropping tone for thrown knives, the
  // handcannon, and the bow, so ranged hits feel distinct from melee clanks.
  twang() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + 0.16);
  }

  // Block — a single bright short ring for a fully-blocked/deflected attack
  // (Stoneskin) or a dodge-adjacent parry moment.
  block() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + 0.17);
  }

  // Level up — a quick three-note ascending chime.
  levelUp() {
    if (!this.enabled) return;
    this.ensureCtx();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const start = t + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain).connect(this.master);
      osc.start(start); osc.stop(start + 0.28);
    });
  }
}

const sfxEngine = new SFXEngine();


/* =========================================================
   DATA
========================================================= */

const GAME_VERSION = '1.20';

const BIOMES = [
  { name: 'The Caverns', desc: 'damp limestone tunnels veined with old roots and dripping water' },
  { name: 'The Blighted Swamp', desc: 'a fetid mire choked with rot, fog, and whispering reeds' },
  { name: 'The Molten Forge', desc: 'cracked obsidian halls glowing with rivers of magma' },
  { name: 'The Frozen Wastes', desc: 'a howling expanse of ice, wind, and bone-pale snow' },
  { name: 'The Sunken Ruins', desc: 'flooded marble halls of a drowned civilization, lit by bioluminescent rot' },
  { name: 'The Astral Rift', desc: 'a fractured non-space of drifting stars, broken geometry, and silence between heartbeats' },
  { name: 'The Bonewoven Reliquary', desc: 'an ossuary cathedral of fused skeletal architecture, lit by candles that never gutter out' },
  { name: 'The Shattered Meridian', desc: 'a plane of broken mirrors and refracted light where reality splinters at every angle' },
  { name: 'The Verdant Tomb',       desc: 'a vast burial ground swallowed by jungle, where the roots have grown through the dead and kept them moving' },
  { name: 'The Obsidian Maw',       desc: 'a lightless throat of black glass where sound and hope both die quickly' },
  { name: 'The Hollow Choir',       desc: 'a vast amphitheater of the dead, singing a hymn that never resolves' },
  { name: 'The Clockwork Abyss',    desc: 'an infinite brass gearworks grinding down eternity itself, filled with the ceaseless tick of hours that already ended' },
  { name: 'The Withered Bazaar',    desc: 'an abandoned marketplace of the dead, where phantom merchants still haggle over wares that turned to dust centuries ago' },
  { name: 'The Ashen Coliseum',     desc: 'a ruined gladiatorial arena of ash and bone, where the roar of a vanished crowd still echoes through every empty seat' },
  { name: 'The Gilded Vault',       desc: 'an ancient vault of hoarded gold and jewels, guarded by constructs that have long forgotten what wealth was even for' },
  { name: 'The Weeping Orchard',    desc: 'an endless orchard of black-barked trees that weep amber sap like tears, their fruit forever unripe and forever falling' },
  { name: 'The Screaming Peaks',    desc: 'windswept summits where the air itself howls with the voices of every climber who never made it down' },
  { name: 'The Sable Dunes',        desc: 'an endless black-sand desert where sandstorms never stop screaming and the dunes shift to swallow whatever crosses them' },
  { name: 'The Drowned Menagerie', desc: 'a flooded royal menagerie where the beasts were never freed, and the rising water taught them all to hunt in the dark' },
  { name: 'The Static Fields', desc: 'a storm-scarred wasteland where lightning never stops striking the same barren ground, and the air itself hums with a charge that never discharges' },
  { name: 'The Ivory Spire', desc: 'an impossibly tall tower of bone-white marble spiraling upward into a darkness that should be a ceiling and isn\'t, home to scholars who climbed too far to come back down' },
  { name: 'The Rusted Graveyard', desc: 'a boneyard of colossal war machines left to rust where they finally stopped moving, their broken hulls still twitching with whatever passed for life in them' },
  { name: 'The Velvet Court', desc: 'a decaying ballroom of moth-eaten velvet and cracked gilt mirrors, where a masquerade that ended centuries ago has never quite been told to stop' },
  { name: 'The Crystal Expanse', desc: 'a cavern of towering prismatic crystal that hums a single unbroken chord, growing louder and sharper the longer anything living stays to listen' },
  { name: 'The Forgotten Carnival', desc: 'a rusted funfair frozen mid-performance, its carousel still turning, its funhouse mirrors still laughing at nothing, its lights still burning for a crowd that left generations ago' },
  { name: 'The Iron Oubliette', desc: 'a forgotten prison of rusted iron cages stacked into the dark, its wardens still patrolling cells that emptied out long before the locks did' },
  { name: 'The Alchemist\'s Ruin', desc: 'a shattered laboratory of cracked retorts and spilled reagents, where failed experiments still twitch in their broken jars and the air itself reeks of transmutation gone wrong' },
  { name: 'The Siren\'s Coast', desc: 'an impossible underground coastline of black rock and shipwrecks, where the tide never goes out and something is always singing just beneath the waves' },
  { name: 'The Salt Cathedral', desc: 'a vast underground sea long since evaporated, leaving cathedral spires of salt and the pilgrims who never left' },
  { name: 'The Cinder Archive', desc: 'an underground library that has been quietly burning for centuries, its shelves ash and its librarians still cataloguing the smoke' },
  { name: 'The Marrow Fen', desc: 'a bog of bleached bone-silt and standing black water, where the dead sink slowly and never quite finish sinking' },
  { name: 'The Inverted Garden', desc: 'an impossible garden growing downward from a ceiling that shouldn\'t exist, its blossoms falling upward into the dark' },
  { name: 'The Wax Necropolis', desc: 'a labyrinth of tombs sealed in dripping candle wax, where mourners have melted into the very monuments they built' },
  { name: 'The Splintered Armory', desc: 'an armory shattered by whatever war ended here, its weapons still sharp, still waiting, still half-convinced the war isn\'t over' },
  { name: 'The Bellfounder\'s Hollow', desc: 'a vast foundry cavern dominated by a single, impossibly large bell that has been tolling, unheard, for longer than memory' },
  { name: 'The Paper Labyrinth', desc: 'an endless maze of towering filing cabinets and drifting loose pages, where bureaucrats still process a census no one is left to count' },
  { name: 'The Threadbare Loom', desc: 'an immense weaving hall where skeletal looms clatter endlessly, threading fabric out of hair, cobweb, and quieter things' },
  { name: 'The Stained Sanctum', desc: 'a shattered cathedral of stained glass, its windows depicting scenes that shift and rearrange themselves when no one is looking' },
];

function currentBiome(depth) {
  return Math.floor((depth - 1) / 10) % BIOMES.length;
}

// Per-biome ambient theming — CSS only, no image assets, to match the game's
// existing emoji/CSS visual language. BIOME_ACCENT is the "true color" of
// each biome; BIOME_BACKGROUNDS derives a background gradient from it. Note:
// most of the screen is covered by opaque dc-panel surfaces (by design, for
// legibility), so the gradient itself is only visible in the header area,
// footer, and the thin gaps between panels — which made it hard to notice.
// To make the biome change unmistakable regardless of panel coverage, a
// slim glowing accent strip (using BIOME_ACCENT directly) is rendered right
// under the header, in the one screen region that's never covered by a panel.
const BIOME_ACCENT = [
  '#5a9a5e', // 0 The Caverns — mossy green
  '#7a8a3a', // 1 The Blighted Swamp — sickly olive
  '#e8623d', // 2 The Molten Forge — ember orange
  '#5ec9e8', // 3 The Frozen Wastes — icy cyan
  '#3fb8a8', // 4 The Sunken Ruins — drowned teal
  '#9b6fe8', // 5 The Astral Rift — deep violet
  '#e8b24d', // 6 The Bonewoven Reliquary — candlelit amber
  '#7d8ce8', // 7 The Shattered Meridian — mirror blue-violet
  '#6bbf4d', // 8 The Verdant Tomb — jungle green
  '#8a5de8', // 9 The Obsidian Maw — void violet
  '#b98ee0', // 10 The Hollow Choir — pale violet-grey
  '#d4a24d', // 11 The Clockwork Abyss — brass/bronze
  '#c9a15e', // 12 The Withered Bazaar — dusty gold
  '#b85c3e', // 13 The Ashen Coliseum — ashen rust
  '#e6c229', // 14 The Gilded Vault — vivid hoarded gold
  '#c9862e', // 15 The Weeping Orchard — amber sap
  '#6b8299', // 16 The Screaming Peaks — windswept stone-blue
  '#8a7355', // 17 The Sable Dunes — dusty sand taupe
  '#3f7a8a', // 18 The Drowned Menagerie
  '#c9d94a', // 19 The Static Fields
  '#e8e2d0', // 20 The Ivory Spire
  '#8a5a3d', // 21 The Rusted Graveyard
  '#7a3d5c', // 22 The Velvet Court
  '#7ee8d9', // 23 The Crystal Expanse
  '#d94a8a', // 24 The Forgotten Carnival
  '#5a5a6e', // 25 The Iron Oubliette
  '#5ec97a', // 26 The Alchemist's Ruin
  '#2e6b7a', // 27 The Siren's Coast
  '#c4c8d4', // 28 The Salt Cathedral
  '#5c3a2e', // 29 The Cinder Archive
  '#8a9e8a', // 30 The Marrow Fen
  '#c74d9e', // 31 The Inverted Garden
  '#d9b45c', // 32 The Wax Necropolis
  '#9e3f3f', // 33 The Splintered Armory
  '#8a7a4a', // 34 The Bellfounder's Hollow
  '#c9b896', // 35 The Paper Labyrinth
  '#a45c8a', // 36 The Threadbare Loom
  '#4a7ac9', // 37 The Stained Sanctum
];

const BIOME_BACKGROUNDS = BIOME_ACCENT.map(
  hex => `radial-gradient(ellipse 150% 100% at 50% -15%, ${hex}3d 0%, #14151b 60%)`
);

const ENEMY_TYPES = [
  // --- Biome 0: The Caverns ---
  { id: 'goblin',   name: 'Goblin Scrapper', rarity: 'common', weight: 24, hp: 18, atk: 4,  def: 1, xpBase: 8,  goldMin: 3,  goldMax: 7,  emoji: '👺', biome: 0 },
  { id: 'rat',      name: 'Cave Rat Swarm',  rarity: 'common', weight: 24, hp: 14, atk: 5,  def: 0, xpBase: 7,  goldMin: 2,  goldMax: 6,  emoji: '🐀', biome: 0 },
  { id: 'skeleton', name: 'Skeleton Grunt',  rarity: 'common', weight: 24, hp: 22, atk: 5,  def: 2, xpBase: 10, goldMin: 4,  goldMax: 8,  emoji: '💀', biome: 0 },
  { id: 'bandit',   name: 'Bandit Thug',     rarity: 'common', weight: 24, hp: 20, atk: 6,  def: 1, xpBase: 9,  goldMin: 5,  goldMax: 10, emoji: '🥷', biome: 0 },
  { id: 'drake',    name: 'Crimson Drake',   rarity: 'rare',   weight: 1,  hp: 60, atk: 12, def: 4, xpBase: 50, goldMin: 30, goldMax: 60, emoji: '🐉', biome: 0 },
  { id: 'wraith',   name: 'Shadow Wraith',   rarity: 'rare',   weight: 1,  hp: 45, atk: 14, def: 2, xpBase: 55, goldMin: 25, goldMax: 50, emoji: '👻', biome: 0 },
  { id: 'golem',    name: 'Iron Golem',      rarity: 'rare',   weight: 1,  hp: 80, atk: 8,  def: 8, xpBase: 60, goldMin: 35, goldMax: 70, emoji: '🗿', biome: 0 },
  { id: 'lich',     name: 'Lich Acolyte',    rarity: 'rare',   weight: 1,  hp: 50, atk: 13, def: 3, xpBase: 58, goldMin: 30, goldMax: 65, emoji: '🧙', biome: 0 },

  // --- Biome 1: The Blighted Swamp ---
  { id: 'cultist',  name: 'Cultist Acolyte', rarity: 'common', weight: 24, hp: 20, atk: 7,  def: 1, xpBase: 11, goldMin: 5,  goldMax: 9,  emoji: '🕯️', biome: 1 },
  { id: 'wolf',     name: 'Feral Wolf',      rarity: 'common', weight: 24, hp: 19, atk: 7,  def: 1, xpBase: 11, goldMin: 4,  goldMax: 9,  emoji: '🐺', biome: 1 },
  { id: 'orc',      name: 'Orc Marauder',    rarity: 'common', weight: 24, hp: 26, atk: 7,  def: 2, xpBase: 12, goldMin: 6,  goldMax: 11, emoji: '👹', biome: 1 },
  { id: 'stalker',  name: 'Swamp Stalker',   rarity: 'common', weight: 24, hp: 21, atk: 6,  def: 2, xpBase: 11, goldMin: 5,  goldMax: 10, emoji: '🦎', biome: 1 },
  { id: 'wyrm',     name: 'Frost Wyrm',      rarity: 'rare',   weight: 1,  hp: 65, atk: 13, def: 5, xpBase: 62, goldMin: 35, goldMax: 65, emoji: '🐲', biome: 1 },
  { id: 'vampire',  name: 'Vampire Count',   rarity: 'rare',   weight: 1,  hp: 55, atk: 15, def: 3, xpBase: 65, goldMin: 30, goldMax: 60, emoji: '🧛', biome: 1 },
  { id: 'abyssal',  name: 'Abyssal Horror',  rarity: 'rare',   weight: 1,  hp: 75, atk: 11, def: 6, xpBase: 64, goldMin: 35, goldMax: 70, emoji: '🐙', biome: 1 },
  { id: 'tyrant',   name: 'Bone Tyrant',     rarity: 'rare',   weight: 1,  hp: 70, atk: 12, def: 5, xpBase: 63, goldMin: 35, goldMax: 68, emoji: '☠️', biome: 1 },

  // --- Biome 2: The Molten Forge ---
  { id: 'magma_slime',  name: 'Magma Slime',     rarity: 'common', weight: 24, hp: 24, atk: 8,  def: 2, xpBase: 13, goldMin: 6,  goldMax: 12, emoji: '🔥', biome: 2 },
  { id: 'cinder_wretch',name: 'Cinder Wretch',   rarity: 'common', weight: 24, hp: 23, atk: 8,  def: 1, xpBase: 13, goldMin: 5,  goldMax: 11, emoji: '😈', biome: 2 },
  { id: 'ash_ghoul',    name: 'Ash Ghoul',       rarity: 'common', weight: 24, hp: 27, atk: 8,  def: 3, xpBase: 14, goldMin: 7,  goldMax: 13, emoji: '🧟', biome: 2 },
  { id: 'ember_stalker',name: 'Ember Stalker',   rarity: 'common', weight: 24, hp: 25, atk: 9,  def: 2, xpBase: 14, goldMin: 6,  goldMax: 12, emoji: '🦂', biome: 2 },
  { id: 'molten_behemoth', name: 'Molten Behemoth', rarity: 'rare', weight: 1, hp: 90, atk: 16, def: 7, xpBase: 75, goldMin: 45, goldMax: 80, emoji: '🌋', biome: 2 },
  { id: 'cinderwing_roc',  name: 'Cinderwing Roc',  rarity: 'rare', weight: 1, hp: 80, atk: 17, def: 5, xpBase: 78, goldMin: 45, goldMax: 85, emoji: '🦅', biome: 2 },
  { id: 'voidforged_golem',name: 'Voidforged Golem',rarity: 'rare', weight: 1, hp: 95, atk: 14, def: 9, xpBase: 80, goldMin: 50, goldMax: 90, emoji: '🤖', biome: 2 },
  { id: 'ashen_lichking',  name: 'Ashen Lich King', rarity: 'rare', weight: 1, hp: 85, atk: 16, def: 6, xpBase: 82, goldMin: 48, goldMax: 88, emoji: '👑', biome: 2 },

  // --- Biome 3: The Frozen Wastes ---
  { id: 'frost_imp',     name: 'Frost Imp',         rarity: 'common', weight: 24, hp: 28, atk: 9,  def: 2, xpBase: 15, goldMin: 7,  goldMax: 13, emoji: '❄️', biome: 3 },
  { id: 'glacier_wisp',  name: 'Glacier Wisp',      rarity: 'common', weight: 24, hp: 26, atk: 9,  def: 2, xpBase: 15, goldMin: 6,  goldMax: 12, emoji: '🧊', biome: 3 },
  { id: 'permafrost_crawler', name: 'Permafrost Crawler', rarity: 'common', weight: 24, hp: 31, atk: 9, def: 4, xpBase: 16, goldMin: 7, goldMax: 14, emoji: '🦭', biome: 3 },
  { id: 'snowveil_stalker', name: 'Snowveil Stalker', rarity: 'common', weight: 24, hp: 29, atk: 10, def: 3, xpBase: 16, goldMin: 7, goldMax: 13, emoji: '🐧', biome: 3 },
  { id: 'glacial_titan', name: 'Glacial Titan',     rarity: 'rare', weight: 1, hp: 100, atk: 18, def: 8,  xpBase: 85, goldMin: 50, goldMax: 95, emoji: '🥶', biome: 3 },
  { id: 'frost_mammoth', name: 'Frost Mammoth',     rarity: 'rare', weight: 1, hp: 110, atk: 16, def: 10, xpBase: 88, goldMin: 52, goldMax: 98, emoji: '🦣', biome: 3 },
  { id: 'rime_sorceress',name: 'Rime Sorceress',    rarity: 'rare', weight: 1, hp: 88,  atk: 19, def: 5,  xpBase: 90, goldMin: 50, goldMax: 95, emoji: '⛄', biome: 3 },
  { id: 'blizzard_wraith', name: 'Blizzard Wraith', rarity: 'rare', weight: 1, hp: 92,  atk: 20, def: 6,  xpBase: 92, goldMin: 52, goldMax: 98, emoji: '🌨️', biome: 3 },

  // --- Biome 4: The Sunken Ruins ---
  { id: 'drowned_thrall',  name: 'Drowned Thrall',    rarity: 'common', weight: 24, hp: 33, atk: 10, def: 3, xpBase: 17, goldMin: 8, goldMax: 15, emoji: '🫧', biome: 4 },
  { id: 'coral_lurker',    name: 'Coral Lurker',      rarity: 'common', weight: 24, hp: 31, atk: 11, def: 2, xpBase: 17, goldMin: 7, goldMax: 14, emoji: '🐡', biome: 4 },
  { id: 'silt_revenant',   name: 'Silt Revenant',     rarity: 'common', weight: 24, hp: 35, atk: 10, def: 4, xpBase: 18, goldMin: 8, goldMax: 15, emoji: '🦑', biome: 4 },
  { id: 'tide_cultist',    name: 'Tide Cultist',      rarity: 'common', weight: 24, hp: 32, atk: 11, def: 3, xpBase: 18, goldMin: 8, goldMax: 14, emoji: '🐚', biome: 4 },
  { id: 'leviathan_spawn', name: 'Leviathan Spawn',   rarity: 'rare',   weight: 1,  hp: 115, atk: 20, def: 9,  xpBase: 95,  goldMin: 55, goldMax: 100, emoji: '🐋', biome: 4 },
  { id: 'drowned_monarch', name: 'Drowned Monarch',   rarity: 'rare',   weight: 1,  hp: 105, atk: 22, def: 7,  xpBase: 98,  goldMin: 55, goldMax: 102, emoji: '👸', biome: 4 },
  { id: 'abyss_kraken',    name: 'Abyss Kraken',      rarity: 'rare',   weight: 1,  hp: 120, atk: 19, def: 10, xpBase: 100, goldMin: 58, goldMax: 105, emoji: '🦈', biome: 4 },
  { id: 'sunken_god',      name: 'Sunken God-Idol',   rarity: 'rare',   weight: 1,  hp: 125, atk: 21, def: 8,  xpBase: 102, goldMin: 58, goldMax: 108, emoji: '🔱', biome: 4 },

  // --- Biome 5: The Astral Rift ---
  { id: 'starveiled_wisp',  name: 'Starveiled Wisp',    rarity: 'common', weight: 24, hp: 37, atk: 12, def: 3, xpBase: 19, goldMin: 9,  goldMax: 16, emoji: '✨', biome: 5 },
  { id: 'fractal_horror',   name: 'Fractal Horror',     rarity: 'common', weight: 24, hp: 39, atk: 12, def: 4, xpBase: 19, goldMin: 9,  goldMax: 16, emoji: '🌀', biome: 5 },
  { id: 'voidling',         name: 'Voidling',           rarity: 'common', weight: 24, hp: 36, atk: 13, def: 3, xpBase: 20, goldMin: 9,  goldMax: 17, emoji: '🕳️', biome: 5 },
  { id: 'null_seraph',      name: 'Null Seraph',        rarity: 'common', weight: 24, hp: 40, atk: 12, def: 5, xpBase: 20, goldMin: 10, goldMax: 17, emoji: '🪽', biome: 5 },
  { id: 'starcollapse_maw', name: 'Starcollapse Maw',   rarity: 'rare',   weight: 1,  hp: 130, atk: 23, def: 10, xpBase: 108, goldMin: 60, goldMax: 112, emoji: '🌑', biome: 5 },
  { id: 'entropy_weaver',   name: 'Entropy Weaver',     rarity: 'rare',   weight: 1,  hp: 122, atk: 25, def: 8,  xpBase: 110, goldMin: 60, goldMax: 115, emoji: '🕷️', biome: 5 },
  { id: 'astral_devourer',  name: 'Astral Devourer',    rarity: 'rare',   weight: 1,  hp: 135, atk: 22, def: 11, xpBase: 112, goldMin: 62, goldMax: 118, emoji: '👁️', biome: 5 },
  { id: 'eclipse_monarch',  name: 'Eclipse Monarch',    rarity: 'rare',   weight: 1,  hp: 128, atk: 24, def: 9,  xpBase: 114, goldMin: 62, goldMax: 120, emoji: '🌒', biome: 5 },

  // --- Biome 6: The Bonewoven Reliquary ---
  { id: 'ossuary_acolyte',  name: 'Ossuary Acolyte',    rarity: 'common', weight: 24, hp: 42, atk: 14, def: 4, xpBase: 22, goldMin: 10, goldMax: 18, emoji: '🦴', biome: 6 },
  { id: 'reliquary_warden', name: 'Reliquary Warden',   rarity: 'common', weight: 24, hp: 45, atk: 13, def: 6, xpBase: 22, goldMin: 10, goldMax: 18, emoji: '⚰️', biome: 6 },
  { id: 'candlewax_ghost',  name: 'Candlewax Ghost',    rarity: 'common', weight: 24, hp: 40, atk: 15, def: 3, xpBase: 23, goldMin: 11, goldMax: 19, emoji: '🪔', biome: 6 },
  { id: 'bone_chorister',   name: 'Bone Chorister',     rarity: 'common', weight: 24, hp: 43, atk: 14, def: 5, xpBase: 23, goldMin: 11, goldMax: 19, emoji: '🦷', biome: 6 },
  { id: 'sepulcher_titan',  name: 'Sepulcher Titan',    rarity: 'rare',   weight: 1,  hp: 145, atk: 26, def: 12, xpBase: 120, goldMin: 65, goldMax: 125, emoji: '🪦', biome: 6 },
  { id: 'reliquary_seraph', name: 'Reliquary Seraph',   rarity: 'rare',   weight: 1,  hp: 138, atk: 28, def: 10, xpBase: 122, goldMin: 65, goldMax: 128, emoji: '😇', biome: 6 },
  { id: 'osteomancer',      name: 'Osteomancer',        rarity: 'rare',   weight: 1,  hp: 140, atk: 27, def: 11, xpBase: 124, goldMin: 66, goldMax: 130, emoji: '🔮', biome: 6 },
  { id: 'undying_curator',  name: 'Undying Curator',    rarity: 'rare',   weight: 1,  hp: 150, atk: 25, def: 13, xpBase: 126, goldMin: 68, goldMax: 132, emoji: '🏺', biome: 6 },

  // --- Biome 7: The Shattered Meridian ---
  { id: 'glasswing_stalker',  name: 'Glasswing Stalker',   rarity: 'common', weight: 24, hp: 47, atk: 16, def: 4, xpBase: 24, goldMin: 11, goldMax: 20, emoji: '🦋', biome: 7 },
  { id: 'mirrorborn_wraith',  name: 'Mirrorborn Wraith',   rarity: 'common', weight: 24, hp: 44, atk: 17, def: 3, xpBase: 24, goldMin: 11, goldMax: 20, emoji: '🪞', biome: 7 },
  { id: 'prism_horror',       name: 'Prism Horror',        rarity: 'common', weight: 24, hp: 50, atk: 15, def: 6, xpBase: 25, goldMin: 12, goldMax: 21, emoji: '💎', biome: 7 },
  { id: 'shard_golem',        name: 'Shard Golem',         rarity: 'common', weight: 24, hp: 52, atk: 14, def: 8, xpBase: 25, goldMin: 12, goldMax: 21, emoji: '🔷', biome: 7 },
  { id: 'refraction_titan',   name: 'Refraction Titan',    rarity: 'rare',   weight: 1,  hp: 165, atk: 29, def: 14, xpBase: 132, goldMin: 70, goldMax: 138, emoji: '🌈', biome: 7 },
  { id: 'meridian_sovereign', name: 'Meridian Sovereign',  rarity: 'rare',   weight: 1,  hp: 158, atk: 31, def: 12, xpBase: 135, goldMin: 72, goldMax: 140, emoji: '💠', biome: 7 },
  { id: 'null_reflection',    name: 'Null Reflection',     rarity: 'rare',   weight: 1,  hp: 160, atk: 30, def: 13, xpBase: 134, goldMin: 70, goldMax: 138, emoji: '⬛', biome: 7 },
  { id: 'fractured_god',      name: 'Fractured God',       rarity: 'rare',   weight: 1,  hp: 172, atk: 28, def: 15, xpBase: 138, goldMin: 74, goldMax: 142, emoji: '⚡', biome: 7 },

  // --- Biome 8: The Verdant Tomb ---
  { id: 'moss_revenant',     name: 'Moss Revenant',       rarity: 'common', weight: 24, hp: 57, atk: 18, def: 5, xpBase: 27, goldMin: 13, goldMax: 23, emoji: '🌿', biome: 8 },
  { id: 'spore_wraith',      name: 'Spore Wraith',        rarity: 'common', weight: 24, hp: 54, atk: 19, def: 4, xpBase: 27, goldMin: 13, goldMax: 23, emoji: '🍄', biome: 8 },
  { id: 'thornbound_horror', name: 'Thornbound Horror',   rarity: 'common', weight: 24, hp: 60, atk: 17, def: 7, xpBase: 28, goldMin: 14, goldMax: 24, emoji: '🌵', biome: 8 },
  { id: 'burial_bloom',      name: 'Burial Bloom',        rarity: 'common', weight: 24, hp: 58, atk: 18, def: 6, xpBase: 28, goldMin: 14, goldMax: 24, emoji: '🌸', biome: 8 },
  { id: 'root_titan',        name: 'Root Titan',          rarity: 'rare',   weight: 1,  hp: 185, atk: 33, def: 16, xpBase: 145, goldMin: 78, goldMax: 150, emoji: '🌳', biome: 8 },
  { id: 'tomb_empress',      name: 'Tomb Empress',        rarity: 'rare',   weight: 1,  hp: 178, atk: 35, def: 14, xpBase: 148, goldMin: 80, goldMax: 155, emoji: '🪷', biome: 8 },
  { id: 'verdant_lich',      name: 'Verdant Lich',        rarity: 'rare',   weight: 1,  hp: 182, atk: 34, def: 15, xpBase: 147, goldMin: 79, goldMax: 152, emoji: '🥀', biome: 8 },
  { id: 'the_overgrowth',    name: 'The Overgrowth',      rarity: 'rare',   weight: 1,  hp: 195, atk: 32, def: 17, xpBase: 150, goldMin: 82, goldMax: 158, emoji: '🌾', biome: 8 },

  // --- Biome 9: The Obsidian Maw ---
  { id: 'obsidian_wretch',    name: 'Obsidian Wretch',    rarity: 'common', weight: 24, hp: 66,  atk: 20, def: 6,  xpBase: 30, goldMin: 14, goldMax: 25, emoji: '🖤', biome: 9 },
  { id: 'glasswrought_husk',  name: 'Glasswrought Husk',  rarity: 'common', weight: 24, hp: 70,  atk: 19, def: 8,  xpBase: 30, goldMin: 14, goldMax: 25, emoji: '🩸', biome: 9 },
  { id: 'maw_crawler',        name: 'Maw Crawler',        rarity: 'common', weight: 24, hp: 64,  atk: 22, def: 5,  xpBase: 31, goldMin: 15, goldMax: 26, emoji: '🐛', biome: 9 },
  { id: 'starless_stalker',   name: 'Starless Stalker',   rarity: 'common', weight: 24, hp: 68,  atk: 21, def: 7,  xpBase: 31, goldMin: 15, goldMax: 26, emoji: '⚫', biome: 9 },
  { id: 'obsidian_colossus',  name: 'Obsidian Colossus',  rarity: 'rare',   weight: 1,  hp: 210, atk: 36, def: 18, xpBase: 160, goldMin: 88, goldMax: 165, emoji: '⛰️', biome: 9 },
  { id: 'maw_sovereign',      name: 'Maw Sovereign',      rarity: 'rare',   weight: 1,  hp: 220, atk: 38, def: 17, xpBase: 165, goldMin: 90, goldMax: 170, emoji: '🌘', biome: 9 },
  { id: 'voidglass_wyrm',     name: 'Voidglass Wyrm',     rarity: 'rare',   weight: 1,  hp: 225, atk: 37, def: 19, xpBase: 167, goldMin: 90, goldMax: 170, emoji: '🐍', biome: 9 },
  { id: 'the_last_light',     name: 'The Last Light',     rarity: 'rare',   weight: 1,  hp: 230, atk: 39, def: 20, xpBase: 170, goldMin: 92, goldMax: 175, emoji: '💫', biome: 9 },

  // --- Biome 10: The Hollow Choir ---
  { id: 'choir_wraith',      name: 'Choir Wraith',       rarity: 'common', weight: 24, hp: 78,  atk: 23, def: 8,  xpBase: 34, goldMin: 17, goldMax: 29, emoji: '🫥', biome: 10 },
  { id: 'hollow_cantor',     name: 'Hollow Cantor',      rarity: 'common', weight: 24, hp: 75,  atk: 24, def: 7,  xpBase: 34, goldMin: 17, goldMax: 29, emoji: '🗣️', biome: 10 },
  { id: 'dirge_revenant',    name: 'Dirge Revenant',     rarity: 'common', weight: 24, hp: 80,  atk: 22, def: 10, xpBase: 35, goldMin: 18, goldMax: 30, emoji: '⚱️', biome: 10 },
  { id: 'silent_hymnal',     name: 'Silent Hymnal',      rarity: 'common', weight: 24, hp: 77,  atk: 25, def: 8,  xpBase: 35, goldMin: 18, goldMax: 30, emoji: '📜', biome: 10 },
  { id: 'choir_of_bones',    name: 'Choir of Bones',     rarity: 'rare',   weight: 1,  hp: 250, atk: 41, def: 22, xpBase: 180, goldMin: 100, goldMax: 185, emoji: '🩻', biome: 10 },
  { id: 'the_conductor',     name: 'The Conductor',      rarity: 'rare',   weight: 1,  hp: 260, atk: 43, def: 21, xpBase: 185, goldMin: 105, goldMax: 188, emoji: '🎼', biome: 10 },
  { id: 'requiem_titan',     name: 'Requiem Titan',      rarity: 'rare',   weight: 1,  hp: 270, atk: 42, def: 24, xpBase: 188, goldMin: 108, goldMax: 190, emoji: '🔔', biome: 10 },
  { id: 'the_unsung',        name: 'The Unsung',         rarity: 'rare',   weight: 1,  hp: 255, atk: 44, def: 23, xpBase: 190, goldMin: 110, goldMax: 190, emoji: '🎶', biome: 10 },

  // --- Biome 11: The Clockwork Abyss ---
  { id: 'gearbound_wretch',    name: 'Gearbound Wretch',     rarity: 'common', weight: 24, hp: 84,  atk: 26, def: 11, xpBase: 36, goldMin: 18,  goldMax: 30,  emoji: '⚙️', biome: 11 },
  { id: 'ticking_horror',      name: 'Ticking Horror',       rarity: 'common', weight: 24, hp: 80,  atk: 27, def: 10, xpBase: 36, goldMin: 18,  goldMax: 30,  emoji: '⏰', biome: 11 },
  { id: 'brass_sentinel',      name: 'Brass Sentinel',       rarity: 'common', weight: 24, hp: 88,  atk: 25, def: 13, xpBase: 37, goldMin: 19,  goldMax: 31,  emoji: '🔩', biome: 11 },
  { id: 'chainwrought_stalker',name: 'Chain-Wrought Stalker',rarity: 'common', weight: 24, hp: 82,  atk: 28, def: 11, xpBase: 37, goldMin: 19,  goldMax: 31,  emoji: '⛓️', biome: 11 },
  { id: 'grand_escapement',    name: 'The Grand Escapement', rarity: 'rare',   weight: 1,  hp: 280, atk: 45, def: 25, xpBase: 195, goldMin: 115, goldMax: 195, emoji: '⏱️', biome: 11 },
  { id: 'clockwork_sovereign', name: 'Clockwork Sovereign',  rarity: 'rare',   weight: 1,  hp: 290, atk: 47, def: 24, xpBase: 198, goldMin: 118, goldMax: 198, emoji: '🧿', biome: 11 },
  { id: 'entropy_engine',      name: 'Entropy Engine',       rarity: 'rare',   weight: 1,  hp: 295, atk: 46, def: 26, xpBase: 200, goldMin: 120, goldMax: 200, emoji: '🧲', biome: 11 },
  { id: 'the_last_hour',       name: 'The Last Hour',        rarity: 'rare',   weight: 1,  hp: 300, atk: 48, def: 27, xpBase: 205, goldMin: 122, goldMax: 205, emoji: '🪛', biome: 11 },

  // --- Biome 12: The Withered Bazaar ---
  { id: 'husk_peddler',         name: 'Husk Peddler',          rarity: 'common', weight: 24, hp: 90,  atk: 29, def: 13, xpBase: 39,  goldMin: 20,  goldMax: 33,  emoji: '🏮', biome: 12 },
  { id: 'phantom_haggler',      name: 'Phantom Haggler',       rarity: 'common', weight: 24, hp: 88,  atk: 30, def: 12, xpBase: 39,  goldMin: 20,  goldMax: 33,  emoji: '🛍️', biome: 12 },
  { id: 'coinless_wraith',      name: 'Coinless Wraith',       rarity: 'common', weight: 24, hp: 93,  atk: 28, def: 14, xpBase: 40,  goldMin: 21,  goldMax: 34,  emoji: '👛', biome: 12 },
  { id: 'tattered_auctioneer',  name: 'Tattered Auctioneer',   rarity: 'common', weight: 24, hp: 91,  atk: 31, def: 13, xpBase: 40,  goldMin: 21,  goldMax: 34,  emoji: '📯', biome: 12 },
  { id: 'eternal_auctioneer',   name: 'The Eternal Auctioneer',rarity: 'rare',   weight: 1,  hp: 305, atk: 49, def: 27, xpBase: 208, goldMin: 125, goldMax: 208, emoji: '🥁', biome: 12 },
  { id: 'market_ghost_sovereign', name: 'Market-Ghost Sovereign', rarity: 'rare', weight: 1, hp: 315, atk: 50, def: 28, xpBase: 212, goldMin: 128, goldMax: 212, emoji: '🪆', biome: 12 },
  { id: 'the_last_customer',    name: 'The Last Customer',     rarity: 'rare',   weight: 1,  hp: 310, atk: 51, def: 27, xpBase: 210, goldMin: 126, goldMax: 210, emoji: '🛒', biome: 12 },
  { id: 'bazaar_devourer',      name: 'Bazaar-Devourer',       rarity: 'rare',   weight: 1,  hp: 325, atk: 52, def: 29, xpBase: 218, goldMin: 132, goldMax: 218, emoji: '🕸️', biome: 12 },

  // --- Biome 13: The Ashen Coliseum ---
  { id: 'ashbound_gladiator', name: 'Ashbound Gladiator', rarity: 'common', weight: 24, hp: 98,  atk: 32, def: 14, xpBase: 42,  goldMin: 22,  goldMax: 35,  emoji: '🥊', biome: 13 },
  { id: 'bonepit_wrestler',   name: 'Bone-Pit Wrestler',  rarity: 'common', weight: 24, hp: 95,  atk: 33, def: 13, xpBase: 42,  goldMin: 22,  goldMax: 35,  emoji: '🤼', biome: 13 },
  { id: 'arena_wraith',       name: 'Arena Wraith',       rarity: 'common', weight: 24, hp: 101, atk: 31, def: 15, xpBase: 43,  goldMin: 23,  goldMax: 36,  emoji: '🥇', biome: 13 },
  { id: 'cindered_champion',  name: 'Cindered Champion',  rarity: 'common', weight: 24, hp: 99,  atk: 34, def: 14, xpBase: 43,  goldMin: 23,  goldMax: 36,  emoji: '🏵️', biome: 13 },
  { id: 'the_undefeated',     name: 'The Undefeated',     rarity: 'rare',   weight: 1,  hp: 330, atk: 53, def: 29, xpBase: 220, goldMin: 135, goldMax: 220, emoji: '🏆', biome: 13 },
  { id: 'coliseum_sovereign', name: 'Coliseum Sovereign', rarity: 'rare',   weight: 1,  hp: 340, atk: 55, def: 30, xpBase: 225, goldMin: 138, goldMax: 225, emoji: '⚜️', biome: 13 },
  { id: 'the_last_duelist',   name: 'The Last Duelist',   rarity: 'rare',   weight: 1,  hp: 335, atk: 54, def: 29, xpBase: 222, goldMin: 136, goldMax: 222, emoji: '🗡️', biome: 13 },
  { id: 'ashfall_colossus',   name: 'Ashfall Colossus',   rarity: 'rare',   weight: 1,  hp: 350, atk: 56, def: 32, xpBase: 230, goldMin: 140, goldMax: 230, emoji: '🪨', biome: 13 },

  // --- Biome 14: The Gilded Vault ---
  { id: 'vault_wraith',      name: 'Vault Wraith',       rarity: 'common', weight: 24, hp: 105, atk: 35, def: 16, xpBase: 45,  goldMin: 24,  goldMax: 37,  emoji: '💰', biome: 14 },
  { id: 'greedbound_golem',  name: 'Greed-Bound Golem',  rarity: 'common', weight: 24, hp: 110, atk: 34, def: 17, xpBase: 45,  goldMin: 24,  goldMax: 37,  emoji: '🔐', biome: 14 },
  { id: 'coineyed_ghoul',    name: 'Coin-Eyed Ghoul',    rarity: 'common', weight: 24, hp: 103, atk: 37, def: 15, xpBase: 46,  goldMin: 25,  goldMax: 38,  emoji: '🧧', biome: 14 },
  { id: 'hoarder_wretch',    name: 'Hoarder Wretch',     rarity: 'common', weight: 24, hp: 107, atk: 36, def: 16, xpBase: 46,  goldMin: 25,  goldMax: 38,  emoji: '📦', biome: 14 },
  { id: 'vault_warden',      name: 'The Vault Warden',   rarity: 'rare',   weight: 1,  hp: 365, atk: 57, def: 33, xpBase: 235, goldMin: 142, goldMax: 230, emoji: '🏦', biome: 14 },
  { id: 'gilded_sovereign',  name: 'Gilded Sovereign',   rarity: 'rare',   weight: 1,  hp: 355, atk: 59, def: 32, xpBase: 238, goldMin: 145, goldMax: 235, emoji: '🪙', biome: 14 },
  { id: 'the_last_heir',     name: 'The Last Heir',      rarity: 'rare',   weight: 1,  hp: 360, atk: 58, def: 33, xpBase: 236, goldMin: 144, goldMax: 232, emoji: '🧳', biome: 14 },
  { id: 'avarice_incarnate', name: 'Avarice Incarnate',  rarity: 'rare',   weight: 1,  hp: 380, atk: 60, def: 35, xpBase: 242, goldMin: 148, goldMax: 240, emoji: '💸', biome: 14 },

  // --- Biome 15: The Weeping Orchard ---
  { id: 'weeping_barkwraith',  name: 'Weeping Bark-Wraith', rarity: 'common', weight: 24, hp: 114, atk: 38, def: 17, xpBase: 48,  goldMin: 26,  goldMax: 40,  emoji: '🍂', biome: 15 },
  { id: 'amberwept_husk',      name: 'Amber-Wept Husk',     rarity: 'common', weight: 24, hp: 112, atk: 39, def: 16, xpBase: 48,  goldMin: 26,  goldMax: 40,  emoji: '🍯', biome: 15 },
  { id: 'orchard_gravekeeper', name: 'Orchard Gravekeeper', rarity: 'common', weight: 24, hp: 118, atk: 37, def: 19, xpBase: 49,  goldMin: 27,  goldMax: 41,  emoji: '🪵', biome: 15 },
  { id: 'sapstained_wretch',   name: 'Sapstained Wretch',   rarity: 'common', weight: 24, hp: 116, atk: 40, def: 17, xpBase: 49,  goldMin: 27,  goldMax: 41,  emoji: '🌰', biome: 15 },
  { id: 'withering_matriarch', name: 'The Withering Matriarch', rarity: 'rare', weight: 1, hp: 390, atk: 61, def: 34, xpBase: 246, goldMin: 150, goldMax: 245, emoji: '🥭', biome: 15 },
  { id: 'orchard_sovereign',   name: 'Orchard Sovereign',   rarity: 'rare',   weight: 1,  hp: 400, atk: 63, def: 35, xpBase: 249, goldMin: 152, goldMax: 248, emoji: '🍇', biome: 15 },
  { id: 'the_last_harvest',    name: 'The Last Harvest',    rarity: 'rare',   weight: 1,  hp: 395, atk: 62, def: 34, xpBase: 247, goldMin: 151, goldMax: 246, emoji: '🍎', biome: 15 },
  { id: 'sorrowbound_colossus',name: 'Sorrowbound Colossus',rarity: 'rare',   weight: 1,  hp: 410, atk: 64, def: 37, xpBase: 252, goldMin: 155, goldMax: 250, emoji: '🌲', biome: 15 },

  // --- Biome 16: The Screaming Peaks ---
  { id: 'windborn_harpy',   name: 'Windborn Harpy',    rarity: 'common', weight: 24, hp: 120, atk: 41, def: 19, xpBase: 51,  goldMin: 28,  goldMax: 42,  emoji: '🦉', biome: 16 },
  { id: 'cragbound_yeti',   name: 'Cragbound Yeti',    rarity: 'common', weight: 24, hp: 124, atk: 42, def: 20, xpBase: 51,  goldMin: 28,  goldMax: 42,  emoji: '🏔️', biome: 16 },
  { id: 'vertigo_wraith',   name: 'Vertigo Wraith',    rarity: 'common', weight: 24, hp: 118, atk: 43, def: 18, xpBase: 52,  goldMin: 29,  goldMax: 43,  emoji: '🌬️', biome: 16 },
  { id: 'summit_stalker',   name: 'Summit Stalker',    rarity: 'common', weight: 24, hp: 122, atk: 42, def: 20, xpBase: 52,  goldMin: 29,  goldMax: 43,  emoji: '🐐', biome: 16 },
  { id: 'the_endless_climber', name: 'The Endless Climber', rarity: 'rare', weight: 1, hp: 415, atk: 65, def: 37, xpBase: 255, goldMin: 157, goldMax: 252, emoji: '🧗', biome: 16 },
  { id: 'peakbound_sovereign', name: 'Peakbound Sovereign', rarity: 'rare', weight: 1, hp: 425, atk: 67, def: 38, xpBase: 258, goldMin: 159, goldMax: 255, emoji: '🌩️', biome: 16 },
  { id: 'the_last_ascent',  name: 'The Last Ascent',   rarity: 'rare',   weight: 1,  hp: 420, atk: 66, def: 37, xpBase: 256, goldMin: 158, goldMax: 253, emoji: '🥾', biome: 16 },
  { id: 'skyshattered_titan', name: 'Skyshattered Titan', rarity: 'rare', weight: 1,  hp: 440, atk: 68, def: 40, xpBase: 262, goldMin: 162, goldMax: 260, emoji: '🌪️', biome: 16 },

  // --- Biome 17: The Sable Dunes ---
  { id: 'duststalker_jackal', name: 'Duststalker Jackal', rarity: 'common', weight: 24, hp: 126, atk: 44, def: 21, xpBase: 54,  goldMin: 30,  goldMax: 45,  emoji: '🦊', biome: 17 },
  { id: 'sandbound_revenant', name: 'Sandbound Revenant',  rarity: 'common', weight: 24, hp: 130, atk: 45, def: 22, xpBase: 54,  goldMin: 30,  goldMax: 45,  emoji: '⏳', biome: 17 },
  { id: 'mirage_wraith',      name: 'Mirage Wraith',       rarity: 'common', weight: 24, hp: 124, atk: 46, def: 20, xpBase: 55,  goldMin: 31,  goldMax: 46,  emoji: '🏜️', biome: 17 },
  { id: 'scarab_swarm',       name: 'Scarab Swarm',        rarity: 'common', weight: 24, hp: 128, atk: 45, def: 22, xpBase: 55,  goldMin: 31,  goldMax: 46,  emoji: '🪲', biome: 17 },
  { id: 'the_devouring_dune', name: 'The Devouring Dune',  rarity: 'rare',   weight: 1,  hp: 445, atk: 69, def: 40, xpBase: 265, goldMin: 164, goldMax: 262, emoji: '🐫', biome: 17 },
  { id: 'sandstorm_sovereign',name: 'Sandstorm Sovereign', rarity: 'rare',   weight: 1,  hp: 455, atk: 71, def: 41, xpBase: 268, goldMin: 166, goldMax: 265, emoji: '💨', biome: 17 },
  { id: 'the_last_caravan',   name: 'The Last Caravan',    rarity: 'rare',   weight: 1,  hp: 450, atk: 70, def: 40, xpBase: 266, goldMin: 165, goldMax: 263, emoji: '🎒', biome: 17 },
  { id: 'duneborn_colossus',  name: 'Duneborn Colossus',   rarity: 'rare',   weight: 1,  hp: 470, atk: 72, def: 43, xpBase: 272, goldMin: 169, goldMax: 270, emoji: '🧱', biome: 17 },

  // --- Biome 18: The Drowned Menagerie ---
  { id: 'cagebound_alligator', name: 'Cagebound Alligator', rarity: 'common', weight: 24, hp: 133, atk: 47, def: 22, xpBase: 57, goldMin: 32, goldMax: 45, emoji: '🐊', biome: 18 },
  { id: 'drowned_peacock', name: 'Drowned Peacock', rarity: 'common', weight: 24, hp: 135, atk: 48, def: 23, xpBase: 58, goldMin: 33, goldMax: 47, emoji: '🦚', biome: 18 },
  { id: 'flooded_aviary_wraith', name: 'Flooded Aviary Wraith', rarity: 'common', weight: 24, hp: 131, atk: 48, def: 22, xpBase: 56, goldMin: 31, goldMax: 43, emoji: '🦜', biome: 18 },
  { id: 'waterlogged_mastiff', name: 'Waterlogged Mastiff', rarity: 'common', weight: 24, hp: 137, atk: 47, def: 23, xpBase: 59, goldMin: 34, goldMax: 49, emoji: '🐕', biome: 18 },
  { id: 'the_last_zookeeper', name: 'The Last Zookeeper', rarity: 'rare', weight: 1, hp: 479, atk: 74, def: 43, xpBase: 280, goldMin: 173, goldMax: 268, emoji: '🔑', biome: 18 },
  { id: 'menagerie_sovereign', name: 'Menagerie Sovereign', rarity: 'rare', weight: 1, hp: 487, atk: 76, def: 44, xpBase: 288, goldMin: 181, goldMax: 284, emoji: '🦁', biome: 18 },
  { id: 'the_weeping_elephant', name: 'The Weeping Elephant', rarity: 'rare', weight: 1, hp: 483, atk: 75, def: 43, xpBase: 284, goldMin: 177, goldMax: 276, emoji: '🐘', biome: 18 },
  { id: 'abyssal_menagerie_beast', name: 'Abyssal Menagerie-Beast', rarity: 'rare', weight: 1, hp: 493, atk: 77, def: 45, xpBase: 294, goldMin: 187, goldMax: 296, emoji: '🔋', biome: 18 },

  // --- Biome 19: The Static Fields ---
  { id: 'static_wretch', name: 'Static Wretch', rarity: 'common', weight: 24, hp: 140, atk: 50, def: 23, xpBase: 60, goldMin: 33, goldMax: 46, emoji: '🔌', biome: 19 },
  { id: 'chargeling', name: 'Chargeling', rarity: 'common', weight: 24, hp: 142, atk: 51, def: 24, xpBase: 61, goldMin: 34, goldMax: 48, emoji: '🗻', biome: 19 },
  { id: 'thunderstruck_husk', name: 'Thunderstruck Husk', rarity: 'common', weight: 24, hp: 138, atk: 51, def: 23, xpBase: 59, goldMin: 32, goldMax: 44, emoji: '💥', biome: 19 },
  { id: 'voltaic_wisp', name: 'Voltaic Wisp', rarity: 'common', weight: 24, hp: 144, atk: 50, def: 24, xpBase: 62, goldMin: 35, goldMax: 50, emoji: '🗼', biome: 19 },
  { id: 'the_last_current', name: 'The Last Current', rarity: 'rare', weight: 1, hp: 502, atk: 78, def: 45, xpBase: 292, goldMin: 181, goldMax: 276, emoji: '🏛️', biome: 19 },
  { id: 'stormcaller_sovereign', name: 'Stormcaller Sovereign', rarity: 'rare', weight: 1, hp: 510, atk: 80, def: 46, xpBase: 300, goldMin: 189, goldMax: 292, emoji: '📃', biome: 19 },
  { id: 'the_grounding_titan', name: 'The Grounding Titan', rarity: 'rare', weight: 1, hp: 506, atk: 79, def: 45, xpBase: 296, goldMin: 185, goldMax: 284, emoji: '🎓', biome: 19 },
  { id: 'thunderbound_colossus', name: 'Thunderbound Colossus', rarity: 'rare', weight: 1, hp: 516, atk: 81, def: 47, xpBase: 306, goldMin: 195, goldMax: 304, emoji: '🕊️', biome: 19 },

  // --- Biome 20: The Ivory Spire ---
  { id: 'ascendant_acolyte', name: 'Ascendant Acolyte', rarity: 'common', weight: 24, hp: 146, atk: 52, def: 25, xpBase: 62, goldMin: 35, goldMax: 48, emoji: '❓', biome: 20 },
  { id: 'marble_sentinel', name: 'Marble Sentinel', rarity: 'common', weight: 24, hp: 148, atk: 53, def: 26, xpBase: 63, goldMin: 36, goldMax: 50, emoji: '🏯', biome: 20 },
  { id: 'spirewrought_golem', name: 'Spire-Wrought Golem', rarity: 'common', weight: 24, hp: 144, atk: 53, def: 25, xpBase: 61, goldMin: 34, goldMax: 46, emoji: '🛢️', biome: 20 },
  { id: 'whispering_manuscript', name: 'Whispering Manuscript', rarity: 'common', weight: 24, hp: 150, atk: 52, def: 26, xpBase: 64, goldMin: 37, goldMax: 52, emoji: '🚂', biome: 20 },
  { id: 'the_endless_scholar', name: 'The Endless Scholar', rarity: 'rare', weight: 1, hp: 525, atk: 81, def: 47, xpBase: 305, goldMin: 189, goldMax: 284, emoji: '🛡️', biome: 20 },
  { id: 'ivory_sovereign', name: 'Ivory Sovereign', rarity: 'rare', weight: 1, hp: 533, atk: 83, def: 48, xpBase: 313, goldMin: 197, goldMax: 300, emoji: '🚜', biome: 20 },
  { id: 'the_last_question', name: 'The Last Question', rarity: 'rare', weight: 1, hp: 529, atk: 82, def: 47, xpBase: 309, goldMin: 193, goldMax: 292, emoji: '🏗️', biome: 20 },
  { id: 'spirebound_colossus', name: 'Spirebound Colossus', rarity: 'rare', weight: 1, hp: 539, atk: 84, def: 49, xpBase: 319, goldMin: 203, goldMax: 312, emoji: '🎭', biome: 20 },

  // --- Biome 21: The Rusted Graveyard ---
  { id: 'rustbound_sentry', name: 'Rustbound Sentry', rarity: 'common', weight: 24, hp: 152, atk: 54, def: 26, xpBase: 65, goldMin: 37, goldMax: 50, emoji: '🎻', biome: 21 },
  { id: 'scraphide_crawler', name: 'Scraphide Crawler', rarity: 'common', weight: 24, hp: 154, atk: 55, def: 27, xpBase: 66, goldMin: 38, goldMax: 52, emoji: '🍷', biome: 21 },
  { id: 'oilblood_wretch', name: 'Oilblood Wretch', rarity: 'common', weight: 24, hp: 150, atk: 55, def: 26, xpBase: 64, goldMin: 36, goldMax: 48, emoji: '💃', biome: 21 },
  { id: 'cogless_automaton', name: 'Cogless Automaton', rarity: 'common', weight: 24, hp: 156, atk: 54, def: 27, xpBase: 67, goldMin: 39, goldMax: 54, emoji: '🎪', biome: 21 },
  { id: 'the_last_engine', name: 'The Last Engine', rarity: 'rare', weight: 1, hp: 548, atk: 84, def: 49, xpBase: 318, goldMin: 197, goldMax: 292, emoji: '🐢', biome: 21 },
  { id: 'warmachine_sovereign', name: 'Warmachine Sovereign', rarity: 'rare', weight: 1, hp: 556, atk: 86, def: 50, xpBase: 326, goldMin: 205, goldMax: 308, emoji: '🐌', biome: 21 },
  { id: 'the_rustbound_titan', name: 'The Rustbound Titan', rarity: 'rare', weight: 1, hp: 552, atk: 85, def: 49, xpBase: 322, goldMin: 201, goldMax: 300, emoji: '🦔', biome: 21 },
  { id: 'scrapheap_colossus', name: 'Scrapheap Colossus', rarity: 'rare', weight: 1, hp: 562, atk: 87, def: 51, xpBase: 332, goldMin: 211, goldMax: 320, emoji: '🐁', biome: 21 },

  // --- Biome 22: The Velvet Court ---
  { id: 'masked_waltzer', name: 'Masked Waltzer', rarity: 'common', weight: 24, hp: 159, atk: 57, def: 27, xpBase: 68, goldMin: 38, goldMax: 51, emoji: '🦡', biome: 22 },
  { id: 'velvet_wraith', name: 'Velvet Wraith', rarity: 'common', weight: 24, hp: 161, atk: 58, def: 28, xpBase: 69, goldMin: 39, goldMax: 53, emoji: '🦨', biome: 22 },
  { id: 'giltcracked_courtier', name: 'Gilt-Cracked Courtier', rarity: 'common', weight: 24, hp: 157, atk: 58, def: 27, xpBase: 67, goldMin: 37, goldMax: 49, emoji: '🦝', biome: 22 },
  { id: 'motheaten_duchess', name: 'Moth-Eaten Duchess', rarity: 'common', weight: 24, hp: 163, atk: 57, def: 28, xpBase: 70, goldMin: 40, goldMax: 55, emoji: '🐿️', biome: 22 },
  { id: 'the_eternal_host', name: 'The Eternal Host', rarity: 'rare', weight: 1, hp: 571, atk: 88, def: 51, xpBase: 330, goldMin: 205, goldMax: 300, emoji: '🦫', biome: 22 },
  { id: 'court_sovereign', name: 'Court Sovereign', rarity: 'rare', weight: 1, hp: 579, atk: 90, def: 52, xpBase: 338, goldMin: 213, goldMax: 316, emoji: '🐇', biome: 22 },
  { id: 'the_last_dance', name: 'The Last Dance', rarity: 'rare', weight: 1, hp: 575, atk: 89, def: 51, xpBase: 334, goldMin: 209, goldMax: 308, emoji: '🦥', biome: 22 },
  { id: 'velvetbound_colossus', name: 'Velvetbound Colossus', rarity: 'rare', weight: 1, hp: 585, atk: 91, def: 53, xpBase: 344, goldMin: 219, goldMax: 328, emoji: '🦕', biome: 22 },

  // --- Biome 23: The Crystal Expanse ---
  { id: 'chiming_wretch', name: 'Chiming Wretch', rarity: 'common', weight: 24, hp: 165, atk: 59, def: 28, xpBase: 71, goldMin: 40, goldMax: 53, emoji: '🦖', biome: 23 },
  { id: 'prismwrought_golem', name: 'Prism-Wrought Golem', rarity: 'common', weight: 24, hp: 167, atk: 60, def: 29, xpBase: 72, goldMin: 41, goldMax: 55, emoji: '🐴', biome: 23 },
  { id: 'singing_shard', name: 'Singing Shard', rarity: 'common', weight: 24, hp: 163, atk: 60, def: 28, xpBase: 70, goldMin: 39, goldMax: 51, emoji: '🎵', biome: 23 },
  { id: 'resonant_wisp', name: 'Resonant Wisp', rarity: 'common', weight: 24, hp: 169, atk: 59, def: 29, xpBase: 73, goldMin: 42, goldMax: 57, emoji: '🔊', biome: 23 },
  { id: 'the_unbroken_chord', name: 'The Unbroken Chord', rarity: 'rare', weight: 1, hp: 594, atk: 92, def: 53, xpBase: 342, goldMin: 214, goldMax: 309, emoji: '🦄', biome: 23 },
  { id: 'crystal_sovereign', name: 'Crystal Sovereign', rarity: 'rare', weight: 1, hp: 602, atk: 94, def: 54, xpBase: 350, goldMin: 222, goldMax: 325, emoji: '🦌', biome: 23 },
  { id: 'the_last_harmony', name: 'The Last Harmony', rarity: 'rare', weight: 1, hp: 598, atk: 93, def: 53, xpBase: 346, goldMin: 218, goldMax: 317, emoji: '🎹', biome: 23 },
  { id: 'prismbound_colossus', name: 'Prismbound Colossus', rarity: 'rare', weight: 1, hp: 608, atk: 95, def: 55, xpBase: 356, goldMin: 228, goldMax: 337, emoji: '🐮', biome: 23 },

  // --- Biome 24: The Forgotten Carnival ---
  { id: 'grinning_barker', name: 'Grinning Barker', rarity: 'common', weight: 24, hp: 172, atk: 61, def: 29, xpBase: 73, goldMin: 41, goldMax: 54, emoji: '🤡', biome: 24 },
  { id: 'funhouse_wraith', name: 'Funhouse Wraith', rarity: 'common', weight: 24, hp: 174, atk: 62, def: 30, xpBase: 74, goldMin: 42, goldMax: 56, emoji: '🐷', biome: 24 },
  { id: 'carousel_horror', name: 'Carousel Horror', rarity: 'common', weight: 24, hp: 170, atk: 62, def: 29, xpBase: 72, goldMin: 40, goldMax: 52, emoji: '🎠', biome: 24 },
  { id: 'balloon_choked_wretch', name: 'Balloon-Choked Wretch', rarity: 'common', weight: 24, hp: 176, atk: 61, def: 30, xpBase: 75, goldMin: 43, goldMax: 58, emoji: '🎈', biome: 24 },
  { id: 'the_ringmaster', name: 'The Ringmaster', rarity: 'rare', weight: 1, hp: 617, atk: 95, def: 55, xpBase: 355, goldMin: 222, goldMax: 317, emoji: '🎩', biome: 24 },
  { id: 'carnival_sovereign', name: 'Carnival Sovereign', rarity: 'rare', weight: 1, hp: 625, atk: 97, def: 56, xpBase: 363, goldMin: 230, goldMax: 333, emoji: '🐗', biome: 24 },
  { id: 'the_last_ticket', name: 'The Last Ticket', rarity: 'rare', weight: 1, hp: 621, atk: 96, def: 55, xpBase: 359, goldMin: 226, goldMax: 325, emoji: '🎟️', biome: 24 },
  { id: 'funfair_colossus', name: 'Funfair Colossus', rarity: 'rare', weight: 1, hp: 631, atk: 98, def: 57, xpBase: 369, goldMin: 236, goldMax: 345, emoji: '🎡', biome: 24 },

  // --- Biome 25: The Iron Oubliette ---
  { id: 'shackled_wretch', name: 'Shackled Wretch', rarity: 'common', weight: 24, hp: 178, atk: 64, def: 30, xpBase: 76, goldMin: 43, goldMax: 56, emoji: '🐏', biome: 25 },
  { id: 'cellblock_wraith', name: 'Cellblock Wraith', rarity: 'common', weight: 24, hp: 180, atk: 65, def: 31, xpBase: 77, goldMin: 44, goldMax: 58, emoji: '🔒', biome: 25 },
  { id: 'rustbound_warden', name: 'Rustbound Warden', rarity: 'common', weight: 24, hp: 176, atk: 65, def: 30, xpBase: 75, goldMin: 42, goldMax: 54, emoji: '🗝️', biome: 25 },
  { id: 'forgotten_inmate', name: 'Forgotten Inmate', rarity: 'common', weight: 24, hp: 182, atk: 64, def: 31, xpBase: 78, goldMin: 45, goldMax: 60, emoji: '🐑', biome: 25 },
  { id: 'the_last_warden', name: 'The Last Warden', rarity: 'rare', weight: 1, hp: 640, atk: 98, def: 58, xpBase: 368, goldMin: 230, goldMax: 325, emoji: '🔨', biome: 25 },
  { id: 'oubliette_sovereign', name: 'Oubliette Sovereign', rarity: 'rare', weight: 1, hp: 648, atk: 100, def: 59, xpBase: 376, goldMin: 238, goldMax: 341, emoji: '🦙', biome: 25 },
  { id: 'the_forgotten_judge', name: 'The Forgotten Judge', rarity: 'rare', weight: 1, hp: 644, atk: 99, def: 58, xpBase: 372, goldMin: 234, goldMax: 333, emoji: '⚖️', biome: 25 },
  { id: 'ironbound_colossus', name: 'Ironbound Colossus', rarity: 'rare', weight: 1, hp: 654, atk: 101, def: 60, xpBase: 382, goldMin: 244, goldMax: 353, emoji: '🦘', biome: 25 },

  // --- Biome 26: The Alchemist's Ruin ---
  { id: 'reagent_wretch', name: 'Reagent Wretch', rarity: 'common', weight: 24, hp: 184, atk: 66, def: 32, xpBase: 79, goldMin: 45, goldMax: 58, emoji: '🧪', biome: 26 },
  { id: 'twitching_homunculus', name: 'Twitching Homunculus', rarity: 'common', weight: 24, hp: 186, atk: 67, def: 33, xpBase: 80, goldMin: 46, goldMax: 60, emoji: '🫙', biome: 26 },
  { id: 'failed_transmutation', name: 'Failed Transmutation', rarity: 'common', weight: 24, hp: 182, atk: 67, def: 32, xpBase: 78, goldMin: 44, goldMax: 56, emoji: '☣️', biome: 26 },
  { id: 'bubbling_ooze', name: 'Bubbling Ooze', rarity: 'common', weight: 24, hp: 188, atk: 66, def: 33, xpBase: 81, goldMin: 47, goldMax: 62, emoji: '🧫', biome: 26 },
  { id: 'the_last_alchemist', name: 'The Last Alchemist', rarity: 'rare', weight: 1, hp: 663, atk: 102, def: 60, xpBase: 380, goldMin: 238, goldMax: 333, emoji: '⚗️', biome: 26 },
  { id: 'chimera_sovereign', name: 'Chimera Sovereign', rarity: 'rare', weight: 1, hp: 671, atk: 104, def: 61, xpBase: 388, goldMin: 246, goldMax: 349, emoji: '🐄', biome: 26 },
  { id: 'the_unfinished_formula', name: 'The Unfinished Formula', rarity: 'rare', weight: 1, hp: 667, atk: 103, def: 60, xpBase: 384, goldMin: 242, goldMax: 341, emoji: '📋', biome: 26 },
  { id: 'reagentbound_colossus', name: 'Reagentbound Colossus', rarity: 'rare', weight: 1, hp: 677, atk: 105, def: 62, xpBase: 394, goldMin: 252, goldMax: 361, emoji: '🐂', biome: 26 },

  // --- Biome 27: The Siren's Coast ---
  { id: 'wreckbound_sailor', name: 'Wreckbound Sailor', rarity: 'common', weight: 24, hp: 191, atk: 68, def: 33, xpBase: 81, goldMin: 46, goldMax: 59, emoji: '⚓', biome: 27 },
  { id: 'sirens_thrall', name: 'Siren\'s Thrall', rarity: 'common', weight: 24, hp: 193, atk: 69, def: 34, xpBase: 82, goldMin: 47, goldMax: 61, emoji: '🦃', biome: 27 },
  { id: 'tideworn_ghoul', name: 'Tideworn Ghoul', rarity: 'common', weight: 24, hp: 189, atk: 69, def: 33, xpBase: 80, goldMin: 45, goldMax: 57, emoji: '🌊', biome: 27 },
  { id: 'barnacle_wretch', name: 'Barnacle Wretch', rarity: 'common', weight: 24, hp: 195, atk: 68, def: 34, xpBase: 83, goldMin: 48, goldMax: 63, emoji: '🦪', biome: 27 },
  { id: 'the_last_captain', name: 'The Last Captain', rarity: 'rare', weight: 1, hp: 686, atk: 106, def: 62, xpBase: 392, goldMin: 246, goldMax: 341, emoji: '🧭', biome: 27 },
  { id: 'siren_sovereign', name: 'Siren Sovereign', rarity: 'rare', weight: 1, hp: 694, atk: 108, def: 63, xpBase: 400, goldMin: 254, goldMax: 357, emoji: '🧜', biome: 27 },
  { id: 'the_drowned_choir', name: 'The Drowned Choir', rarity: 'rare', weight: 1, hp: 690, atk: 107, def: 62, xpBase: 396, goldMin: 250, goldMax: 349, emoji: '🎤', biome: 27 },
  { id: 'shipbreaker_colossus', name: 'Shipbreaker Colossus', rarity: 'rare', weight: 1, hp: 700, atk: 109, def: 64, xpBase: 406, goldMin: 260, goldMax: 369, emoji: '🚢', biome: 27 },

  // --- Biome 28: The Salt Cathedral ---
  { id: 'salt_pilgrim', name: 'Salt-Crusted Pilgrim', rarity: 'common', weight: 24, hp: 197, atk: 71, def: 34, xpBase: 84, goldMin: 48, goldMax: 61, emoji: '🧂', biome: 28 },
  { id: 'brine_wraith', name: 'Brine Wraith', rarity: 'common', weight: 24, hp: 199, atk: 72, def: 35, xpBase: 85, goldMin: 49, goldMax: 63, emoji: '💧', biome: 28 },
  { id: 'crystal_deacon', name: 'Crystal Deacon', rarity: 'common', weight: 24, hp: 195, atk: 72, def: 34, xpBase: 83, goldMin: 47, goldMax: 59, emoji: '⛪', biome: 28 },
  { id: 'salt_hound', name: 'Salt-Bound Hound', rarity: 'common', weight: 24, hp: 201, atk: 71, def: 35, xpBase: 86, goldMin: 50, goldMax: 65, emoji: '🐕‍🦺', biome: 28 },
  { id: 'the_last_congregant', name: 'The Last Congregant', rarity: 'rare', weight: 1, hp: 709, atk: 109, def: 64, xpBase: 405, goldMin: 255, goldMax: 350, emoji: '🕯️', emojiFilter: 'hue-rotate(180deg) saturate(1.3) brightness(1.1)', biome: 28 },
  { id: 'cathedral_sovereign', name: 'Cathedral Sovereign', rarity: 'rare', weight: 1, hp: 717, atk: 111, def: 65, xpBase: 413, goldMin: 263, goldMax: 366, emoji: '👑', emojiFilter: 'grayscale(0.5) brightness(1.3) saturate(1.2)', emojiFlip: true, biome: 28 },
  { id: 'the_salt_bishop', name: 'The Salt Bishop', rarity: 'rare', weight: 1, hp: 713, atk: 110, def: 64, xpBase: 409, goldMin: 259, goldMax: 358, emoji: '⚱️', emojiFilter: 'sepia(0.35) hue-rotate(200deg) saturate(1.5)', biome: 28 },
  { id: 'brine_colossus', name: 'Brine Colossus', rarity: 'rare', weight: 1, hp: 723, atk: 112, def: 66, xpBase: 419, goldMin: 269, goldMax: 378, emoji: '🗿', emojiFilter: 'hue-rotate(220deg) saturate(1.4) brightness(0.9)', emojiFlip: true, biome: 28 },

  // --- Biome 29: The Cinder Archive ---
  { id: 'smoldering_clerk', name: 'Smoldering Clerk', rarity: 'common', weight: 24, hp: 204, atk: 73, def: 35, xpBase: 87, goldMin: 49, goldMax: 62, emoji: '🐬', biome: 29 },
  { id: 'ash_scholar', name: 'Ash Scholar', rarity: 'common', weight: 24, hp: 206, atk: 74, def: 36, xpBase: 88, goldMin: 50, goldMax: 64, emoji: '📚', biome: 29 },
  { id: 'cinder_moth', name: 'Cinder Moth Swarm', rarity: 'common', weight: 24, hp: 202, atk: 74, def: 35, xpBase: 86, goldMin: 48, goldMax: 60, emoji: '🐳', biome: 29 },
  { id: 'burning_footnote', name: 'Burning Footnote', rarity: 'common', weight: 24, hp: 208, atk: 73, def: 36, xpBase: 89, goldMin: 51, goldMax: 66, emoji: '📝', biome: 29 },
  { id: 'the_head_archivist', name: 'The Head Archivist', rarity: 'rare', weight: 1, hp: 732, atk: 112, def: 66, xpBase: 418, goldMin: 263, goldMax: 358, emoji: '🦞', biome: 29 },
  { id: 'the_unread_folio', name: 'The Unread Folio', rarity: 'rare', weight: 1, hp: 740, atk: 114, def: 67, xpBase: 426, goldMin: 271, goldMax: 374, emoji: '📖', biome: 29 },
  { id: 'ember_curator', name: 'Ember-Bound Curator', rarity: 'rare', weight: 1, hp: 736, atk: 113, def: 66, xpBase: 422, goldMin: 267, goldMax: 366, emoji: '🦀', biome: 29 },
  { id: 'the_last_index', name: 'The Last Index', rarity: 'rare', weight: 1, hp: 746, atk: 115, def: 68, xpBase: 432, goldMin: 277, goldMax: 386, emoji: '🗂️', biome: 29 },

  // --- Biome 30: The Marrow Fen ---
  { id: 'bog_wight', name: 'Bog Wight', rarity: 'common', weight: 24, hp: 210, atk: 76, def: 36, xpBase: 90, goldMin: 51, goldMax: 64, emoji: '🐠', biome: 30 },
  { id: 'silt_leech', name: 'Marrow Leech', rarity: 'common', weight: 24, hp: 212, atk: 77, def: 37, xpBase: 91, goldMin: 52, goldMax: 66, emoji: '🐟', biome: 30 },
  { id: 'fen_stalker', name: 'Fen Stalker', rarity: 'common', weight: 24, hp: 208, atk: 77, def: 36, xpBase: 89, goldMin: 50, goldMax: 62, emoji: '🦟', biome: 30 },
  { id: 'bone_sedge', name: 'Bone-Sedge Wretch', rarity: 'common', weight: 24, hp: 214, atk: 76, def: 37, xpBase: 92, goldMin: 53, goldMax: 68, emoji: '🪰', biome: 30 },
  { id: 'the_sunken_legion', name: 'The Sunken Legion', rarity: 'rare', weight: 1, hp: 755, atk: 116, def: 68, xpBase: 430, goldMin: 271, goldMax: 366, emoji: '⚔️', biome: 30 },
  { id: 'marrow_matriarch', name: 'The Marrow Matriarch', rarity: 'rare', weight: 1, hp: 763, atk: 118, def: 69, xpBase: 438, goldMin: 279, goldMax: 382, emoji: '🪱', biome: 30 },
  { id: 'the_undrowned', name: 'The Undrowned', rarity: 'rare', weight: 1, hp: 759, atk: 117, def: 68, xpBase: 434, goldMin: 275, goldMax: 374, emoji: '🐝', biome: 30 },
  { id: 'fen_colossus', name: 'Fen-Bound Colossus', rarity: 'rare', weight: 1, hp: 769, atk: 119, def: 70, xpBase: 444, goldMin: 285, goldMax: 394, emoji: '🦗', biome: 30 },

  // --- Biome 31: The Inverted Garden ---
  { id: 'hanging_bloomkeeper', name: 'Hanging Bloomkeeper', rarity: 'common', weight: 24, hp: 216, atk: 78, def: 38, xpBase: 92, goldMin: 53, goldMax: 66, emoji: '🌺', biome: 31 },
  { id: 'upside_thorn', name: 'Upside-Down Thornling', rarity: 'common', weight: 24, hp: 218, atk: 79, def: 39, xpBase: 93, goldMin: 54, goldMax: 68, emoji: '🌶️', biome: 31 },
  { id: 'falling_petal_wraith', name: 'Falling-Petal Wraith', rarity: 'common', weight: 24, hp: 214, atk: 79, def: 38, xpBase: 91, goldMin: 52, goldMax: 64, emoji: '🥕', biome: 31 },
  { id: 'root_hung_husk', name: 'Root-Hung Husk', rarity: 'common', weight: 24, hp: 220, atk: 78, def: 39, xpBase: 94, goldMin: 55, goldMax: 70, emoji: '🪴', biome: 31 },
  { id: 'the_inverted_gardener', name: 'The Inverted Gardener', rarity: 'rare', weight: 1, hp: 778, atk: 120, def: 70, xpBase: 442, goldMin: 279, goldMax: 374, emoji: '🌻', biome: 31 },
  { id: 'the_falling_bloom', name: 'The Falling Bloom', rarity: 'rare', weight: 1, hp: 786, atk: 122, def: 71, xpBase: 450, goldMin: 287, goldMax: 390, emoji: '🌷', biome: 31 },
  { id: 'skybound_root_titan', name: 'Skybound Root-Titan', rarity: 'rare', weight: 1, hp: 782, atk: 121, def: 70, xpBase: 446, goldMin: 283, goldMax: 382, emoji: '🍆', biome: 31 },
  { id: 'the_gravity_thorn', name: 'The Gravity-Thorn', rarity: 'rare', weight: 1, hp: 792, atk: 123, def: 72, xpBase: 456, goldMin: 293, goldMax: 402, emoji: '🫑', biome: 31 },

  // --- Biome 32: The Wax Necropolis ---
  { id: 'wax_mourner', name: 'Wax-Sealed Mourner', rarity: 'common', weight: 24, hp: 223, atk: 80, def: 39, xpBase: 95, goldMin: 54, goldMax: 67, emoji: '🥔', biome: 32 },
  { id: 'tallow_wretch', name: 'Tallow Wretch', rarity: 'common', weight: 24, hp: 225, atk: 81, def: 40, xpBase: 96, goldMin: 55, goldMax: 69, emoji: '🧄', biome: 32 },
  { id: 'dripping_effigy', name: 'Dripping Effigy', rarity: 'common', weight: 24, hp: 221, atk: 81, def: 39, xpBase: 94, goldMin: 53, goldMax: 65, emoji: '🧅', biome: 32 },
  { id: 'candlewick_revenant', name: 'Candlewick Revenant', rarity: 'common', weight: 24, hp: 227, atk: 80, def: 40, xpBase: 97, goldMin: 56, goldMax: 71, emoji: '🥜', biome: 32 },
  { id: 'the_eternal_mourner', name: 'The Eternal Mourner', rarity: 'rare', weight: 1, hp: 801, atk: 123, def: 72, xpBase: 455, goldMin: 287, goldMax: 382, emoji: '🫘', biome: 32 },
  { id: 'wax_sovereign', name: 'The Wax Sovereign', rarity: 'rare', weight: 1, hp: 809, atk: 125, def: 73, xpBase: 463, goldMin: 295, goldMax: 398, emoji: '🌽', biome: 32 },
  { id: 'the_last_candle', name: 'The Last Candle', rarity: 'rare', weight: 1, hp: 805, atk: 124, def: 72, xpBase: 459, goldMin: 291, goldMax: 390, emoji: '🥦', biome: 32 },
  { id: 'tallow_colossus', name: 'Tallow Colossus', rarity: 'rare', weight: 1, hp: 815, atk: 126, def: 74, xpBase: 469, goldMin: 301, goldMax: 410, emoji: '🥬', biome: 32 },

  // --- Biome 33: The Splintered Armory ---
  { id: 'broken_quartermaster', name: 'Broken Quartermaster', rarity: 'common', weight: 24, hp: 229, atk: 83, def: 40, xpBase: 98, goldMin: 56, goldMax: 69, emoji: '🍅', biome: 33 },
  { id: 'splinter_wretch', name: 'Splinter Wretch', rarity: 'common', weight: 24, hp: 231, atk: 84, def: 41, xpBase: 99, goldMin: 57, goldMax: 71, emoji: '🥒', biome: 33 },
  { id: 'armory_sentinel', name: 'Armory Sentinel', rarity: 'common', weight: 24, hp: 227, atk: 84, def: 40, xpBase: 97, goldMin: 55, goldMax: 67, emoji: '🧵', biome: 33 },
  { id: 'rack_bound_horror', name: 'Rack-Bound Horror', rarity: 'common', weight: 24, hp: 233, atk: 83, def: 41, xpBase: 100, goldMin: 58, goldMax: 73, emoji: '🪓', biome: 33 },
  { id: 'the_armory_master', name: 'The Armory Master', rarity: 'rare', weight: 1, hp: 824, atk: 126, def: 74, xpBase: 468, goldMin: 296, goldMax: 391, emoji: '🪡', biome: 33 },
  { id: 'the_unbroken_arsenal', name: 'The Unbroken Arsenal', rarity: 'rare', weight: 1, hp: 832, atk: 128, def: 75, xpBase: 476, goldMin: 304, goldMax: 407, emoji: '🧶', biome: 33 },
  { id: 'warforged_sentinel', name: 'War-Forged Sentinel', rarity: 'rare', weight: 1, hp: 828, atk: 127, def: 74, xpBase: 472, goldMin: 300, goldMax: 399, emoji: '🪢', biome: 33 },
  { id: 'the_last_requisition', name: 'The Last Requisition', rarity: 'rare', weight: 1, hp: 838, atk: 129, def: 76, xpBase: 482, goldMin: 310, goldMax: 419, emoji: '🛎️', biome: 33 },

  // --- Biome 34: The Bellfounder's Hollow ---
  { id: 'foundry_wretch', name: 'Foundry Wretch', rarity: 'common', weight: 24, hp: 236, atk: 85, def: 41, xpBase: 100, goldMin: 57, goldMax: 70, emoji: '🪘', biome: 34 },
  { id: 'bellringer_ghoul', name: 'Bellringer Ghoul', rarity: 'common', weight: 24, hp: 238, atk: 86, def: 42, xpBase: 101, goldMin: 58, goldMax: 72, emoji: '🎺', biome: 34 },
  { id: 'molten_apprentice', name: 'Molten Apprentice', rarity: 'common', weight: 24, hp: 234, atk: 86, def: 41, xpBase: 99, goldMin: 56, goldMax: 68, emoji: '🎷', biome: 34 },
  { id: 'resonant_wraith', name: 'Resonant Wraith', rarity: 'common', weight: 24, hp: 240, atk: 85, def: 42, xpBase: 102, goldMin: 59, goldMax: 74, emoji: '🪗', biome: 34 },
  { id: 'the_bellfounder', name: 'The Bellfounder', rarity: 'rare', weight: 1, hp: 847, atk: 130, def: 76, xpBase: 480, goldMin: 304, goldMax: 399, emoji: '🎸', biome: 34 },
  { id: 'the_great_toll', name: 'The Great Toll', rarity: 'rare', weight: 1, hp: 855, atk: 132, def: 77, xpBase: 488, goldMin: 312, goldMax: 415, emoji: '🪕', biome: 34 },
  { id: 'foundry_sovereign', name: 'Foundry Sovereign', rarity: 'rare', weight: 1, hp: 851, atk: 131, def: 76, xpBase: 484, goldMin: 308, goldMax: 407, emoji: '🏹', biome: 34 },
  { id: 'the_unheard_chime', name: 'The Unheard Chime', rarity: 'rare', weight: 1, hp: 861, atk: 133, def: 78, xpBase: 494, goldMin: 318, goldMax: 427, emoji: '🎐', biome: 34 },

  // --- Biome 35: The Paper Labyrinth ---
  { id: 'paper_clerk', name: 'Paper-Bound Clerk', rarity: 'common', weight: 24, hp: 242, atk: 87, def: 42, xpBase: 103, goldMin: 59, goldMax: 72, emoji: '📄', biome: 35 },
  { id: 'drifting_memo', name: 'Drifting Memo Wraith', rarity: 'common', weight: 24, hp: 244, atk: 88, def: 43, xpBase: 104, goldMin: 60, goldMax: 74, emoji: '🛶', biome: 35 },
  { id: 'filing_horror', name: 'Filing Horror', rarity: 'common', weight: 24, hp: 240, atk: 88, def: 42, xpBase: 102, goldMin: 58, goldMax: 70, emoji: '🗄️', biome: 35 },
  { id: 'stamped_wretch', name: 'Stamped Wretch', rarity: 'common', weight: 24, hp: 246, atk: 87, def: 43, xpBase: 105, goldMin: 61, goldMax: 76, emoji: '🖋️', biome: 35 },
  { id: 'the_census_taker', name: 'The Census-Taker', rarity: 'rare', weight: 1, hp: 870, atk: 134, def: 78, xpBase: 492, goldMin: 312, goldMax: 407, emoji: '🚁', biome: 35 },
  { id: 'the_final_form', name: 'The Final Form', rarity: 'rare', weight: 1, hp: 878, atk: 136, def: 79, xpBase: 500, goldMin: 320, goldMax: 423, emoji: '🛰️', biome: 35 },
  { id: 'archive_sovereign', name: 'Archive Sovereign', rarity: 'rare', weight: 1, hp: 874, atk: 135, def: 78, xpBase: 496, goldMin: 316, goldMax: 415, emoji: '🗃️', biome: 35 },
  { id: 'the_unfiled', name: 'The Unfiled', rarity: 'rare', weight: 1, hp: 884, atk: 137, def: 80, xpBase: 506, goldMin: 326, goldMax: 435, emoji: '📁', biome: 35 },

  // --- Biome 36: The Threadbare Loom ---
  { id: 'loom_wretch', name: 'Loom-Bound Wretch', rarity: 'common', weight: 24, hp: 248, atk: 90, def: 43, xpBase: 106, goldMin: 61, goldMax: 74, emoji: '🪝', biome: 36 },
  { id: 'spindle_horror', name: 'Spindle Horror', rarity: 'common', weight: 24, hp: 250, atk: 91, def: 44, xpBase: 107, goldMin: 62, goldMax: 76, emoji: '🔬', biome: 36 },
  { id: 'threadbare_wraith', name: 'Threadbare Wraith', rarity: 'common', weight: 24, hp: 246, atk: 91, def: 43, xpBase: 105, goldMin: 60, goldMax: 72, emoji: '🔭', biome: 36 },
  { id: 'shuttle_ghoul', name: 'Shuttle Ghoul', rarity: 'common', weight: 24, hp: 252, atk: 90, def: 44, xpBase: 108, goldMin: 63, goldMax: 78, emoji: '🪤', biome: 36 },
  { id: 'the_master_weaver', name: 'The Master Weaver', rarity: 'rare', weight: 1, hp: 893, atk: 137, def: 81, xpBase: 505, goldMin: 320, goldMax: 415, emoji: '🌐', biome: 36 },
  { id: 'the_unfinished_bolt', name: 'The Unfinished Bolt', rarity: 'rare', weight: 1, hp: 901, atk: 139, def: 82, xpBase: 513, goldMin: 328, goldMax: 431, emoji: '🍁', biome: 36 },
  { id: 'loom_sovereign', name: 'Loom Sovereign', rarity: 'rare', weight: 1, hp: 897, atk: 138, def: 81, xpBase: 509, goldMin: 324, goldMax: 423, emoji: '🌱', biome: 36 },
  { id: 'the_last_stitch', name: 'The Last Stitch', rarity: 'rare', weight: 1, hp: 907, atk: 140, def: 83, xpBase: 519, goldMin: 334, goldMax: 443, emoji: '🕳', biome: 36 },

  // --- Biome 37: The Stained Sanctum ---
  { id: 'glass_deacon', name: 'Glass Deacon', rarity: 'common', weight: 24, hp: 255, atk: 92, def: 45, xpBase: 108, goldMin: 62, goldMax: 75, emoji: '🪟', biome: 37 },
  { id: 'shard_penitent', name: 'Shard Penitent', rarity: 'common', weight: 24, hp: 257, atk: 93, def: 46, xpBase: 109, goldMin: 63, goldMax: 77, emoji: '🌫️', biome: 37 },
  { id: 'stained_wraith', name: 'Stained Wraith', rarity: 'common', weight: 24, hp: 253, atk: 93, def: 45, xpBase: 107, goldMin: 61, goldMax: 73, emoji: '⛈️', biome: 37 },
  { id: 'window_wretch', name: 'Window-Bound Wretch', rarity: 'common', weight: 24, hp: 259, atk: 92, def: 46, xpBase: 110, goldMin: 64, goldMax: 79, emoji: '🎗️', biome: 37 },
  { id: 'the_last_witness', name: 'The Last Witness', rarity: 'rare', weight: 1, hp: 916, atk: 140, def: 83, xpBase: 518, goldMin: 328, goldMax: 423, emoji: '🎫', biome: 37 },
  { id: 'sanctum_sovereign', name: 'Sanctum Sovereign', rarity: 'rare', weight: 1, hp: 924, atk: 142, def: 84, xpBase: 526, goldMin: 336, goldMax: 439, emoji: '🃏', biome: 37 },
  { id: 'the_shifting_saint', name: 'The Shifting Saint', rarity: 'rare', weight: 1, hp: 920, atk: 141, def: 83, xpBase: 522, goldMin: 332, goldMax: 431, emoji: '🀄', biome: 37 },
  { id: 'prism_colossus', name: 'Prism Colossus', rarity: 'rare', weight: 1, hp: 930, atk: 143, def: 85, xpBase: 532, goldMin: 342, goldMax: 451, emoji: '🎲', biome: 37 },
];

const LEGENDARY_ENEMIES = [
  { id: 'hollow_king', name: 'The Hollow King', hp: 220, atk: 28, def: 12, xpBase: 200, goldMin: 150, goldMax: 250, emoji: '🎭' },
  { id: 'world_eater', name: 'The World-Eater', hp: 260, atk: 26, def: 14, xpBase: 220, goldMin: 160, goldMax: 260, emoji: '🌌' },
];

const COMMON_WEAPONS = [
  { id: 'rusty_sword',  name: 'Rusty Sword',   type: 'weapon', rarity: 'common', atk: 2 },
  { id: 'wooden_club',  name: 'Wooden Club',   type: 'weapon', rarity: 'common', atk: 3 },
  { id: 'iron_dagger',  name: 'Iron Dagger',   type: 'weapon', rarity: 'common', atk: 4 },
  { id: 'bone_hatchet', name: 'Bone Hatchet',  type: 'weapon', rarity: 'common', atk: 3, def: 1 },
  { id: 'tarnished_rapier',  name: 'Tarnished Rapier',  type: 'weapon', rarity: 'common', atk: 4 },
  { id: 'splintered_spear',  name: 'Splintered Spear',  type: 'weapon', rarity: 'common', atk: 3, def: 1 },
];

const RARE_WEAPONS = [
  { id: 'flameforged_blade', name: 'Flameforged Blade', type: 'weapon', rarity: 'rare', atk: 9 },
  { id: 'frostbite_edge',    name: 'Frostbite Edge',    type: 'weapon', rarity: 'rare', atk: 7, def: 2 },
  { id: 'voidsteel_cleaver', name: 'Voidsteel Cleaver', type: 'weapon', rarity: 'rare', atk: 11 },
  { id: 'dragonbone_spear',  name: 'Dragonbone Spear',  type: 'weapon', rarity: 'rare', atk: 8, def: 3 },
  { id: 'bloodroot_saber',   name: 'Bloodroot Saber',   type: 'weapon', rarity: 'rare', atk: 10 },
  { id: 'wyrmfang_dirk',     name: 'Wyrmfang Dirk',     type: 'weapon', rarity: 'rare', atk: 8, def: 2 },
];

const EPIC_WEAPONS = [
  { id: 'worldsplitter',    name: 'Worldsplitter Greatsword', type: 'weapon', rarity: 'epic', atk: 15 },
  { id: 'stormcaller_lance',name: "Stormcaller's Lance",      type: 'weapon', rarity: 'epic', atk: 13, def: 3 },
  { id: 'nightfall_reaper', name: 'Nightfall Reaper',         type: 'weapon', rarity: 'epic', atk: 17 },
  { id: 'sunforged_hammer', name: 'Sunforged Warhammer',      type: 'weapon', rarity: 'epic', atk: 14, def: 4 },
  { id: 'ashveil_katana',   name: 'Ashveil Katana',           type: 'weapon', rarity: 'epic', atk: 16, def: 2 },
];

const LEGENDARY_WEAPONS = [
  { id: 'excalibur_dawn', name: 'Excalibur, Blade of Dawn', type: 'weapon', rarity: 'legendary', atk: 20, def: 2 },
  { id: 'worldrender',    name: 'Worldrender',              type: 'weapon', rarity: 'legendary', atk: 23 },
  { id: 'oathkeeper',     name: 'Oathkeeper, Blade of the First Vow', type: 'weapon', rarity: 'legendary', atk: 21, def: 3 },
];

const COMMON_ARMORS = [
  { id: 'leather_vest',     name: 'Leather Vest',      type: 'armor', rarity: 'common', def: 2 },
  { id: 'patched_robes',    name: 'Patched Robes',     type: 'armor', rarity: 'common', def: 1, atk: 1 },
  { id: 'bone_strap',       name: 'Bone Shield Strap', type: 'armor', rarity: 'common', def: 3 },
  { id: 'chainmail_scraps', name: 'Chainmail Scraps',  type: 'armor', rarity: 'common', def: 2 },
  { id: 'quilted_gambeson', name: 'Quilted Gambeson',  type: 'armor', rarity: 'common', def: 2, atk: 1 },
  { id: 'scrapmetal_cuirass', name: 'Scrapmetal Cuirass', type: 'armor', rarity: 'common', def: 3 },
];

const RARE_ARMORS = [
  { id: 'wraithweave_cloak', name: 'Wraithweave Cloak', type: 'armor', rarity: 'rare', def: 6 },
  { id: 'golem_plate',       name: 'Golem Plate',       type: 'armor', rarity: 'rare', def: 9 },
  { id: 'lichs_aegis',       name: "Lich's Aegis",      type: 'armor', rarity: 'rare', def: 5, atk: 3 },
  { id: 'drakehide_mail',    name: 'Drakehide Mail',    type: 'armor', rarity: 'rare', def: 7, atk: 1 },
  { id: 'sable_drake_scale', name: 'Sable Drake Scale', type: 'armor', rarity: 'rare', def: 7, atk: 1 },
  { id: 'ironroot_bark_plate', name: 'Ironroot Bark Plate', type: 'armor', rarity: 'rare', def: 8 },
];

const EPIC_ARMORS = [
  { id: 'fallen_king_aegis', name: 'Aegis of the Fallen King', type: 'armor', rarity: 'epic', def: 13 },
  { id: 'stormplate',        name: 'Stormplate Harness',       type: 'armor', rarity: 'epic', def: 11, atk: 3 },
  { id: 'voidweave_mantle',  name: 'Voidweave Mantle',         type: 'armor', rarity: 'epic', def: 14 },
  { id: 'drakebone_bulwark', name: 'Drakebone Bulwark',        type: 'armor', rarity: 'epic', def: 12, atk: 2 },
  { id: 'duskwoven_aegis',   name: 'Duskwoven Aegis',          type: 'armor', rarity: 'epic', def: 13, atk: 2 },
];

const LEGENDARY_ARMORS = [
  { id: 'eternal_guardian',     name: 'Armor of the Eternal Guardian', type: 'armor', rarity: 'legendary', def: 17 },
  { id: 'void_sovereign_crown', name: 'Crown of the Void Sovereign',   type: 'armor', rarity: 'legendary', def: 14, atk: 5 },
  { id: 'undying_vow_mantle',   name: 'Mantle of the Undying Vow',     type: 'armor', rarity: 'legendary', def: 16, atk: 3 },
];

const COMMON_CHESTPIECES = [
  { id: 'rough_chainmail',  name: "Rough Traveler's Cloak",   type: 'chestpiece', rarity: 'common', def: 3 },
  { id: 'padded_jerkin',    name: 'Padded Cloak',     type: 'chestpiece', rarity: 'common', def: 2, atk: 1 },
  { id: 'banded_hauberk',   name: 'Banded Mantle',    type: 'chestpiece', rarity: 'common', def: 4 },
  { id: 'studded_cuirass',  name: 'Studded Cloak',  type: 'chestpiece', rarity: 'common', def: 3, atk: 1 },
];

const RARE_CHESTPIECES = [
  { id: 'wyrmscale_hauberk', name: 'Wyrmscale Cloak',   type: 'chestpiece', rarity: 'rare', def: 8 },
  { id: 'cinder_chainmail',  name: 'Cinderweave Cloak',    type: 'chestpiece', rarity: 'rare', def: 6, atk: 2 },
  { id: 'wraithlink_mail',   name: 'Wraithlink Cloak',     type: 'chestpiece', rarity: 'rare', def: 7, atk: 1 },
  { id: 'gilded_cuirass',    name: 'Gilded Mantle',      type: 'chestpiece', rarity: 'rare', def: 9 },
];

const EPIC_CHESTPIECES = [
  { id: 'titanforged_plate', name: 'Titanforged Cloak', type: 'chestpiece', rarity: 'epic', def: 14 },
  { id: 'voidlink_hauberk',  name: 'Voidlink Cloak',      type: 'chestpiece', rarity: 'epic', def: 12, atk: 3 },
  { id: 'dragonscale_mail',  name: 'Dragonscale Cloak',      type: 'chestpiece', rarity: 'epic', def: 15 },
  { id: 'stormforged_cuirass', name: 'Stormforged Mantle', type: 'chestpiece', rarity: 'epic', def: 13, atk: 2 },
];

const LEGENDARY_CHESTPIECES = [
  { id: 'kings_chainmail',  name: "The King's Last Cloak", type: 'chestpiece', rarity: 'legendary', def: 18 },
  { id: 'sovereign_hauberk', name: 'Sovereign Mantle',         type: 'chestpiece', rarity: 'legendary', def: 16, atk: 4 },
];

const COMMON_GREAVES = [
  { id: 'leather_greaves',  name: 'Leather Greaves',  type: 'greaves', rarity: 'common', def: 2 },
  { id: 'iron_shinguards',  name: 'Iron Shinguards',  type: 'greaves', rarity: 'common', def: 3 },
  { id: 'padded_legwraps',  name: 'Padded Legwraps',  type: 'greaves', rarity: 'common', def: 1, atk: 1 },
  { id: 'banded_greaves',   name: 'Banded Greaves',   type: 'greaves', rarity: 'common', def: 3 },
];

const RARE_GREAVES = [
  { id: 'wolfstride_greaves', name: 'Wolfstride Greaves',  type: 'greaves', rarity: 'rare', def: 6 },
  { id: 'emberwrap_greaves',  name: 'Emberwrap Greaves',   type: 'greaves', rarity: 'rare', def: 5, atk: 2 },
  { id: 'shadowmail_greaves', name: 'Shadowmail Greaves',  type: 'greaves', rarity: 'rare', def: 7 },
  { id: 'gilded_shinguards',  name: 'Gilded Shinguards',   type: 'greaves', rarity: 'rare', def: 6, atk: 1 },
];

const EPIC_GREAVES = [
  { id: 'titan_greaves',     name: 'Titan Greaves',        type: 'greaves', rarity: 'epic', def: 11 },
  { id: 'voidstep_greaves',  name: 'Voidstep Greaves',     type: 'greaves', rarity: 'epic', def: 9, atk: 3 },
  { id: 'dragonbone_greaves',name: 'Dragonbone Greaves',   type: 'greaves', rarity: 'epic', def: 12 },
  { id: 'stormrider_greaves',name: 'Stormrider Greaves',   type: 'greaves', rarity: 'epic', def: 10, atk: 2 },
];

const LEGENDARY_GREAVES = [
  { id: 'kings_greaves',     name: "The King's Last Greaves", type: 'greaves', rarity: 'legendary', def: 15 },
  { id: 'sovereign_greaves', name: 'Sovereign Greaves',        type: 'greaves', rarity: 'legendary', def: 13, atk: 3 },
];

const COMMON_FOOTWEAR = [
  { id: 'worn_boots',     name: 'Worn Boots',       type: 'footwear', rarity: 'common', def: 1, atk: 1 },
  { id: 'leather_sandals',name: 'Leather Sandals',   type: 'footwear', rarity: 'common', def: 2 },
  { id: 'padded_socks',   name: 'Padded Socks',      type: 'footwear', rarity: 'common', def: 1 },
  { id: 'iron_clogs',     name: 'Iron Clogs',        type: 'footwear', rarity: 'common', def: 3 },
];

const RARE_FOOTWEAR = [
  { id: 'swiftstep_boots',  name: 'Swiftstep Boots',   type: 'footwear', rarity: 'rare', atk: 3, def: 1 },
  { id: 'emberstride_boots',name: 'Emberstride Boots', type: 'footwear', rarity: 'rare', def: 5 },
  { id: 'shadowfoot_treads',name: 'Shadowfoot Treads', type: 'footwear', rarity: 'rare', atk: 2, def: 3 },
  { id: 'gilded_sandals',   name: 'Gilded Sandals',    type: 'footwear', rarity: 'rare', def: 6 },
];

const EPIC_FOOTWEAR = [
  { id: 'stormstep_boots',   name: 'Stormstep Boots',    type: 'footwear', rarity: 'epic', atk: 4, def: 4 },
  { id: 'voidtread_boots',   name: 'Voidtread Boots',    type: 'footwear', rarity: 'epic', def: 10 },
  { id: 'dragonhide_boots',  name: 'Dragonhide Boots',   type: 'footwear', rarity: 'epic', def: 9, atk: 2 },
  { id: 'titanfall_greaves', name: 'Titanfall Treads',   type: 'footwear', rarity: 'epic', def: 11 },
];

const LEGENDARY_FOOTWEAR = [
  { id: 'kings_boots',     name: "The King's Last Boots", type: 'footwear', rarity: 'legendary', def: 13, atk: 2 },
  { id: 'sovereign_treads',name: 'Sovereign Treads',       type: 'footwear', rarity: 'legendary', def: 14 },
];

const COMMON_HEADGEAR = [
  { id: 'leather_cap',    name: 'Leather Cap',      type: 'headgear', rarity: 'common', def: 2 },
  { id: 'padded_hood',    name: 'Padded Hood',      type: 'headgear', rarity: 'common', def: 1, atk: 1 },
  { id: 'iron_skullcap',  name: 'Iron Skullcap',    type: 'headgear', rarity: 'common', def: 3 },
  { id: 'banded_helm',    name: 'Banded Helm',      type: 'headgear', rarity: 'common', def: 2, atk: 1 },
];

const RARE_HEADGEAR = [
  { id: 'wolfcrest_helm',   name: 'Wolfcrest Helm',    type: 'headgear', rarity: 'rare', def: 6 },
  { id: 'emberwrought_hood',name: 'Emberwrought Hood', type: 'headgear', rarity: 'rare', def: 5, atk: 2 },
  { id: 'shadowveil_cowl',  name: 'Shadowveil Cowl',   type: 'headgear', rarity: 'rare', atk: 3, def: 3 },
  { id: 'gilded_circlet',   name: 'Gilded Circlet',    type: 'headgear', rarity: 'rare', def: 7 },
];

const EPIC_HEADGEAR = [
  { id: 'titan_greathelm',   name: 'Titan Greathelm',   type: 'headgear', rarity: 'epic', def: 11 },
  { id: 'voidsight_cowl',    name: 'Voidsight Cowl',    type: 'headgear', rarity: 'epic', atk: 4, def: 5 },
  { id: 'dragonbone_helm',   name: 'Dragonbone Helm',   type: 'headgear', rarity: 'epic', def: 12 },
  { id: 'stormcrown_visor',  name: 'Stormcrown Visor',  type: 'headgear', rarity: 'epic', atk: 3, def: 8 },
];

const LEGENDARY_HEADGEAR = [
  { id: 'kings_greathelm',   name: "The King's Last Greathelm", type: 'headgear', rarity: 'legendary', def: 15 },
  { id: 'sovereign_circlet',  name: 'Sovereign Circlet',         type: 'headgear', rarity: 'legendary', def: 12, atk: 4 },
];

const THROWABLES = [
  { id: 'throwing_knives', name: 'Throwing Knives', type: 'throwable', rarity: 'common', atk: 4 },
  { id: 'throatslayer', name: 'Throatslayer', type: 'throwable', rarity: 'legendary', atk: 9999, autoKill: true },
];

const COMMON_RINGS = [
  { id: 'copper_band',  name: 'Copper Band',  type: 'ring', rarity: 'common', atk: 1 },
  { id: 'iron_loop',    name: 'Iron Loop',    type: 'ring', rarity: 'common', def: 1 },
  { id: 'silver_hoop',  name: 'Silver Hoop',  type: 'ring', rarity: 'common', atk: 2 },
  { id: 'tin_band',     name: 'Tin Band',     type: 'ring', rarity: 'common', def: 2 },
  { id: 'weathered_signet', name: 'Weathered Signet', type: 'ring', rarity: 'common', atk: 1, def: 1 },
];

const RARE_RINGS = [
  { id: 'ring_embers',   name: 'Ring of Embers',     type: 'ring', rarity: 'rare', atk: 4 },
  { id: 'ring_wardens',  name: 'Ring of Wardens',    type: 'ring', rarity: 'rare', def: 4 },
  { id: 'ring_vanguard', name: 'Ring of the Vanguard', type: 'ring', rarity: 'rare', atk: 3, def: 2 },
  { id: 'ring_echoes',   name: 'Ring of Echoes',     type: 'ring', rarity: 'rare', atk: 2, def: 3 },
  { id: 'ring_hushed_oath', name: 'Ring of the Hushed Oath', type: 'ring', rarity: 'rare', atk: 3, def: 3 },
];

const COMMON_EARRINGS = [
  { id: 'plain_stud',   name: 'Plain Stud',        type: 'earring', rarity: 'common', atk: 1 },
  { id: 'simple_hoop',  name: 'Simple Hoop',       type: 'earring', rarity: 'common', def: 1 },
  { id: 'bone_stud',    name: 'Carved Bone Stud',  type: 'earring', rarity: 'common', atk: 2 },
  { id: 'shell_stud',   name: 'Polished Shell',    type: 'earring', rarity: 'common', def: 2 },
  { id: 'faded_charm_stud', name: 'Faded Charm Stud', type: 'earring', rarity: 'common', atk: 1, def: 1 },
];

const RARE_EARRINGS = [
  { id: 'earring_fury',    name: 'Earring of Fury',       type: 'earring', rarity: 'rare', atk: 4 },
  { id: 'earring_resolve', name: 'Earring of Resolve',    type: 'earring', rarity: 'rare', def: 4 },
  { id: 'earring_phoenix', name: 'Earring of the Phoenix', type: 'earring', rarity: 'rare', atk: 3, def: 2 },
  { id: 'earring_tide',    name: 'Earring of the Tide',   type: 'earring', rarity: 'rare', atk: 2, def: 3 },
  { id: 'earring_wandering_star', name: 'Earring of the Wandering Star', type: 'earring', rarity: 'rare', atk: 4, def: 1 },
];

// Trinkets — a slot of their own, gated behind the "Curious Charms" body
// mod. Unlike rings/earrings (mostly ATK/DEF), trinkets lean on Luck as
// their signature stat, giving the Luck system a fresh equippable source
// beyond collectibles and the Fortune skill branch.
const COMMON_TRINKETS = [
  { id: 'rabbit_bone_charm', name: 'Rabbit Bone Charm',  type: 'trinket', rarity: 'common', luck: 2 },
  { id: 'lucky_button',      name: 'Lucky Button',       type: 'trinket', rarity: 'common', luck: 2 },
  { id: 'bent_copper_token', name: 'Bent Copper Token',  type: 'trinket', rarity: 'common', luck: 3 },
  { id: 'braided_charm_cord',name: 'Braided Charm Cord', type: 'trinket', rarity: 'common', luck: 2, def: 1 },
  { id: 'wishbone_fragment', name: 'Wishbone Fragment',  type: 'trinket', rarity: 'common', luck: 3 },
];

const RARE_TRINKETS = [
  { id: 'charm_fair_winds',  name: 'Charm of Fair Winds', type: 'trinket', rarity: 'rare', luck: 5 },
  { id: 'gamblers_trinket',  name: "Gambler's Trinket",   type: 'trinket', rarity: 'rare', luck: 6 },
  { id: 'four_leaf_pendant', name: 'Four-Leaf Pendant',   type: 'trinket', rarity: 'rare', luck: 5, atk: 1 },
  { id: 'warded_talisman',   name: 'Warded Talisman',     type: 'trinket', rarity: 'rare', luck: 4, def: 2 },
  { id: 'wanderers_talisman',name: 'Talisman of the Wanderer', type: 'trinket', rarity: 'rare', luck: 5, atk: 2 },
];

// Necklaces — a slot of their own, gated behind the "A Proper Neck-Region
// Accessory" body mod. Positioned as the "raw power" accessory: a slightly
// higher combined ATK/DEF budget than rings/earrings at the same rarity.
const COMMON_NECKLACES = [
  { id: 'beaded_cord',       name: 'Beaded Cord',        type: 'necklace', rarity: 'common', atk: 2 },
  { id: 'iron_chain',        name: 'Iron Chain',         type: 'necklace', rarity: 'common', def: 2 },
  { id: 'polished_locket',   name: 'Polished Locket',    type: 'necklace', rarity: 'common', atk: 1, def: 1 },
  { id: 'woven_vine_necklace', name: 'Woven Vine Necklace', type: 'necklace', rarity: 'common', def: 2, atk: 1 },
];

const RARE_NECKLACES = [
  { id: 'necklace_vigor',     name: 'Necklace of Vigor',        type: 'necklace', rarity: 'rare', atk: 5 },
  { id: 'necklace_bulwark',   name: 'Necklace of the Bulwark',  type: 'necklace', rarity: 'rare', def: 5 },
  { id: 'pendant_twin_fangs', name: 'Pendant of Twin Fangs',    type: 'necklace', rarity: 'rare', atk: 4, def: 3 },
  { id: 'chain_unbroken',     name: 'Chain of the Unbroken',    type: 'necklace', rarity: 'rare', atk: 3, def: 4 },
];

const COMMON_SKILLBOOKS = [
  { id: 'tome_vigor',   name: 'Tome of Vigor',   type: 'skillbook', rarity: 'common', effect: { hp: 8, atk: 0, def: 0 } },
  { id: 'tome_power',   name: 'Tome of Power',   type: 'skillbook', rarity: 'common', effect: { hp: 0, atk: 1, def: 0 } },
  { id: 'tome_wards',   name: 'Tome of Wards',   type: 'skillbook', rarity: 'common', effect: { hp: 0, atk: 0, def: 1 } },
  { id: 'tome_balance', name: 'Tome of Balance', type: 'skillbook', rarity: 'common', effect: { hp: 0, atk: 1, def: 1 } },
];

const RARE_SKILLBOOKS = [
  { id: 'codex_fang',  name: 'Codex of the Crimson Fang', type: 'skillbook', rarity: 'rare', ability: 'lifesteal' },
  { id: 'codex_eyes',  name: 'Codex of Sharpened Eyes',   type: 'skillbook', rarity: 'rare', ability: 'crit' },
  { id: 'codex_iron',  name: 'Codex of Iron Will',        type: 'skillbook', rarity: 'rare', ability: 'ironskin' },
  { id: 'codex_storm', name: 'Codex of the Storm',        type: 'skillbook', rarity: 'rare', ability: 'counter' },
];

const ABILITY_INFO = {
  lifesteal:   { name: 'Vampiric Strike', desc: 'Heal 20% of the damage you deal.' },
  crit:        { name: 'Critical Eye',    desc: '15% chance to deal double damage.' },
  ironskin:    { name: 'Stoneskin',       desc: '15% chance to fully block an enemy attack.' },
  counter:     { name: 'Riposte',         desc: '15% chance to strike back when hit.' },
  echo:        { name: 'Echo Strike',     desc: '20% chance your attack strikes again for 50% bonus damage.' },
  momentum:    { name: 'Momentum',        desc: 'Deal up to 25% more damage the more wounded your target already is.' },
  thorns:      { name: 'Thorns',          desc: 'Automatically reflect 25% of damage taken back at your attacker.' },
  second_wind: { name: 'Second Wind',     desc: 'The first time you would die this run, survive instead with 1 HP.' },
  soul_rend:       { name: 'Soul Rend',       desc: '20% chance your attack completely ignores the enemy\'s DEF.' },
  withering_curse: { name: 'Withering Curse', desc: '15% chance to curse your target, cutting their ATK by 30% for the rest of the fight.' },
  grave_pact:      { name: 'Grave Pact',      desc: '10% chance a killing blow heals you for 20% of the fallen enemy\'s max HP.' },
};

// Grand Library exclusive tomes — unique effects not found on any normal skillbook.
const EXCLUSIVE_LIBRARY_BOOKS = [
  { id: 'codex_echo',        name: 'Codex of the Second Strike', type: 'skillbook', rarity: 'epic',      ability: 'echo' },
  { id: 'codex_momentum',    name: 'Codex of Momentum',          type: 'skillbook', rarity: 'epic',      ability: 'momentum' },
  { id: 'codex_thorns',      name: 'Codex of Thorns',            type: 'skillbook', rarity: 'epic',      ability: 'thorns' },
  { id: 'codex_second_wind', name: 'Codex of the Second Wind',   type: 'skillbook', rarity: 'legendary', ability: 'second_wind' },
];

// Banned Books — Figures 7 unlock. Forbidden tomes with unique new abilities,
// folded into the Grand Library's exclusive stock once bought with Souls.
const BANNED_BOOKS = [
  { id: 'codex_soul_rend',       name: 'Forbidden Codex of Soul Rend',    type: 'skillbook', rarity: 'legendary', ability: 'soul_rend' },
  { id: 'codex_withering_curse', name: 'Grimoire of the Withering Curse', type: 'skillbook', rarity: 'legendary', ability: 'withering_curse' },
  { id: 'codex_grave_pact',      name: 'Pact of the Open Grave',          type: 'skillbook', rarity: 'legendary', ability: 'grave_pact' },
];

const KEY_ITEMS = [
  { id: 'heart_mountain',  name: 'Heart of the Mountain', icon: '❤️‍🔥', desc: '+20 max HP, applied instantly.' },
  { id: 'thief_signet',    name: "Thief's Signet",        icon: '💍', desc: '+15% gold from defeated foes.' },
  { id: 'sage_monocle',    name: "Sage's Monocle",        icon: '🧐', desc: '+15% XP from defeated foes.' },
  { id: 'rabbit_foot',     name: "Lucky Rabbit's Foot",   icon: '🐾', desc: '+8 Luck.' },
  { id: 'berserker_tooth', name: "Berserker's Tooth",     icon: '🦷', desc: '+3 ATK, applied instantly.' },
  { id: 'guardian_ward',   name: "Guardian's Ward",       icon: '🛡️', desc: '+3 DEF, applied instantly.' },
  { id: 'phoenix_charm',   name: 'Phoenix Down Charm',    icon: '🪶', desc: 'Potions and Elixirs heal 15 more HP.' },
  { id: 'merchant_ledger', name: "Merchant's Ledger",     icon: '📒', desc: 'Merchant prices reduced by 15%.' },
  { id: 'handcannon',      name: 'Handcannon',            icon: '🔫', desc: 'A free, no-retaliation ranged shot using Bullets instead of melee.' },
  { id: 'bow',             name: 'Hunting Bow',           icon: '🏹', desc: 'A free, no-retaliation ranged shot using Arrows instead of melee.' },
];

// Relic Room exclusives — bought with gold, never drop from combat. Live in
// player.keyItems alongside normal Key Items once purchased.
const EXCLUSIVE_RELICS = [
  { id: 'ember_heart',       name: 'Ember-Bound Heart',   icon: '💗', desc: '+30 max HP and +2 ATK, applied instantly.' },
  { id: 'gamblers_coin',     name: "Gambler's Coin",       icon: '🪙', desc: 'Wheel of Fortune rooms appear noticeably more often.' },
  { id: 'archivists_key',    name: "Archivist's Key",      icon: '🗝️', desc: 'The Grand Library always stocks an extra exclusive tome.' },
  { id: 'wanderers_compass', name: "Wanderer's Compass",   icon: '🧭', desc: 'Treasure and Collector rooms appear noticeably more often.' },
];

// Deluxe Merchant — Figures 4. Fixed stock of absurdly expensive, absurdly
// strong items. 1% chance to appear once unlocked.
const DELUXE_MERCHANT_STOCK = [
  { id: 'deluxe_worldender',       name: 'The World-Ender',        type: 'weapon',    rarity: 'mythic', atk: 45,          price: 1800 },
  { id: 'deluxe_aegis_eternity',   name: 'Aegis of Eternity',      type: 'armor',     rarity: 'mythic', def: 35,          price: 1600 },
  { id: 'deluxe_ring_omniscience', name: 'Ring of Omniscience',    type: 'ring',      rarity: 'mythic', atk: 10, def: 10, price: 1200 },
  { id: 'deluxe_earring_apocrypha',name: 'Earring of Apocrypha',   type: 'earring',   rarity: 'mythic', atk: 8,  def: 8,  price: 1000 },
  { id: 'deluxe_phoenix_pact',     name: 'The Phoenix Pact',       type: 'skillbook', rarity: 'mythic', ability: 'second_wind', price: 900 },
];

/* ---------------------------------------------------------
   GEAR VISUALS — emoji + colour-filter system for equippable
   gear (weapon, armor, chestpiece, greaves, footwear, ring,
   earring). Deliberately NOT applied to skillbooks — those
   stay as the plain BookOpen icon. Each item deterministically
   picks one emoji from its type's pool (same item = same emoji
   every time) and a CSS filter keyed to rarity, so ~100+ gear
   items get visual variety without needing hand-drawn art.
--------------------------------------------------------- */

const GEAR_EMOJI_POOLS = {
  weapon:     ['🗡️', '⚔️', '🔪', '🪓', '🔱'],
  armor:      ['🛡️', '🥋'],
  chestpiece: ['🦺', '🥼'],
  greaves:    ['👖', '🦵'],
  footwear:   ['👢', '🥾', '👞'],
  ring:       ['💍'],
  earring:    ['📿'],
  headgear:   ['🪖', '⛑️', '👑', '🎩'],
  trinket:    ['🍀', '🔮', '🧿', '🪬'],
  necklace:   ['💠', '🔶', '🔷'],
};

const GEAR_RARITY_FILTER = {
  common:    'saturate(0.6) brightness(0.95)',
  rare:      'hue-rotate(215deg) saturate(1.5) brightness(1.05)',
  epic:      'hue-rotate(25deg) saturate(1.6) brightness(1.1)',
  legendary: 'hue-rotate(45deg) saturate(1.8) brightness(1.2)',
  mythic:    'hue-rotate(165deg) saturate(1.7) brightness(1.15)',
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function getGearEmoji(item) {
  const pool = GEAR_EMOJI_POOLS[item.type];
  if (!pool) return '❔';
  return pool[hashStr(item.id || item.name || '') % pool.length];
}

function getGearFilter(rarity) {
  return GEAR_RARITY_FILTER[rarity] || GEAR_RARITY_FILTER.common;
}

// Some enemies reuse another enemy's preferred emoji glyph (when the id-
// generation tooling ran out of thematically-fitting alternatives) but get
// a distinct colourway and/or horizontal flip so they never look identical
// on screen. `emojiFilter`/`emojiFlip` are optional fields on ENEMY_TYPES
// entries; absent on the vast majority of enemies.
function enemyEmojiStyle(enemy) {
  return {
    display: 'inline-block',
    filter: (enemy && enemy.emojiFilter) || 'none',
    transform: (enemy && enemy.emojiFlip) ? 'scaleX(-1)' : 'none',
  };
}

const SKILL_TREE = [
  { id: 'vigor1',   branch: 'vigor',   tier: 1, reqDepth: 5,   requires: null,     name: 'Vigor I',    desc: '+15 max HP', effect: { maxHp: 15 } },
  { id: 'vigor2',   branch: 'vigor',   tier: 2, reqDepth: 15,  requires: 'vigor1', name: 'Vigor II',   desc: '+25 max HP', effect: { maxHp: 25 } },
  { id: 'vigor3',   branch: 'vigor',   tier: 3, reqDepth: 30,  requires: 'vigor2', name: 'Vigor III',  desc: '+35 max HP', effect: { maxHp: 35 } },
  { id: 'vigor4',   branch: 'vigor',   tier: 4, reqDepth: 50,  requires: 'vigor3', name: 'Vigor IV',   desc: '+50 max HP', effect: { maxHp: 50 } },
  { id: 'vigor5',   branch: 'vigor',   tier: 5, reqDepth: 70,  requires: 'vigor4', name: 'Vigor V',    desc: '+65 max HP', effect: { maxHp: 65 }, requiresCoinsTradedIn: true },
  { id: 'vigor6',   branch: 'vigor',   tier: 6, reqDepth: 90,  requires: 'vigor5', name: 'Vigor VI',   desc: '+80 max HP', effect: { maxHp: 80 }, requiresCoinsTradedIn: true },
  { id: 'vigor7',   branch: 'vigor',   tier: 7, reqDepth: 110, requires: 'vigor6', name: 'Vigor VII',  desc: '+100 max HP', effect: { maxHp: 100 }, requiresCoinsTradedIn: true },
  { id: 'vigor8',   branch: 'vigor',   tier: 8, reqDepth: 130, requires: 'vigor7', name: 'Vigor VIII', desc: '+120 max HP', effect: { maxHp: 120 }, requiresCoinsTradedIn: true },
  { id: 'vigor9',   branch: 'vigor',   tier: 9, reqDepth: 150, requires: 'vigor8', name: 'Vigor IX',   desc: '+150 max HP', effect: { maxHp: 150 }, requiresCoinsTradedIn: true },
  { id: 'vigor10',  branch: 'vigor',   tier: 10, reqDepth: 180, requires: 'vigor9', name: 'Vigor X',  desc: '+200 max HP', effect: { maxHp: 200 }, requiresCoinsTradedIn: true },
  { id: 'vigor11',  branch: 'vigor',   tier: 11, reqDepth: 210, requires: 'vigor10', name: 'Vigor XI',  desc: '+180 max HP', effect: { maxHp: 180 }, requiresStamps5TradedIn: true },
  { id: 'vigor12',  branch: 'vigor',   tier: 12, reqDepth: 240, requires: 'vigor11', name: 'Vigor XII', desc: '+220 max HP', effect: { maxHp: 220 }, requiresStamps5TradedIn: true },
  { id: 'vigor13',  branch: 'vigor',   tier: 13, reqDepth: 270, requires: 'vigor12', name: 'Vigor XIII', desc: '+260 max HP', effect: { maxHp: 260 }, requiresStamps5TradedIn: true },
  { id: 'vigor14',  branch: 'vigor',   tier: 14, reqDepth: 300, requires: 'vigor13', name: 'Vigor XIV', desc: '+300 max HP', effect: { maxHp: 300 }, requiresStamps5TradedIn: true },
  { id: 'vigor15',  branch: 'vigor',   tier: 15, reqDepth: 330, requires: 'vigor14', name: 'Vigor XV',  desc: '+400 max HP', effect: { maxHp: 400 }, requiresStamps5TradedIn: true },

  { id: 'might1',   branch: 'might',   tier: 1, reqDepth: 5,   requires: null,     name: 'Might I',    desc: '+1 ATK, +1 DEF', effect: { atk: 1, def: 1 } },
  { id: 'might2',   branch: 'might',   tier: 2, reqDepth: 15,  requires: 'might1', name: 'Might II',   desc: '+2 ATK, +1 DEF', effect: { atk: 2, def: 1 } },
  { id: 'might3',   branch: 'might',   tier: 3, reqDepth: 30,  requires: 'might2', name: 'Might III',  desc: '+2 ATK, +2 DEF', effect: { atk: 2, def: 2 } },
  { id: 'might4',   branch: 'might',   tier: 4, reqDepth: 50,  requires: 'might3', name: 'Might IV',   desc: '+3 ATK, +3 DEF', effect: { atk: 3, def: 3 } },
  { id: 'might5',   branch: 'might',   tier: 5, reqDepth: 70,  requires: 'might4', name: 'Might V',    desc: '+4 ATK, +3 DEF', effect: { atk: 4, def: 3 }, requiresCoinsTradedIn: true },
  { id: 'might6',   branch: 'might',   tier: 6, reqDepth: 90,  requires: 'might5', name: 'Might VI',   desc: '+4 ATK, +4 DEF', effect: { atk: 4, def: 4 }, requiresCoinsTradedIn: true },
  { id: 'might7',   branch: 'might',   tier: 7, reqDepth: 110, requires: 'might6', name: 'Might VII',  desc: '+5 ATK, +4 DEF', effect: { atk: 5, def: 4 }, requiresCoinsTradedIn: true },
  { id: 'might8',   branch: 'might',   tier: 8, reqDepth: 130, requires: 'might7', name: 'Might VIII', desc: '+5 ATK, +5 DEF', effect: { atk: 5, def: 5 }, requiresCoinsTradedIn: true },
  { id: 'might9',   branch: 'might',   tier: 9, reqDepth: 150, requires: 'might8', name: 'Might IX',   desc: '+6 ATK, +5 DEF', effect: { atk: 6, def: 5 }, requiresCoinsTradedIn: true },
  { id: 'might10',  branch: 'might',   tier: 10, reqDepth: 180, requires: 'might9', name: 'Might X',  desc: '+8 ATK, +8 DEF', effect: { atk: 8, def: 8 }, requiresCoinsTradedIn: true },
  { id: 'might11',  branch: 'might',   tier: 11, reqDepth: 210, requires: 'might10', name: 'Might XI',  desc: '+9 ATK, +9 DEF', effect: { atk: 9, def: 9 }, requiresStamps5TradedIn: true },
  { id: 'might12',  branch: 'might',   tier: 12, reqDepth: 240, requires: 'might11', name: 'Might XII', desc: '+10 ATK, +10 DEF', effect: { atk: 10, def: 10 }, requiresStamps5TradedIn: true },
  { id: 'might13',  branch: 'might',   tier: 13, reqDepth: 270, requires: 'might12', name: 'Might XIII', desc: '+11 ATK, +11 DEF', effect: { atk: 11, def: 11 }, requiresStamps5TradedIn: true },
  { id: 'might14',  branch: 'might',   tier: 14, reqDepth: 300, requires: 'might13', name: 'Might XIV', desc: '+12 ATK, +12 DEF', effect: { atk: 12, def: 12 }, requiresStamps5TradedIn: true },
  { id: 'might15',  branch: 'might',   tier: 15, reqDepth: 330, requires: 'might14', name: 'Might XV',  desc: '+15 ATK, +15 DEF', effect: { atk: 15, def: 15 }, requiresStamps5TradedIn: true },

  { id: 'fortune1', branch: 'fortune', tier: 1,  reqDepth: 5,   requires: null,       name: 'Fortune I',    desc: '+3 Luck',  effect: { luck: 3 } },
  { id: 'fortune2', branch: 'fortune', tier: 2,  reqDepth: 15,  requires: 'fortune1', name: 'Fortune II',   desc: '+5 Luck',  effect: { luck: 5 } },
  { id: 'fortune3', branch: 'fortune', tier: 3,  reqDepth: 30,  requires: 'fortune2', name: 'Fortune III',  desc: '+8 Luck',  effect: { luck: 8 } },
  { id: 'fortune4', branch: 'fortune', tier: 4,  reqDepth: 50,  requires: 'fortune3', name: 'Fortune IV',   desc: '+12 Luck', effect: { luck: 12 } },
  { id: 'fortune5', branch: 'fortune', tier: 5,  reqDepth: 70,  requires: 'fortune4', name: 'Fortune V',    desc: '+15 Luck', effect: { luck: 15 }, requiresCoinsTradedIn: true },
  { id: 'fortune6', branch: 'fortune', tier: 6,  reqDepth: 90,  requires: 'fortune5', name: 'Fortune VI',   desc: '+18 Luck', effect: { luck: 18 }, requiresCoinsTradedIn: true },
  { id: 'fortune7', branch: 'fortune', tier: 7,  reqDepth: 110, requires: 'fortune6', name: 'Fortune VII',  desc: '+22 Luck', effect: { luck: 22 }, requiresCoinsTradedIn: true },
  { id: 'fortune8', branch: 'fortune', tier: 8,  reqDepth: 130, requires: 'fortune7', name: 'Fortune VIII', desc: '+26 Luck', effect: { luck: 26 }, requiresCoinsTradedIn: true },
  { id: 'fortune9', branch: 'fortune', tier: 9,  reqDepth: 150, requires: 'fortune8', name: 'Fortune IX',   desc: '+30 Luck', effect: { luck: 30 }, requiresCoinsTradedIn: true },
  { id: 'fortune10',branch: 'fortune', tier: 10, reqDepth: 180, requires: 'fortune9', name: 'Fortune X',   desc: '+40 Luck', effect: { luck: 40 }, requiresCoinsTradedIn: true },
  { id: 'fortune11',branch: 'fortune', tier: 11, reqDepth: 210, requires: 'fortune10', name: 'Fortune XI',  desc: '+45 Luck', effect: { luck: 45 }, requiresStamps5TradedIn: true },
  { id: 'fortune12',branch: 'fortune', tier: 12, reqDepth: 240, requires: 'fortune11', name: 'Fortune XII', desc: '+50 Luck', effect: { luck: 50 }, requiresStamps5TradedIn: true },
  { id: 'fortune13',branch: 'fortune', tier: 13, reqDepth: 270, requires: 'fortune12', name: 'Fortune XIII', desc: '+55 Luck', effect: { luck: 55 }, requiresStamps5TradedIn: true },
  { id: 'fortune14',branch: 'fortune', tier: 14, reqDepth: 300, requires: 'fortune13', name: 'Fortune XIV', desc: '+60 Luck', effect: { luck: 60 }, requiresStamps5TradedIn: true },
  { id: 'fortune15',branch: 'fortune', tier: 15, reqDepth: 330, requires: 'fortune14', name: 'Fortune XV',  desc: '+75 Luck', effect: { luck: 75 }, requiresStamps5TradedIn: true },
];

/* ---------------------------------------------------------
   COINS 2 — second coin collection prestige tree.
   Unlocked by trading in a second full set of 50 coins.
   Buffs throwing knives specifically.
--------------------------------------------------------- */

const COINS2_TREE = [
  { id: 'knife_dmg1',   name: 'Weighted Blade I',    desc: 'Throwing knives deal +2 bonus damage.',          cost: 3, effect: { knifeDmg: 2 } },
  { id: 'knife_dmg2',   name: 'Weighted Blade II',   desc: 'Throwing knives deal +3 more bonus damage.',      cost: 4, effect: { knifeDmg: 3 } },
  { id: 'knife_dmg3',   name: 'Weighted Blade III',  desc: 'Throwing knives deal +5 more bonus damage.',      cost: 5, effect: { knifeDmg: 5 } },
  { id: 'knife_crit1',  name: 'Spinning Throw I',    desc: '10% chance a thrown knife deals double damage.',  cost: 4, effect: { knifeCrit: 10 } },
  { id: 'knife_crit2',  name: 'Spinning Throw II',   desc: '+10% more knife crit chance (20% total).',        cost: 5, effect: { knifeCrit: 10 } },
  { id: 'knife_save1',  name: 'Caught in the Air I', desc: '10% chance a thrown knife is not consumed.',      cost: 4, effect: { knifeSave: 10 } },
  { id: 'knife_save2',  name: 'Caught in the Air II',desc: '+15% more knife save chance (25% total).',        cost: 5, effect: { knifeSave: 15 } },
];

/* ---------------------------------------------------------
   SLICING GIANTS — Coins 3 prestige tree.
   Boss-specific knife buffs (rare + legendary enemies).
   5 tiers, each adding to damage, crit, and bonus blade proc.
--------------------------------------------------------- */

const SLICING_GIANTS_TREE = [
  { id: 'sg1', tier: 1, name: 'Giant Slayer I',   desc: '+3 knife damage vs rare/legendary foes. 5% chance to throw a free bonus blade (independent crit).', cost: 4, effect: { bossDmg: 3, bonusBlade: 5 } },
  { id: 'sg2', tier: 2, name: 'Giant Slayer II',  desc: '+3 more boss knife damage. 10% boss knife crit chance.', cost: 5, effect: { bossDmg: 3, bossCrit: 10 } },
  { id: 'sg3', tier: 3, name: 'Giant Slayer III', desc: '+5 more boss knife damage. +5% bonus blade chance (10% total).', cost: 6, effect: { bossDmg: 5, bonusBlade: 5 } },
  { id: 'sg4', tier: 4, name: 'Giant Slayer IV',  desc: '+10% more boss knife crit (20% total). +5% bonus blade chance (15% total).', cost: 7, effect: { bossCrit: 10, bonusBlade: 5 } },
  { id: 'sg5', tier: 5, name: 'Giant Slayer V',   desc: '+8 more boss knife damage. +10% more boss crit (30% total). +10% bonus blade (25% total). Giants fall.', cost: 8, effect: { bossDmg: 8, bossCrit: 10, bonusBlade: 10 } },
];

/* ---------------------------------------------------------
   RANGED MASTERY — Cards 4 prestige tree. Five one-time unlocks,
   bought directly with Souls, pushing Handcannon, Bow, and
   Throwing Knife damage into "extreme" territory. Piercing Throw
   is the standout: a rare, huge, defense-ignoring knife megacrit.
--------------------------------------------------------- */

const RANGED_MASTERY_TREE = [
  { id: 'deadeye_handcannon', name: 'Deadeye: Handcannon', desc: 'Handcannon shots deal +18 bonus damage.', cost: 70, effect: { handcannonDmg: 18 } },
  { id: 'deadeye_bow',        name: 'Deadeye: Bow',        desc: 'Bow shots deal +14 bonus damage.', cost: 60, effect: { bowDmg: 14 } },
  { id: 'deadeye_knives',     name: 'Deadeye: Knives',     desc: 'Thrown knives deal +10 bonus damage.', cost: 60, effect: { knifeDmg: 10 } },
  { id: 'ammo_conservation',  name: 'Ammo Conservation',   desc: '25% chance Bullets or Arrows are not consumed when fired.', cost: 90, effect: { ammoSave: 25 } },
  { id: 'piercing_throw',     name: 'Piercing Throw',      desc: '8% chance a thrown knife scores a piercing megacrit — 6× damage that completely ignores enemy DEF.', cost: 130, effect: { pierceCrit: 8 } },
];

/* ---------------------------------------------------------
   BESTIARY FLAVOUR — one evocative line per enemy
--------------------------------------------------------- */

const BESTIARY_FLAVOUR = {
  goblin:             'Scrappy, opportunistic, and cowardly in packs — until one of them isn\'t.',
  rat:                'A living tide of teeth and matted fur. They don\'t stop.',
  skeleton:           'The bones remember how to fight, even without the body that once did the thinking.',
  bandit:             'Desperate people with nothing left to lose and a blade in their hand.',
  drake:              'Young enough to be reckless. Old enough to breathe fire.',
  wraith:             'What\'s left of a person when everything worth remembering is gone.',
  golem:              'It was built to protect something. Whatever that was is long gone.',
  lich:               'A sorcerer who chose power over mortality, and got both wrong.',
  cultist:            'They came here willingly. That\'s the part that should scare you.',
  wolf:               'The dungeon didn\'t make them feral. They were always like this.',
  orc:                'Battle-scarred and proud of every mark. They\'ve earned their cruelty.',
  stalker:            'It\'s been following you since the last junction. You just noticed now.',
  wyrm:               'Old enough to have watched kingdoms rise, and bored enough to destroy them.',
  vampire:            'Elegant, patient, and entirely comfortable with what it has become.',
  abyssal:            'Something pulled up from depths that don\'t appear on any map.',
  tyrant:             'The bones of a warlord, still giving orders. Nobody told them the war ended.',
  magma_slime:        'It doesn\'t hate you. It doesn\'t feel anything. It just burns.',
  cinder_wretch:      'Once human, probably. The fire got inside and never left.',
  ash_ghoul:          'It haunts the place it died. The forge floor is still warm beneath it.',
  ember_stalker:      'Patient as cooling coal, and twice as dangerous when it finally sparks.',
  molten_behemoth:    'The earth doesn\'t just shake when it walks. It apologises.',
  cinderwing_roc:     'It builds its nest in active volcanoes. The eggs glow for weeks before hatching.',
  voidforged_golem:   'Hammered into shape by someone who had no business working with void-metal.',
  ashen_lichking:     'It burned its own phylactery. Death is no longer a threat it responds to.',
  frost_imp:          'Spite, condensed into a small cold body and given claws.',
  glacier_wisp:       'A memory of something that died in the cold. It forgot what it was but not that it\'s angry.',
  permafrost_crawler: 'It\'s been under the ice for centuries. It\'s very hungry.',
  snowveil_stalker:   'You can\'t see it in the blizzard. It can see you just fine.',
  glacial_titan:      'Ancient. Patient. The glacier built itself around it, not the other way around.',
  frost_mammoth:      'The cold doesn\'t bother it. You do, though.',
  rime_sorceress:     'She chose exile in the Wastes. The Wastes chose to become her domain.',
  blizzard_wraith:    'The storm didn\'t kill her. She became it.',
  drowned_thrall:     'Still going through the motions of a life that ended underwater.',
  coral_lurker:       'The reef grew around it over decades. It grew around the reef right back.',
  silt_revenant:      'The silt swallowed it whole. It came back up wearing the silt as skin.',
  tide_cultist:       'They were waiting for something to rise from the deep. They got their wish.',
  leviathan_spawn:    'Not a young leviathan. A piece of one. Still dangerous. Still furious.',
  drowned_monarch:    'She ruled this city before the waters came. She rules it still.',
  abyss_kraken:       'Eight arms. Eight bad ideas happening simultaneously.',
  sunken_god:         'It was worshipped here once. It prefers that arrangement.',
  starveiled_wisp:    'A fragment of light that got lost between stars and ended up here.',
  fractal_horror:     'It exists in too many dimensions at once. Looking at it directly is a mistake.',
  voidling:           'A creature that has never known anything but the void. It finds the light offensive.',
  null_seraph:        'Something that was meant to be holy. The astral rift had other plans.',
  starcollapse_maw:   'It eats light. Not metaphorically.',
  entropy_weaver:     'It\'s been slowly unmaking the fabric of this place for longer than you\'ve existed.',
  astral_devourer:    'Ancient, patient, and very aware that everything eventually becomes food.',
  eclipse_monarch:    'It rules the space between moments. You\'re trespassing in its kingdom.',
  ossuary_acolyte:    'They took holy orders in a cathedral made of bones. The vows suited them.',
  reliquary_warden:   'What it guards was sacred once. Now it\'s just very old, and so is it.',
  candlewax_ghost:    'It tends the candles that never go out, in a church nobody else remembers.',
  bone_chorister:     'The hymns it sings have no living translation. They still work on the dead.',
  sepulcher_titan:    'Buried at the cathedral\'s founding. Woke up when the last bishop died.',
  reliquary_seraph:   'An angelic form, now hollow, still going through the motions of devotion.',
  osteomancer:        'It learned to read futures in bones. The future it found was this.',
  undying_curator:      'It has catalogued every relic in this place. It is also a relic in this place.',
  glasswing_stalker:    'Its wings are razor-thin panes of living glass. The sound they make in flight is a warning you hear too late.',
  mirrorborn_wraith:    'It crawled out of a reflection and has been convinced it\'s the original ever since.',
  prism_horror:         'Light goes in. Something wrong comes out.',
  shard_golem:          'Built from every mirror ever shattered in anger. It carries all that rage with it.',
  refraction_titan:     'It exists in seventeen places at once. You can only hit it in one of them.',
  meridian_sovereign:   'It rules the space between all reflections. Every mirror in the world is a window into its domain.',
  null_reflection:      'A mirror that has forgotten what it\'s supposed to show. Now it shows only the end.',
  fractured_god:        'Something divine, broken across too many dimensions to be worshipped or reasoned with.',
  moss_revenant:        'The jungle grew back through the grave. It stood up and kept walking.',
  spore_wraith:         'The spores got into the body first. The mind followed eventually, and wished it hadn\'t.',
  thornbound_horror:    'Something the thorns caught, held for decades, and eventually decided to keep.',
  burial_bloom:         'It blooms once every century. The smell draws you closer. That is the point.',
  root_titan:           'The oldest roots in the tomb. They remember when this jungle was a city.',
  tomb_empress:         'She tended these grounds for thirty years before the grounds decided to tend her.',
  verdant_lich:         'It chose the jungle as its phylactery. Every leaf and root is part of it now.',
  the_overgrowth:       'It is not in the jungle. It is the jungle. You have been inside it for some time.',
  obsidian_wretch:      'It was something once. The Maw doesn\'t bother telling you what.',
  glasswrought_husk:    'Its skin cracked into black glass generations ago. It has never once acknowledged the pain.',
  maw_crawler:          'It moves like it knows exactly where the light used to be, and hates that it isn\'t there anymore.',
  starless_stalker:     'You will not see it coming. That is the entire design.',
  obsidian_colossus:    'It has stood so long that the Maw grew around it instead of the other way around.',
  maw_sovereign:        'It ruled something before the dark took the name of what that was.',
  voidglass_wyrm:       'Its scales are black glass, and every one of them is a mirror that shows you nothing.',
  the_last_light:       'It remembers being light. That memory is the only thing about it left to hate.',
  choir_wraith:         'It sings in a register no living throat could reach, and no living ear should hear.',
  hollow_cantor:        'It leads the verse. It has led the same verse for longer than memory holds.',
  dirge_revenant:       'The urn cracked open on its own, generations ago. Whatever was inside got out and kept humming.',
  silent_hymnal:        'The pages turn themselves. The words are in a language that predates speaking.',
  choir_of_bones:       'Every bone in the amphitheater sings its own note. Together, they never quite land on a chord.',
  the_conductor:        'It doesn\'t sing. It doesn\'t need to. Everything else here does the singing for it.',
  requiem_titan:        'It has been the loudest thing in the Choir since before the Choir had a name.',
  the_unsung:           'It never joins the hymn. That silence, somehow, is worse than the song.',
  gearbound_wretch:     'Every joint in its body clicks like a clock that forgot how to stop.',
  ticking_horror:       'It counts down from a number nobody has ever heard it reach.',
  brass_sentinel:       'Wound centuries ago by hands long since dust, and still perfectly on time.',
  chainwrought_stalker: 'The chains don\'t bind it. They\'re just part of the mechanism now.',
  grand_escapement:     'It regulates the passage of time in this place. Time has not thanked it for the effort.',
  clockwork_sovereign:  'It built this gearworks to outlast the world. So far, it has succeeded.',
  entropy_engine:       'It runs on the slow decay of everything nearby. Business is good.',
  the_last_hour:        'Every clock in the Abyss points to it. None of them agree on what it means.',
  husk_peddler:         'It still calls out prices for wares that turned to dust before you were born.',
  phantom_haggler:      'It will haggle with you over nothing, forever, if you let it.',
  coinless_wraith:      'It reaches for coin purses that emptied out centuries ago.',
  tattered_auctioneer:  'The auction never ends. Nobody remembers what\'s being sold.',
  eternal_auctioneer:   'Every bid it calls has already been won and lost a thousand times.',
  market_ghost_sovereign: 'It ruled this bazaar in life. In death, it still won\'t give up the lease.',
  the_last_customer:    'It has been waiting in line since the bazaar closed. It is still waiting.',
  bazaar_devourer:      'It ate the merchants first, then the wares, then the memory of the market itself.',
  ashbound_gladiator:   "It fought here once for the crowd's approval. The crowd left centuries ago. It never got the memo.",
  bonepit_wrestler:     'It grapples with a strength no living body should have, and no dead one should keep.',
  arena_wraith:         'It circles the pit the way it always has — waiting for an opponent who stopped showing up.',
  cindered_champion:    'The laurels on its brow have long since turned to ash, and it still refuses to take them off.',
  the_undefeated:       'It has never lost a bout here. It has also never once been allowed to leave.',
  coliseum_sovereign:   'It presided over ten thousand matches from a throne of bone. It presides over the silence now.',
  the_last_duelist:     "It's still waiting for a challenger. You'll do.",
  ashfall_colossus:     'The coliseum was built to hold it. Whether that was to keep something in, or something else out, is no longer clear.',
  vault_wraith:         'It still guards a fortune that stopped being currency generations ago.',
  greedbound_golem:     "Built to protect gold from thieves. Nobody thought to tell it there's no one left to protect it from.",
  coineyed_ghoul:       'Its eyes were replaced with coins so long ago it has forgotten it once needed to see anything else.',
  hoarder_wretch:       "It has never once spent what it's hoarded. It has never once considered doing so.",
  vault_warden:         'It has held this post since before the vault had a lock worth guarding.',
  gilded_sovereign:     'It ruled by wealth alone. Death did not change its priorities.',
  the_last_heir:        'Everyone else who might have inherited this fortune died trying to claim it first.',
  avarice_incarnate:    "It isn't guarding the gold. At this point, the gold is guarding it.",
  weeping_barkwraith:   'It sheds the same leaves every season, over and over, and has never once let them finish falling.',
  amberwept_husk:       'The sap sealed it in mid-scream centuries ago. It has had a long time to keep screaming.',
  orchard_gravekeeper:  'It tends rows of trees that were never planted for fruit. Nobody left to ask what they were planted for.',
  sapstained_wretch:    'The amber gets into everything eventually. It got into this one a long time ago.',
  withering_matriarch:  'She planted this orchard to outlive her. It did. She is still here to see it.',
  orchard_sovereign:    'It claims every tree here as its own. None of them have fruited in its memory, and it does not seem to notice.',
  the_last_harvest:     'It has been waiting at the gate with a basket for a harvest that was cancelled generations ago.',
  sorrowbound_colossus: 'Grief this old eventually takes on a shape. This is what it chose.',
  windborn_harpy:       "It rides updrafts that don't exist for anything without wings. It doesn't offer to share.",
  cragbound_yeti:       'It has weathered a thousand storms on this ridge. It considers you the thousand-and-first.',
  vertigo_wraith:       "Look at it too long and the ground stops feeling like it's where it should be.",
  summit_stalker:       'It has never once lost its footing. It intends to make sure you do.',
  the_endless_climber:  'It has been climbing this same rock face since before the peak had a name. It has never once looked down.',
  peakbound_sovereign:  'The storms up here obey it, or perhaps it simply never noticed a difference.',
  the_last_ascent:      'Everyone who reached the summit before you left something behind. It has been collecting.',
  skyshattered_titan:   "It didn't climb the mountain. Depending on who you ask, it either built the mountain, or became it.",
  duststalker_jackal:   'It has never once needed to track by scent. It just knows where the water tries to hide.',
  sandbound_revenant:   'It counts grains of sand as they fall, and has lost count more times than it can bear to admit.',
  mirage_wraith:        'By the time you realize it was never really there, it already was.',
  scarab_swarm:         'One scarab is a nuisance. A thousand of them is an appetite.',
  the_devouring_dune:   'The caravans stopped crossing here generations ago. The dune has not noticed the difference.',
  sandstorm_sovereign:  'It does not walk through the storm. The storm walks with it, wherever it goes.',
  the_last_caravan:     'It still carries the packs of merchants who never finished the crossing.',
  duneborn_colossus:    'The desert compacted around it for centuries before it ever chose to move.',
  cagebound_alligator: "It has waited in the same flooded pit for centuries, convinced someone is still coming to feed it.",
  drowned_peacock: "Its feathers still fan out to display for a mate that drowned before it did.",
  flooded_aviary_wraith: "It never learned the water would come. It never stopped trying to fly.",
  waterlogged_mastiff: "It still guards the gate to an enclosure with no door left to guard.",
  the_last_zookeeper: "She kept every ledger of every animal in this place. She has not once put the ledger down.",
  menagerie_sovereign: "It ruled the food chain here even when the food chain was a cage. Nothing has changed except the door.",
  the_weeping_elephant: "It has mourned every other creature in this menagerie, one by one, for longer than any of them lived.",
  abyssal_menagerie_beast: "It was never one of the exhibits. It came in through the flooding, and it liked what it found.",
  static_wretch: "Touch it and your hair stands on end for days. Touching it twice is not recommended.",
  chargeling: "It doesn't attack so much as it simply happens near you.",
  thunderstruck_husk: "It has been struck by the same bolt of lightning, over and over, since before it had a name.",
  voltaic_wisp: "It flickers between here and somewhere else, and neither location is especially safe.",
  the_last_current: "Every circuit in this place eventually leads back to it. None of them ever complete.",
  stormcaller_sovereign: "The storm doesn't answer to it. It just hasn't rained anywhere else in a very long time.",
  the_grounding_titan: "Lightning struck it once, a very long time ago. It never quite let go of the charge.",
  thunderbound_colossus: "It doesn't so much walk as it detonates, one footstep at a time.",
  ascendant_acolyte: "It has climbed twelve thousand steps and stopped counting somewhere around four thousand.",
  marble_sentinel: "It was carved to look vigilant. Whether it actually is remains untested.",
  spirewrought_golem: "Every block of marble in this tower was quarried by something like it. Most of them are still working.",
  whispering_manuscript: "It reads itself aloud to no one, forever, in a language nobody left alive can translate.",
  the_endless_scholar: "He has been one theorem away from a breakthrough for four hundred years.",
  ivory_sovereign: "It presided over the founding of this tower. It has never once conceded the study is finished.",
  the_last_question: "It was asked so long ago that everyone who might answer it has died of old age twice over.",
  spirebound_colossus: "It holds the tower's uppermost floor on its shoulders, and has never once been thanked for it.",
  rustbound_sentry: "Its orders expired before it did. It has not noticed either.",
  scraphide_crawler: "It was built for a war that ended. It never got the memo, and neither did its targeting.",
  oilblood_wretch: "What leaks out of it isn't blood, exactly. It behaves like it, though.",
  cogless_automaton: "Half its gears fell out centuries ago. The half that\u2019s left is still turning.",
  the_last_engine: "It was built to carry an army. The army is gone. It still idles, waiting to be loaded.",
  warmachine_sovereign: "It commanded a war machine army that rusted into the ground around it, one hull at a time.",
  the_rustbound_titan: "It hasn't moved from this spot in an age. It remembers, badly, that it used to.",
  scrapheap_colossus: "It was assembled from the wreckage of a hundred smaller machines, and remembers being all of them, badly.",
  masked_waltzer: "The mask never comes off. Whether that's a rule of the masquerade or something else entirely, nobody still here remembers.",
  velvet_wraith: "It plays the same four bars, over and over, for a dance that finished decades before the players stopped.",
  giltcracked_courtier: "Every mirror in this hall reflects it slightly wrong, and it stopped noticing a long time ago.",
  motheaten_duchess: "Her gown has been rotting for a hundred years. She still curtsies like it's new.",
  the_eternal_host: "It poured the first toast of the evening. It has been the same toast for longer than anyone can measure.",
  court_sovereign: "It still receives guests at the door, gesturing them in toward a ballroom that stopped being a ballroom ages ago.",
  the_last_dance: "It's still waiting for a partner. It has been very patient about it.",
  velvetbound_colossus: "It was the centerpiece of the evening once. Nobody remembers being impressed enough to remove it.",
  chiming_wretch: "It rings faintly with every step. It has long since stopped noticing the sound follows it everywhere.",
  prismwrought_golem: "Light passes through it and comes out wrong on the other side, every single time.",
  singing_shard: "It has held the same note since before this cavern had a name. It has never once needed to breathe.",
  resonant_wisp: "Get close enough and you'll feel the note before you hear it.",
  the_unbroken_chord: "It has never resolved. Some things in this cavern believe it never will.",
  crystal_sovereign: "It doesn't rule through strength. It just refuses, absolutely, to stop ringing.",
  the_last_harmony: "It has been waiting for a second voice to join the chord for longer than the chord has existed.",
  prismbound_colossus: "Every crystal in the expanse grew around it first. The rest just followed its lead.",
  grinning_barker: "It hasn't stopped calling out the show times. Nobody has needed the reminder in a very long time.",
  funhouse_wraith: "Every mirror shows a slightly different version of the thing looking back. None of them are flattering.",
  carousel_horror: "It has gone in the same circle so many times it has worn a groove into the world.",
  balloon_choked_wretch: "It was handed out as a prize once. It never quite deflated, and it never quite let go.",
  the_ringmaster: "It still announces every act by name. There hasn't been an act in longer than anyone can measure.",
  carnival_sovereign: "It built this carnival to never end. As far as anyone can tell, it succeeded.",
  the_last_ticket: "It has been waiting at the booth for someone to redeem it. It will wait as long as it takes.",
  funfair_colossus: "It turns at the same slow, deliberate pace it always has, carrying passengers who boarded and never got off.",
  shackled_wretch: "The chains rusted through decades ago. It has never once tried the door.",
  cellblock_wraith: "It patrols cells with no prisoners left in them, and logs the silence as compliance.",
  rustbound_warden: "It still carries the keys to every cell in the block. It has forgotten which one it was assigned to guard.",
  forgotten_inmate: "Nobody remembers what it did to end up here. It stopped trying to remember first.",
  the_last_warden: "It still enforces a curfew nobody left alive is breaking.",
  oubliette_sovereign: "It sentenced the last prisoner it can recall centuries before its own name slipped away from it.",
  the_forgotten_judge: "It still weighs every case that comes before it. No case has come before it in longer than it can measure.",
  ironbound_colossus: "It was built to keep the worst of the worst inside. Nobody ever specified for how long.",
  reagent_wretch: "Whatever it was dosed with never finished working. It never finished changing, either.",
  twitching_homunculus: "It was grown to be someone\u2019s assistant. It never got far enough to be told what for.",
  failed_transmutation: "It was supposed to become something else entirely. This is as far as the process got, forever.",
  bubbling_ooze: "It has been quietly reacting with itself for centuries, and hasn't run out of reasons to yet.",
  the_last_alchemist: "He was one measurement away from perfecting the formula. He has been one measurement away for four hundred years.",
  chimera_sovereign: "It was stitched from the best parts of a dozen failed experiments. Somehow, none of the parts agree on how to be one creature.",
  the_unfinished_formula: "Every ingredient is accounted for except the last one, which nobody ever wrote down.",
  reagentbound_colossus: "It absorbed every failed experiment in the laboratory rather than let a single one go to waste.",
  wreckbound_sailor: "It went down with a ship that broke apart two hundred years before you were born. It's still waiting for the order to abandon it.",
  sirens_thrall: "It followed the song all the way down. It has never once regretted the trip.",
  tideworn_ghoul: "The tide never goes back out here. Neither does it.",
  barnacle_wretch: "It has been part of the rocks for so long it forgot it was ever anything else.",
  the_last_captain: "He still gives orders to a crew that abandoned ship before the hull finished breaking.",
  siren_sovereign: "The song was hers before it belonged to the sea. She has never once shared the credit.",
  the_drowned_choir: "Every voice down here sings the same note the sea taught it. None of them remember learning it.",
  shipbreaker_colossus: "It doesn't sink ships. By the time anything reaches these rocks, that part is already done.",
  salt_pilgrim: "It still kneels in the direction the water used to be.",
  brine_wraith: "What the salt didn't preserve, it hollowed out instead.",
  crystal_deacon: "It gives the same sermon it always has. Nobody left to disagree with the theology.",
  salt_hound: "It has been mid-howl for longer than the sea has been gone.",
  the_last_congregant: "He waited so long for the tide that he became part of the wall waiting for it.",
  cathedral_sovereign: "It presided over the last mass held here. The mass never technically ended.",
  the_salt_bishop: "His vestments crystallized around him mid-blessing. The blessing never finished either.",
  brine_colossus: "It formed slowly, the way a stalactite does, out of centuries of grief left standing in one place.",
  smoldering_clerk: "It still stamps due dates on books that turned to ash before you were born.",
  ash_scholar: "It reads by the light of its own slow burning. It has never once needed a lamp.",
  cinder_moth: "They were drawn to the fire once. Now they are the fire, and still can't look away.",
  burning_footnote: "A citation that caught alight and never quite finished explaining itself.",
  the_head_archivist: "She has been reshelving the same collapsed stack for three hundred years, one smoking page at a time.",
  the_unread_folio: "Whatever it contains was never meant to be finished. It burns to keep that promise.",
  ember_curator: "It catalogs every fire that has ever happened here. The list is still growing.",
  the_last_index: "Every entry in it points to another entry that burned before anyone could read it.",
  bog_wight: "It sank slowly enough to remember every second of it.",
  silt_leech: "It has been feeding on something that stopped being alive centuries ago, and hasn't noticed the difference.",
  fen_stalker: "The water never quite covers it. That is by design.",
  bone_sedge: "It grew up through a ribcage and never bothered growing anywhere else.",
  the_sunken_legion: "An entire company drowned in formation. It is still, technically, holding the line.",
  marrow_matriarch: "She has outlived every army that ever marched through here, one slow swallow at a time.",
  the_undrowned: "Everything else in the fen sank eventually. It simply declined to.",
  fen_colossus: "It rose out of the silt, built from every soldier the fen never finished taking.",
  hanging_bloomkeeper: "It waters the roots by letting the rain fall the wrong way.",
  upside_thorn: "Every spine points toward a floor that isn't there anymore.",
  falling_petal_wraith: "It has been drifting upward since before it had a name for what that meant.",
  root_hung_husk: "It was planted here. Nobody agreed on which way was down at the time.",
  the_inverted_gardener: "She has tended this impossible plot since before it decided which way to grow.",
  the_falling_bloom: "It has never once landed. It has also never once stopped falling.",
  skybound_root_titan: "Its roots reach for a sky that has no business being underground, and somehow, keep finding it.",
  the_gravity_thorn: "It grew in the one direction nothing here is supposed to grow. It has never regretted the choice.",
  wax_mourner: "It has been grieving the same loss for so long it forgot who it was grieving.",
  tallow_wretch: "The wax holds its shape better than its memory ever did.",
  dripping_effigy: "It was carved to honor someone. The honoring never stopped, even after the wax buried the reason.",
  candlewick_revenant: "Its wick has been burning down for centuries and never once reached the end.",
  the_eternal_mourner: "She sealed herself into the tomb rather than stop grieving. The wax agreed to keep her company.",
  wax_sovereign: "It ruled this necropolis in wax and grief, and has never once melted enough to stop.",
  the_last_candle: "Every flame in the necropolis was lit from it. It has never gone out, and it has never explained why.",
  tallow_colossus: "Built from a thousand melted grave-offerings, fused together by centuries of mourning nobody remembers starting.",
  broken_quartermaster: "It still issues weapons to soldiers who stopped reporting for duty centuries ago.",
  splinter_wretch: "Every shard of every broken blade in this place found its way into something like a body.",
  armory_sentinel: "It guards a stockpile that has nothing left worth stealing. It has not been informed.",
  rack_bound_horror: "It was mounted on the wall as a display piece. It never agreed to just be a display piece.",
  the_armory_master: "He forged every weapon in this place. He is still, technically, testing them.",
  the_unbroken_arsenal: "It is not one weapon. It is every weapon this armory ever held, fused into something that remembers how to swing all of them at once.",
  warforged_sentinel: "It was built to survive the war that broke this armory. As far as it's concerned, that war is still happening.",
  the_last_requisition: "Every order it ever filled was for a war that ended before the paperwork did.",
  foundry_wretch: "It has been pouring the same batch of molten bronze for three hundred years.",
  bellringer_ghoul: "It rings a bell nobody can hear, and has never once missed a beat.",
  molten_apprentice: "He was learning the trade when the fire took him. He never stopped practicing.",
  resonant_wraith: "It doesn't move so much as it vibrates, one slow toll at a time.",
  the_bellfounder: "He cast the great bell with his own hands, and has been listening for it to finally sound right ever since.",
  the_great_toll: "Every echo in this hollow comes from the same single ring, still travelling, after all this time.",
  foundry_sovereign: "It ruled the forges here. The forges are cold now. It hasn't noticed.",
  the_unheard_chime: "It has been ringing since before anything down here had ears built to hear it.",
  paper_clerk: "It stamps every form with the same date. It has stopped noticing the date never changes.",
  drifting_memo: "It has been circulating for approval since before approval meant anything.",
  filing_horror: "Every drawer in it holds a name. None of the names have been read back in a very long time.",
  stamped_wretch: "It was rejected, resubmitted, and rejected again, for so long that rejecting became all it knows how to do.",
  the_census_taker: "It has been counting the same population for centuries. The number keeps changing. Nobody knows why.",
  the_final_form: "Every document in the labyrinth eventually leads back to it. It has never once been signed.",
  archive_sovereign: "It presided over records nobody has requested in longer than the labyrinth has existed.",
  the_unfiled: "It doesn't belong to any category the labyrinth recognizes. That, somehow, is worse.",
  loom_wretch: "It has been feeding the loom the same thread for generations, and the loom has never once had enough.",
  spindle_horror: "It spins without stopping. It has forgotten what it would even mean to stop.",
  threadbare_wraith: "It is worn so thin you can see the loom working through what's left of it.",
  shuttle_ghoul: "Back and forth, back and forth, weaving a pattern it will never live to see completed.",
  the_master_weaver: "She has been at the loom since before the hall had walls to hold it. The pattern still isn't finished.",
  the_unfinished_bolt: "Whatever it is meant to become, the loom has decided it isn't done yet. It may never be.",
  loom_sovereign: "It rules the weaving hall from a throne stitched from every thread the loom ever wasted.",
  the_last_stitch: "Every seam in the hall runs back to it. It has been almost finished for centuries.",
  glass_deacon: "It preaches from a window that shows a different sermon every time you look back at it.",
  shard_penitent: "It kneels in prayer, cut by its own reflection, and has never once bled from it.",
  stained_wraith: "Light passes through it in colors that don't appear anywhere else in this cathedral.",
  window_wretch: "It has been part of the same scene for so long it forgot it was ever meant to be separate from the glass.",
  the_last_witness: "It watched every version of the story the windows have ever told, and still can't say which one happened.",
  sanctum_sovereign: "It rules a congregation of light and colored glass, and answers to a scripture that rewrites itself nightly.",
  the_shifting_saint: "Every window shows it differently. It has stopped correcting them.",
  prism_colossus: "It was assembled from every shard the windows ever shed, and it remembers every scene they ever showed.",
};



const PRESTIGE_TREE = [
  // --- Body Modifications ---
  { id: 'ear',   group: 'body', name: "I've found my ear!",     desc: 'Unlocks a second earring slot.',                cost: 4,  effect: { bodyMod: 'ear' } },
  { id: 'pants', group: 'body', name: 'I can wear pants?',      desc: 'Unlocks the greaves slot and droppable greaves.', cost: 5,  effect: { bodyMod: 'pants' } },
  { id: 'vest',  group: 'body', name: 'See my vest! See my vest!', desc: 'Unlocks the chestpiece slot and droppable chainmail.', cost: 5, effect: { bodyMod: 'vest' } },
  { id: 'feet',  group: 'body', name: 'A thing for feet.',      desc: 'Unlocks the footwear slot and droppable footwear.', cost: 5,  effect: { bodyMod: 'feet' } },
  { id: 'finger',group: 'body', name: 'Finger lickin\' good!',  desc: 'Unlocks a third ring slot.',                     cost: 6,  effect: { bodyMod: 'finger' } },
  { id: 'trinket',group: 'body', name: 'Ooh, shiny!',          desc: 'Unlocks the Trinket slot and droppable trinkets — luck-focused charms.', cost: 6, effect: { bodyMod: 'trinket' } },
  { id: 'necklace',group: 'body', name: 'A proper neck-region accessory.', desc: 'Unlocks the Necklace slot and droppable necklaces.', cost: 6, effect: { bodyMod: 'necklace' } },

  // --- Stat Training ---
  { id: 'luck1',   group: 'stat', name: 'Fortune\'s Favor I',  desc: '+2 permanent Luck', cost: 2, repeatable: true, effect: { luck: 2 } },
  { id: 'atk1',    group: 'stat', name: 'Hardened Strikes I',  desc: '+1 permanent ATK',  cost: 2, repeatable: true, effect: { atk: 1 } },
  { id: 'def1',    group: 'stat', name: 'Thickened Hide I',    desc: '+1 permanent DEF',  cost: 2, repeatable: true, effect: { def: 1 } },
  { id: 'dodge1',  group: 'stat', name: 'Evasive Instinct',    desc: '+2% dodge chance (fully avoid an attack)', cost: 3, repeatable: true, effect: { dodge: 2 }, max: 10 },
];

function prestigeCost(node, timesBought) {
  if (!node.repeatable) return node.cost;
  return node.cost + timesBought * Math.ceil(node.cost * 0.6);
}

/* ---------------------------------------------------------
   THE ATLAS — souls-unlocked prestige feature (100 Souls).
   Gives biome lore and permanently unlocks biome-exclusive
   weapon+armor pairs at 30/60/90 lifetime visits to each biome.
   "Visits" = every time you enter or re-enter that biome,
   across every run, forever (tracked in prestige.biomeVisits).
--------------------------------------------------------- */

const ATLAS_COST = 100;
const TUNNEL_COST = 25; // Souls cost to use a Secret Tunnel once encountered

/* ---------------------------------------------------------
   THE SOULWELL — a gacha-style Souls sink, unlocked once via
   prestige. Each pull spends 1 Soul and grants a small, permanent,
   stacking combat bonus against a single random enemy (or, for
   some bonus types, a whole biome). Common/Uncommon/Rare pulls
   have their own pool of possible bonus shapes and values —
   higher rarities unlock stat types the lower tiers don't roll
   (defense, block chance, knife damage) on top of bigger numbers.
========================================================= */

const SOULWELL_UNLOCK_COST = 80;
const SOULWELL_RARITY_WEIGHTS = { common: 70, uncommon: 24, rare: 6 };

const SOULWELL_LABELS = {
  dmgEnemy:      { label: 'damage vs',        color: '#e8a23d' },
  dmgBiome:      { label: 'damage vs',        color: '#e8a23d' },
  dodgeEnemy:    { label: 'dodge chance vs',  color: '#7ee8d9' },
  defEnemy:      { label: 'defense vs',       color: '#7aa8c9' },
  blockEnemy:    { label: 'block chance vs',  color: '#c9a4f7' },
  knifeDmgEnemy: { label: 'knife damage vs',  color: '#ff9152' },
};

const SOULWELL_POOL = {
  common:   [{ type: 'dmgEnemy', value: 1 }],
  uncommon: [
    { type: 'dmgEnemy', value: 2 },
    { type: 'dmgBiome', value: 1 },
    { type: 'dodgeEnemy', value: 1 },
  ],
  rare: [
    { type: 'dmgEnemy', value: 4 },
    { type: 'dmgBiome', value: 2 },
    { type: 'dodgeEnemy', value: 2 },
    { type: 'defEnemy', value: 2 },
    { type: 'blockEnemy', value: 2 },
    { type: 'knifeDmgEnemy', value: 3 },
  ],
};

function freshSoulwellBonuses() {
  return { dmgEnemy: {}, dmgBiome: {}, dodgeEnemy: {}, defEnemy: {}, blockEnemy: {}, knifeDmgEnemy: {} };
}

function rollSoulwellRarity() {
  const total = SOULWELL_RARITY_WEIGHTS.common + SOULWELL_RARITY_WEIGHTS.uncommon + SOULWELL_RARITY_WEIGHTS.rare;
  let r = Math.random() * total;
  if (r < SOULWELL_RARITY_WEIGHTS.common) return 'common';
  r -= SOULWELL_RARITY_WEIGHTS.common;
  if (r < SOULWELL_RARITY_WEIGHTS.uncommon) return 'uncommon';
  return 'rare';
}

// Returns { rarity, type, target, value, desc }. `target` is an enemy
// baseId for enemy-scoped bonuses, or a biome index for biome-scoped ones.
function rollSoulwellBonus() {
  const rarity = rollSoulwellRarity();
  const shape = pickRandom(SOULWELL_POOL[rarity]);
  const labelInfo = SOULWELL_LABELS[shape.type];
  if (shape.type === 'dmgBiome') {
    const biomeIdx = Math.floor(Math.random() * BIOMES.length);
    return {
      rarity, type: shape.type, target: biomeIdx, value: shape.value,
      desc: `+${shape.value}% ${labelInfo.label} ${BIOMES[biomeIdx].name} enemies`,
    };
  }
  const enemy = pickRandom(ENEMY_TYPES);
  return {
    rarity, type: shape.type, target: enemy.id, value: shape.value,
    desc: `+${shape.value}% ${labelInfo.label} ${enemy.name}`,
  };
}

function soulwellDmgMultFor(player, enemy) {
  const sb = player.soulwellBonuses;
  if (!sb) return 1;
  const eBonus = (sb.dmgEnemy && sb.dmgEnemy[enemy.baseId]) || 0;
  const bBonus = (sb.dmgBiome && sb.dmgBiome[currentBiome(enemy.depth)]) || 0;
  return 1 + (eBonus + bBonus) / 100;
}
function soulwellDodgeFor(player, baseId) {
  const sb = player.soulwellBonuses;
  return sb && sb.dodgeEnemy && sb.dodgeEnemy[baseId] ? sb.dodgeEnemy[baseId] / 100 : 0;
}
function soulwellDefMultFor(player, baseId) {
  const sb = player.soulwellBonuses;
  const bonus = sb && sb.defEnemy && sb.defEnemy[baseId] ? sb.defEnemy[baseId] : 0;
  return 1 + bonus / 100;
}
function soulwellBlockChanceFor(player, baseId) {
  const sb = player.soulwellBonuses;
  return sb && sb.blockEnemy && sb.blockEnemy[baseId] ? sb.blockEnemy[baseId] / 100 : 0;
}
function soulwellKnifeDmgMultFor(player, baseId) {
  const sb = player.soulwellBonuses;
  const bonus = sb && sb.knifeDmgEnemy && sb.knifeDmgEnemy[baseId] ? sb.knifeDmgEnemy[baseId] : 0;
  return 1 + bonus / 100;
}

// Grizzled Veteran's Shortcut Mastery halves this (rounded in the player's favor).
function effectiveTunnelCost(player) {
  return player && player.tunnelDiscount ? Math.max(1, Math.floor(TUNNEL_COST / 2)) : TUNNEL_COST;
}
const ATLAS_TIERS = [30, 60, 90];

/* ---------------------------------------------------------
   ASCENSION — the ultimate capstone. From the Prestige screen,
   once a run reaches deep enough, the player may Ascend: a
   permanent, ever-stacking global power boost (ATK/DEF/max HP,
   Luck, Gold, XP), no strings attached. The natural depth-based
   enemy scaling already keeps the descent challenging on its
   own, so Ascension doesn't add any artificial toughening on
   top of it — it's pure reward. Each Ascension requires reaching
   an even deeper depth than the last to unlock the next level,
   so it stays a genuine milestone rather than a one-time buy.
--------------------------------------------------------- */

function ascensionRequiredDepth(level) {
  return 100 + level * 50;
}

// Applied to the player's core stats (ATK/DEF/max HP) — permanent, stacks with everything else.
function ascensionStatMult(level) {
  return 1 + (level || 0) * 0.15;
}

const BIOME_LORE = [
  "Before the dungeon had a name, it was simply The Caverns — the first wound cut into the earth, and the oldest. Explorers who map its tunnels always find the same thing: more tunnel, and older bones than they expected.",
  "The swamp remembers a war fought here centuries ago, whose losing side never stopped fighting. The rot is not decay — it is a kind of memory that refuses to let go.",
  "Something below still stokes these fires, long after whatever forged here has been forgotten. The obsidian halls were built to make weapons; now they make monsters instead.",
  "No map agrees on how far the Wastes extend, because the cold keeps redrawing the borders. Those who freeze here do not always stay dead.",
  "A city drowned in a single night, for reasons its surviving records refuse to name. The water still remembers the shape of the streets.",
  "This is not a place so much as a tear — a wound in the world where up, down, and forward stop meaning anything in particular. The local wildlife has opinions about that.",
  "Built by a cult that worshipped death as an architect, the Reliquary is a cathedral made from every worshipper who ever finished their devotion. The candles have never gone out, because no one who could blow them out has left alive.",
  "A mirror-world's worth of reflections, fractured into one impossible place. Every angle shows you something true and something that never happened, and the difference is rarely obvious in time.",
  "A burial ground so old the jungle simply grew through it, then through the dead, then never stopped. The roots below remember every name carved above, even the ones long since worn away.",
  "Nothing that enters the Maw is recorded as leaving it, and yet the dungeon insists this is not the bottom. It is only where the light gives up first.",
  "Long before anyone thought to count the floors, a choir has been singing the same unfinished hymn since before anyone thought to write history down. Newcomers hear it as noise. Give it long enough, and it starts to sound like your own name.",
  "The gears here have been turning since before the dungeon had depths to measure. Some say the Abyss doesn't tell time — it consumes it, one turning hour at a time, and asks nothing in return but the silence after.",
  "Once the busiest market in the dungeon's long history, now attended only by vendors who refuse to notice they have no customers left, and customers who refuse to notice they have no coin.",
  "Deep past anywhere the maps agree on, an arena still remembers the roar of a crowd that has been gone for centuries. The champions who fought there have not yet noticed the silence — or have simply refused to stop.",
  "Far past any reasonable depth, a vault built to outlast empires still holds a fortune no living hand will ever spend, watched over by guardians who have long since confused hoarding with purpose.",
  "In a stretch of dark nobody surveyed twice, an orchard grows in perfect, unbroken sorrow — every tree weeping amber tears for a harvest that never comes, tended by gardeners who no longer remember why.",
  "Past every sensible layer of stone, an impossible mountain range rises into a sky that shouldn't exist this deep in the earth, its peaks screaming with the voices of everyone who ever tried to reach the top and didn't come back down.",
  "Beyond where any map still holds true, a black-sand desert stretches beyond any measured horizon, its storms burying and unburying the bones of every crossing ever attempted, none of them completed.",
  "Down where the water never stopped rising, a menagerie built for the amusement of a court that drowned along with it still holds its animals, and the water that filled their cages taught every one of them how to hunt something smarter than themselves.",
  "In a scar cut deep into the dark, a field of scorched earth crackles under a storm that has never once broken, each strike of lightning finding the same ground it struck a thousand years before, and the thousand years before that.",
  "Past the point where ceilings make any sense, an ivory tower rises past any reasonable height, its scholars still climbing toward an answer they stopped remembering the question to generations ago.",
  "Buried past memory, an entire war fought itself to a standstill and then kept fighting anyway, its machines rusting in place but never quite powering down, waiting on orders that stopped coming centuries ago.",
  "Deep in a hall time forgot to close, a ballroom holds a masquerade that never received its final dance, its guests still turning through the same waltz in gowns that rotted around them decades ago.",
  "Past the last honest measurement of depth, crystal formations taller than cathedrals resonate with a single note that has never once wavered, and everything that lingers long enough to hear it clearly eventually starts humming along.",
  "In a stretch of dark that never learned to be quiet, a carnival's lights never went dark and its carousel never stopped turning, playing the same tinny calliope tune to an audience that stopped arriving before anyone still here can remember.",
  "Buried deeper than any sentence should reach, a prison built to make its inmates forgotten did exactly that, and forgot its wardens right along with them, leaving both to patrol and wait in cells that stopped needing guarding centuries ago.",
  "Down in a ruin nobody claimed twice, a laboratory dedicated to perfecting life itself instead perfected only failure, over and over, leaving every shattered jar and twitching half-finished creation as a monument to an answer that was never found.",
  "This deep, an ocean should not exist and does anyway, its coastline littered with the wrecks of ships that were never meant to sail this deep, drawn down by a song that hasn't stopped since the first hull broke apart on the rocks.",
  "Long past where any tide should reach, a sea dried into stone over centuries, leaving cathedral pillars of salt where a congregation once gathered to pray for its return. The tide never came back. Neither did they.",
  "In a wing of the dark nobody thought to check twice, a library caught fire generations ago and simply never finished burning. Its keepers still shelve what's left, filing the ash under headings only they can read.",
  "Deep in ground that never dried out, a battlefield sank into marshland centuries ago, and the marsh has been slowly digesting it ever since. The bones haven't finished settling. Some of them never will.",
  "In a stretch of the dark where the rules stopped applying, gravity forgot which way it was supposed to point, and a garden grew toward the wrong sky. Its gardeners tend it patiently, upside down, and have long since stopped noticing anything strange about that.",
  "Past the last honest grave marker, a necropolis was sealed in wax by mourners who meant it as a temporary tribute. The candles never stopped burning, and the wax never stopped dripping, and eventually the mourners became part of what they were mourning.",
  "Deep in a hall stripped bare by its own war, an armory was broken open by the war it was built to arm, and its contents never quite stood down. Every blade in here still remembers a battle nobody living took part in.",
  "In a cavern built to hold one impossible sound, a bellfounder cast a bell too large to ever be rung by mortal hands, and something down here decided to ring it anyway. It has been tolling ever since, in a register nothing living was built to hear.",
  "Deep in a wing nobody remembers approving, an administrative office metastasized into a labyrinth of paper, its clerks still processing forms for a population that stopped existing generations ago. The paperwork, somehow, never stopped arriving.",
  "In a hall built around a single, endless machine, a loom the size of a cathedral has been weaving without pause for longer than anyone can measure, threading its cloth from whatever the dungeon has left to spare. Nobody has ever seen the finished bolt.",
  "Past every window that should have shattered by now, a sanctum of colored glass tells a story that keeps changing its ending. The windows remember every version. The congregation, whatever's left of it, argues about which one is true.",
];

const BIOME_GEAR_THEMES = [
  { weapon: 'Cavebound Pick',        armor: 'Deepstone Plate' },
  { weapon: 'Blightfang Scythe',     armor: 'Mirehide Cloak' },
  { weapon: 'Forgeheart Maul',       armor: 'Cinderplate Harness' },
  { weapon: 'Rimefrost Glaive',      armor: 'Wintermantle Plate' },
  { weapon: 'Tideborn Trident',      armor: 'Sunken Regalia' },
  { weapon: 'Starfallen Blade',      armor: 'Riftwoven Armor' },
  { weapon: 'Ossuary Greatsword',    armor: 'Reliquary Plate' },
  { weapon: 'Meridian Shard-Blade',  armor: 'Prismatic Aegis' },
  { weapon: 'Rootbound Warscythe',   armor: 'Verdant Carapace' },
  { weapon: 'Maw-Forged Ripper',     armor: 'Obsidian Sovereign Plate' },
  { weapon: 'Hymnal Edge',           armor: 'Choirbound Vestments' },
  { weapon: 'Escapement Greatblade', armor: 'Brasswrought Plate' },
  { weapon: "Auctioneer's Reckoning", armor: 'Bazaar-Worn Vestments' },
  { weapon: "Champion's Last Blade",  armor: 'Coliseum-Forged Plate' },
  { weapon: "Vault-Breaker's Cleaver", armor: 'Gilded Sovereign Plate' },
  { weapon: 'Amberfall Scythe',        armor: 'Sapbound Vestments' },
  { weapon: 'Skyrending Halberd',      armor: 'Stormwrought Plate' },
  { weapon: 'Duneglass Scimitar',      armor: 'Sandwrought Cuirass' },
  { weapon: 'Leviathan\'s Tusk', armor: 'Menagerie-Keeper\'s Hide' },
  { weapon: 'Stormbound Cleaver', armor: 'Voltaic Plate' },
  { weapon: 'Spire-Scholar\'s Rapier', armor: 'Ivory Vestments' },
  { weapon: 'Scrapforged Greataxe', armor: 'Rustplate Bulwark' },
  { weapon: 'Courtier\'s Rapier', armor: 'Moth-Eaten Finery' },
  { weapon: 'Resonant Greatsword', armor: 'Crystalline Aegis' },
  { weapon: 'Carnival Cleaver', armor: 'Harlequin\'s Motley' },
  { weapon: 'Oubliette Shackle-Blade', armor: 'Warden\'s Ironplate' },
  { weapon: 'Alembic Rapier', armor: 'Reagent-Stained Robes' },
  { weapon: 'Sirensong Cutlass', armor: 'Wreckwood Plate' },
  { weapon: 'Saltglass Halberd', armor: 'Pilgrim\'s Salt-Plate' },
  { weapon: 'Emberbound Quill-Blade', armor: 'Archivist\'s Cinderweave' },
  { weapon: 'Fenbone Poleaxe', armor: 'Marrow-Soaked Hide' },
  { weapon: 'Gravity-Twisted Shears', armor: 'Root-Hung Vestments' },
  { weapon: 'Waxbound Reaper', armor: 'Tallow-Sealed Plate' },
  { weapon: 'Armory-Forged Cleaver', armor: 'Splintered War-Plate' },
  { weapon: 'Tollbound Warhammer', armor: 'Resonant Foundry-Plate' },
  { weapon: 'Filed Requisition Blade', armor: 'Bureaucrat\'s Ream-Plate' },
  { weapon: 'Shuttle-Forged Rapier', armor: 'Threadbare Vestments' },
  { weapon: 'Prism-Forged Cutlass', armor: 'Stained-Glass Vestments' },
];

/* ---------------------------------------------------------
   REGIONAL MASTERY — a direct-Souls prestige tree (like the
   Atlas) giving each biome its own 3-step mastery track:
   +10% damage against that biome's enemies, then +5% gold from
   them, then +5% luck from their loot. Strictly sequential per
   biome (damage -> gold -> luck) — only the next step in a
   biome's track is ever purchasable, so the UI only ever shows
   one upcoming node per biome rather than the full 45 at once.
--------------------------------------------------------- */

const REGIONAL_MASTERY_UNLOCK_COST = 60;

const REGIONAL_MASTERY_TREE = BIOMES.flatMap((biome, i) => [
  { id: `regional_dmg_${i}`, biomeIndex: i, kind: 'dmg', order: 0,
    name: `${biome.name}: Predator's Edge`, desc: `+10% damage against ${biome.name} enemies.`, cost: 10 + i * 2 },
  { id: `regional_gold_${i}`, biomeIndex: i, kind: 'gold', order: 1,
    name: `${biome.name}: Plunderer's Eye`, desc: `+5% gold from ${biome.name} enemies.`, cost: 10 + i * 2 },
  { id: `regional_luck_${i}`, biomeIndex: i, kind: 'luck', order: 2,
    name: `${biome.name}: Fortune's Favor`, desc: `+5% luck from ${biome.name} enemy loot.`, cost: 10 + i * 2 },
]);

// tier: 1, 2, or 3 (corresponding to the 30/60/90-visit thresholds)
function buildBiomeGear(biomeIndex, tier) {
  const theme = BIOME_GEAR_THEMES[biomeIndex] || BIOME_GEAR_THEMES[0];
  const roman = ['I', 'II', 'III'][tier - 1] || 'I';
  const biomeMult = 1 + biomeIndex * 0.15;
  const tierMult = 1 + (tier - 1) * 0.35;
  const atk = Math.round(18 * biomeMult * tierMult);
  const def = Math.round(12 * biomeMult * tierMult);
  return {
    weapon: { id: `atlas_${biomeIndex}_${tier}_wpn`, name: `${theme.weapon} ${roman}`, type: 'weapon', rarity: 'mythic', atk },
    armor:  { id: `atlas_${biomeIndex}_${tier}_arm`, name: `${theme.armor} ${roman}`,  type: 'armor',  rarity: 'mythic', def },
  };
}

function recordBiomeVisit(prestige, biomeIndex) {
  const biomeVisits = { ...(prestige.biomeVisits || {}) };
  biomeVisits[biomeIndex] = (biomeVisits[biomeIndex] || 0) + 1;
  return { ...prestige, biomeVisits };
}

// Returns log lines for any 30/60/90 thresholds newly crossed by this visit.
function atlasMilestoneLog(prevCount, newCount, biomeIndex) {
  const msgs = [];
  ATLAS_TIERS.forEach((t, i) => {
    if (prevCount < t && newCount >= t) {
      const gear = buildBiomeGear(biomeIndex, i + 1);
      msgs.push(`🗺️ Atlas Milestone: ${t}th visit to ${BIOMES[biomeIndex].name}! ${gear.weapon.name} and ${gear.armor.name} will await you at the start of your next descent.`);
    }
  });
  return msgs;
}

/* ---------------------------------------------------------
   READY OR NOT — unlocked by trading in a full stamp collection.
   Each tier replaces your starting weapon/ring with something weaker,
   for players who want a harder, more "vanilla" start.
--------------------------------------------------------- */

const READY_OR_NOT_TREE = [
  { id: 'ron1', tier: 1, name: 'Copper Ring Start',  desc: 'Begin every run with a Copper Band instead of an empty ring slot.', cost: 3,
    startingGear: { ring1: { id: 'copper_band', name: 'Copper Band', type: 'ring', rarity: 'common', atk: 1 } } },
  { id: 'ron2', tier: 2, name: 'Simple Dagger Start', desc: 'Begin every run with a Simple Dagger instead of bare fists.', cost: 4,
    startingGear: { weapon: { id: 'simple_dagger', name: 'Simple Dagger', type: 'weapon', rarity: 'common', atk: 1 } } },
  { id: 'ron3', tier: 3, name: "Beggar's Cloak Start",desc: 'Begin every run with a tattered cloak instead of rags.', cost: 4,
    startingGear: { armor: { id: 'beggars_cloak', name: "Beggar's Cloak", type: 'armor', rarity: 'common', def: 1 } } },
  { id: 'ron4', tier: 4, name: 'Plain Stud Start',    desc: 'Begin every run with a Plain Stud earring.', cost: 4,
    startingGear: { earring: { id: 'plain_stud', name: 'Plain Stud', type: 'earring', rarity: 'common', atk: 1 } } },
  { id: 'ron5', tier: 5, name: 'Worn Boots Start',    desc: 'Begin every run with Worn Boots (requires the footwear slot unlocked).', cost: 5,
    startingGear: { footwear: { id: 'worn_boots', name: 'Worn Boots', type: 'footwear', rarity: 'common', atk: 1, def: 1 } } },
];

/* ---------------------------------------------------------
   COMBAT TRICKS — new low-percentage proc abilities, separate
   from the rare-skillbook abilities. Bought with Souls.
--------------------------------------------------------- */

const COMBAT_TRICKS = [
  { id: 'cleave',        name: 'Cleaving Strike',    desc: '3% chance your attack also hits a second enemy.',        cost: 5 },
  { id: 'potion_refund', name: 'Frugal Hands',       desc: "3% chance a Health Potion isn't consumed when used.",    cost: 5 },
  { id: 'elixir_refund', name: 'Waste Not',          desc: "3% chance a Greater Elixir isn't consumed when used.",   cost: 5 },
];

/* ---------------------------------------------------------
   BETTER MERCHANT — unlocked by trading in a full figure collection.
   Each tier improves every wandering Merchant room: more stock,
   cheaper prices, and a higher floor on what rarities can appear.
--------------------------------------------------------- */

/* ---------------------------------------------------------
   LUCK OF THE MADGOD — Figures 2 prestige tree.
   5 tiers, each adding 1% to three chaos effects.
--------------------------------------------------------- */

const MADGOD_TREE = [
  { id: 'madgod1', tier: 1, name: 'Madgod\'s Favour I',   desc: '+1% chance to duplicate loot, find Throatslayer in chests, or receive an Elixir of Life from kills.', cost: 4 },
  { id: 'madgod2', tier: 2, name: 'Madgod\'s Favour II',  desc: '+1% to all Madgod procs (2% total).', cost: 5 },
  { id: 'madgod3', tier: 3, name: 'Madgod\'s Favour III', desc: '+1% to all Madgod procs (3% total).', cost: 6 },
  { id: 'madgod4', tier: 4, name: 'Madgod\'s Favour IV',  desc: '+1% to all Madgod procs (4% total).', cost: 7 },
  { id: 'madgod5', tier: 5, name: 'Madgod\'s Favour V',   desc: '+1% to all Madgod procs (5% total). The Madgod smiles.', cost: 8 },
];

/* ---------------------------------------------------------
   PHYSICIAN HEAL THYSELF — Stamps 2 prestige tree.
   5 tiers, each adding 1% to three healing procs.
--------------------------------------------------------- */

const PHYSICIAN_TREE = [
  { id: 'physician1', tier: 1, name: 'Physician I',   desc: '+1% chance potions crit, elixirs crit, or enemy hits heal you instead.', cost: 4 },
  { id: 'physician2', tier: 2, name: 'Physician II',  desc: '+1% to all Physician procs (2% total).', cost: 5 },
  { id: 'physician3', tier: 3, name: 'Physician III', desc: '+1% to all Physician procs (3% total).', cost: 6 },
  { id: 'physician4', tier: 4, name: 'Physician IV',  desc: '+1% to all Physician procs (4% total).', cost: 7 },
  { id: 'physician5', tier: 5, name: 'Physician V',   desc: '+1% to all Physician procs (5% total). Heal thyself.', cost: 8 },
];

const BETTER_MERCHANT_TREE = [
  { id: 'bm1', tier: 1, name: 'Wider Cart',     desc: '+1 extra item in merchant stock.',                cost: 4, effect: { extraSlots: 1 } },
  { id: 'bm2', tier: 2, name: 'Haggling I',     desc: 'Merchant prices reduced by 10%.',                 cost: 4, effect: { discount: 0.10 } },
  { id: 'bm3', tier: 3, name: 'Discerning Eye', desc: 'Merchant stock is heavily weighted toward skill books and magical runes.', cost: 5, effect: { moreSkillbooks: true } },
  { id: 'bm4', tier: 4, name: 'Wider Cart II',  desc: '+1 more extra item in merchant stock.',            cost: 5, effect: { extraSlots: 1 } },
  { id: 'bm5', tier: 5, name: 'Haggling II',    desc: 'Merchant prices reduced by another 10%.',          cost: 6, effect: { discount: 0.10 } },
  { id: 'bm6', tier: 6, name: 'Sharpened Trade',desc: 'Unlocks Throwing Knives in merchant stock.',       cost: 4, effect: { sellsThrowables: true } },
  { id: 'bm7', tier: 7, name: 'Powder Trade',   desc: 'Unlocks Bullets in merchant stock (requires a Handcannon).', cost: 4, effect: { sellsBullets: true } },
  { id: 'bm8', tier: 8, name: 'Fletcher\u2019s Trade',desc: 'Unlocks Arrows in merchant stock (requires a Bow).', cost: 4, effect: { sellsArrows: true } },
];

/* ---------------------------------------------------------
   WEALTH — Coins 5 prestige tree. 5 tiers, 10 Souls flat each.
   +2%/tier to gold from selling AND gold from loot sources
   (mob kills, Wheel of Fortune), reaching +10%/+10% at tier 5.
--------------------------------------------------------- */

const WEALTH_TREE = [
  { id: 'wealth1', tier: 1, name: "Merchant's Eye I",   desc: '+2% gold from selling items, +2% gold from loot sources (kills, Wheel of Fortune).', cost: 10 },
  { id: 'wealth2', tier: 2, name: "Merchant's Eye II",  desc: '+2% more to both (4% total).', cost: 10 },
  { id: 'wealth3', tier: 3, name: "Merchant's Eye III", desc: '+2% more to both (6% total).', cost: 10 },
  { id: 'wealth4', tier: 4, name: "Merchant's Eye IV",  desc: '+2% more to both (8% total).', cost: 10 },
  { id: 'wealth5', tier: 5, name: "Merchant's Eye V",   desc: '+2% more to both (10% total). Fortune favours you.', cost: 10 },
];

/* ---------------------------------------------------------
   ANCESTRAL MEMORY — Coins 7 prestige tree. 5 tiers, 15 Souls
   flat each. +0.1%/tier chance that reading ANY skill book also
   grants a small permanent bonus to ATK, DEF, or max HP, on top
   of whatever the book itself does — reaching 0.5% at tier 5.
--------------------------------------------------------- */

const ANCESTRAL_MEMORY_TREE = [
  { id: 'ancestral1', tier: 1, name: 'Ancestral Memory I',   desc: '0.1% chance any skill book you read also grants a small permanent ATK, DEF, or max HP bonus.', cost: 15 },
  { id: 'ancestral2', tier: 2, name: 'Ancestral Memory II',  desc: '+0.1% more (0.2% total).', cost: 15 },
  { id: 'ancestral3', tier: 3, name: 'Ancestral Memory III', desc: '+0.1% more (0.3% total).', cost: 15 },
  { id: 'ancestral4', tier: 4, name: 'Ancestral Memory IV',  desc: '+0.1% more (0.4% total).', cost: 15 },
  { id: 'ancestral5', tier: 5, name: 'Ancestral Memory V',   desc: '+0.1% more (0.5% total). The old coins remember everything.', cost: 15 },
];

/* ---------------------------------------------------------
   HEALTH — Stamps 4 prestige tree. 10 tiers, 10 Souls flat each.
   +5%/tier to starting max HP, reaching +50% at tier 10.
--------------------------------------------------------- */

const HEALTH_TREE = Array.from({ length: 10 }, (_, i) => {
  const tier = i + 1;
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X'][i];
  return {
    id: `health${tier}`, tier, name: `Hardy Constitution ${roman}`,
    desc: `+5% starting max HP (${tier * 5}% total).`, cost: 10,
  };
});

/* ---------------------------------------------------------
   GRIZZLED VETERAN — Stamps 6 prestige tree. Four one-time
   unlocks, bought directly with Souls, gathering a handful of
   veteran conveniences and one very rare devastating strike.
--------------------------------------------------------- */

const STAMPS6_TREE = [
  { id: 'tunnel_discount', name: 'Shortcut Mastery', desc: 'Secret Tunnels cost half as many Souls to use.', cost: 60 },
  { id: 'megacrit',        name: 'Megacrit',          desc: '1% chance to land a devastating megacrit — 8× normal damage.', cost: 150 },
  { id: 'efficient_rest',  name: 'Efficient Rest',    desc: "The Healer's rest costs 30% less gold.", cost: 50 },
  { id: 'soul_windfall',   name: 'Soul Windfall',     desc: '+10% Souls earned at the end of every run.', cost: 90 },
];

/* ---------------------------------------------------------
   BACK WITH A VENGEANCE — Stamps 7 prestige tree. 5 tiers,
   1% each (5% at max). Each new run, a chance to start already
   holding the Vorpal Sword — a weapon exactly as strong as
   whatever was in your hand the moment your last run ended.
--------------------------------------------------------- */

const STAMPS7_TREE = [
  { id: 'vengeance1', tier: 1, name: 'Back with a Vengeance I',   desc: '1% chance to start a new run already holding the Vorpal Sword.', cost: 40 },
  { id: 'vengeance2', tier: 2, name: 'Back with a Vengeance II',  desc: '+1% more (2% total).', cost: 40 },
  { id: 'vengeance3', tier: 3, name: 'Back with a Vengeance III', desc: '+1% more (3% total).', cost: 40 },
  { id: 'vengeance4', tier: 4, name: 'Back with a Vengeance IV',  desc: '+1% more (4% total).', cost: 40 },
  { id: 'vengeance5', tier: 5, name: 'Back with a Vengeance V',   desc: '+1% more (5% total). Death is not the end.', cost: 40 },
];

/* ---------------------------------------------------------
   HEAVILY ARMED — Figures 5 prestige tree. Two one-time
   unlocks, bought directly with Souls (not tiered/repeatable).
--------------------------------------------------------- */

const HEAVILY_ARMED_TREE = [
  { id: 'headgear', name: 'Headgear', desc: 'Unlocks a Headgear slot and droppable helms/hoods/circlets.', cost: 150 },
  { id: 'dualwield', name: 'Dual Wield', desc: 'Unlocks a second weapon slot — carry and benefit from two weapons at once.', cost: 200 },
];

/* ---------------------------------------------------------
   WELL-READ — Figures 6 prestige tree. 5 tiers, 30 Souls flat
   each. +2%/tier chance a skillbook's effect triggers twice
   when read, reaching 10% at tier 5.
--------------------------------------------------------- */

const WELL_READ_TREE = [
  { id: 'wellread1', tier: 1, name: 'Well-Read I',   desc: '2% chance reading a skill book triggers its effect twice.', cost: 30 },
  { id: 'wellread2', tier: 2, name: 'Well-Read II',  desc: '+2% more (4% total).', cost: 30 },
  { id: 'wellread3', tier: 3, name: 'Well-Read III', desc: '+2% more (6% total).', cost: 30 },
  { id: 'wellread4', tier: 4, name: 'Well-Read IV',  desc: '+2% more (8% total).', cost: 30 },
  { id: 'wellread5', tier: 5, name: 'Well-Read V',   desc: '+2% more (10% total). Every page teaches twice.', cost: 30 },
];

/* ---------------------------------------------------------
   BOOK SMARTS — Figures 7 prestige tree. Three one-time unlocks,
   bought directly with Souls (not tiered/repeatable), pushing the
   skillbook system further than Well-Read alone.
--------------------------------------------------------- */

const BOOK_SMARTS_TREE = [
  { id: 'booksmarts', name: 'Book Smarts', desc: 'Skill books grant double their effect when read.', cost: 100 },
  { id: 'double_pagination', name: 'Double Pagination', desc: '20% chance a found skill book duplicates itself in your pack. (Similar to the Madgod.)', cost: 90 },
  { id: 'banned_books', name: 'Banned Books', desc: "Unlocks three forbidden tomes — Soul Rend, Withering Curse, and Grave Pact — into the Grand Library's stock.", cost: 150 },
];

/* ---------------------------------------------------------
   FACTORY SEALED — Figures 8 prestige tree. 5 tiers, 1% each
   (5% at max). Any gear that drops from combat kills or treasure
   chests has a chance to arrive "Perfected" — double stats, a
   "Perfected" name prefix, and a rainbow-gloss emoji.
--------------------------------------------------------- */

const FIGURES8_TREE = [
  { id: 'factorysealed1', tier: 1, name: 'Factory Sealed I',   desc: '1% chance any dropped gear arrives Perfected — double stats.', cost: 50 },
  { id: 'factorysealed2', tier: 2, name: 'Factory Sealed II',  desc: '+1% more (2% total).', cost: 50 },
  { id: 'factorysealed3', tier: 3, name: 'Factory Sealed III', desc: '+1% more (3% total).', cost: 50 },
  { id: 'factorysealed4', tier: 4, name: 'Factory Sealed IV',  desc: '+1% more (4% total).', cost: 50 },
  { id: 'factorysealed5', tier: 5, name: 'Factory Sealed V',   desc: '+1% more (5% total). Nothing leaves the factory broken.', cost: 50 },
];


const FALLBACK_NARRATIONS = {
  combat: [
    'The chamber reeks of damp stone and old blood, and something in the dark is watching you.',
    'Shadows shift along the walls as unseen things stir in the gloom ahead.',
    'A low growl echoes through the passage before you even see what made it.',
    'The air turns cold and heavy — you are not alone in this chamber.',
  ],
  merchant: [
    'A hooded figure beckons from behind a cluttered stall, candlelight glinting off strange wares.',
    "Bundles of odd trinkets sway from a merchant's pack as they wave you over.",
    'A weathered trader counts coins by lanternlight, eyeing you with practiced interest.',
  ],
  healer: [
    'A faint warmth pulses through the chamber — a rare moment of peace in the dark.',
    'Soft light spills from a small shrine, and the air smells faintly of herbs.',
    'A robed figure hums quietly, tending a fire that never seems to dim.',
  ],
  collector: [
    'A cloaked figure rattles a sack of curios, eyes gleaming at the sight of your collection.',
    'An odd little merchant sorts trinkets by candlelight, glancing up with sudden interest.',
  ],
  treasure: [
    'A glint of gold catches your eye from beneath a pile of rubble.',
    'An old chest sits undisturbed, its lock long since rusted away.',
    'Something valuable waits here, half-buried and forgotten.',
  ],
  legendary: [
    'The air splits open — something ancient and terrible has noticed you.',
    'Reality bends around a tear in the world, and a colossal shape steps through.',
  ],
};

function generateNames(prefixes, suffixes) {
  const names = [];
  for (const p of prefixes) for (const s of suffixes) names.push(`${p} ${s}`);
  return names;
}

const COLLECTIBLE_NAMES = {
  coins: generateNames(
    ['Ancient', 'Forgotten', 'Sunken', 'Royal', 'Cursed', 'Iron-Age', 'Golden', 'Lost', 'Tribal', 'Celestial'],
    ['Penny', 'Shilling', 'Crown', 'Sovereign', 'Talent']
  ),
  cards: generateNames(
    ['Dragonflame', 'Shadowmark', 'Stormcaller', 'Bonewright', 'Voidwalker', 'Emberkin', 'Frosthold', 'Wyrmscale', 'Duskbringer', 'Starforged'],
    ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']
  ),
  stamps: generateNames(
    ['Northcross', 'Vale', 'Highmoor', 'Saltmere', 'Drakeshire', 'Frostfen', 'Greywatch', 'Embertown', 'Mistral', 'Goldspire'],
    ['Postal', 'Commemorative', 'Airmail', 'Definitive', 'Jubilee']
  ),
  figures: generateNames(
    ['Knight', 'Sorcerer', 'Ranger', 'Berserker', 'Necromancer', 'Paladin', 'Rogue', 'Druid', 'Warlock', 'Monk'],
    ['Classic', 'Battle-Worn', 'Golden', 'Shadow', 'Mythic']
  ),
};

const COLLECTIBLE_META = {
  coins:   { label: 'Coins',   icon: '🪙' },
  cards:   { label: 'Cards',   icon: '🃏' },
  stamps:  { label: 'Stamps',  icon: '📮' },
  figures: { label: 'Figures', icon: '🤖' },
};

// Short flavour lines shown when a person taps a collected item. Cycled by
// index rather than random, so the same item always shows the same line.
const COLLECTIBLE_FLAVOUR_TEMPLATES = {
  coins: [
    'Its edges are worn smooth by hands that turned to dust long ago.',
    'Minted somewhere that may not exist on any map still being drawn.',
    'It holds a faint warmth, though nothing nearby explains why.',
    'The face stamped into it has been rubbed away by centuries of pockets.',
    'It clinks differently than it should — heavier, somehow, than its size allows.',
  ],
  cards: [
    'The ink shifts slightly if you look at it too long.',
    "Whoever illustrated this knew something they probably shouldn't have.",
    'The corners are soft with handling from a game no one alive remembers the rules to.',
    "It's warm to the touch, like it's still being held by someone.",
    "The suit doesn't match any deck you've ever played with.",
  ],
  stamps: [
    "The postmark is smudged into a place name that doesn't appear on any atlas.",
    'It was never licked, never used, never sent — and yet it found its way here.',
    'The perforations are just slightly too small for any envelope you own.',
    'Someone saved this for decades before it ended up in the dark with you.',
    'It smells, faintly, of a country that no longer exists.',
  ],
  figures: [
    'Its expression changes slightly depending on the angle you hold it.',
    'The paint job is too fine for something meant to be a toy.',
    "It's been posed exactly the same way by every hand that's ever held it.",
    'A hairline crack never seems to get any worse, or any better.',
    "It watches you set it down. You're fairly sure of that.",
  ],
};

function getCollectibleFlavour(category, index) {
  const pool = COLLECTIBLE_FLAVOUR_TEMPLATES[category];
  return pool[index % pool.length];
}

/* =========================================================
   HELPERS
========================================================= */

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(base) {
  return `${base}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeItemInstance(base) {
  return { ...base, uid: uid(base.id) };
}

// Used specifically for combat loot drops: the same named item found deeper
// in the dungeon hits/defends harder, mirroring enemy scaling (scaleEnemy).
function makeScaledItemInstance(base, depth) {
  const mult = 1 + Math.max(0, (depth - 1)) * 0.045;
  const scaled = { ...base, uid: uid(base.id) };
  if (scaled.atk) scaled.atk = Math.max(1, Math.round(scaled.atk * mult));
  if (scaled.def) scaled.def = Math.max(1, Math.round(scaled.def * mult));
  return scaled;
}

// Factory Sealed (Figures 8) — types eligible for the "Perfected" double-
// stats treatment. Deliberately excludes skillbooks and consumables; this
// is a gear-only prestige perk.
const FACTORY_SEALED_TYPES = new Set(['weapon', 'armor', 'ring', 'earring', 'chestpiece', 'greaves', 'footwear', 'headgear', 'trinket', 'necklace']);

function applyFactorySealed(item, chance) {
  if (!item || !chance || !FACTORY_SEALED_TYPES.has(item.type)) return item;
  if (Math.random() * 100 >= chance) return item;
  const perfected = { ...item, name: `Perfected ${item.name}`, factorySealed: true };
  if (perfected.atk) perfected.atk = perfected.atk * 2;
  if (perfected.def) perfected.def = perfected.def * 2;
  if (perfected.luck) perfected.luck = perfected.luck * 2;
  return perfected;
}

// Runs every generated loot item through the Factory Sealed roll in one
// pass, regardless of which tier/branch of loot generation produced it.
function applyFactorySealedToItems(items, chance) {
  if (!chance) return items;
  return items.map(it => applyFactorySealed(it, chance));
}

function isCombatRoom(type) {
  return type === 'combat' || type === 'legendary';
}

function pickEnemyTemplate(depth) {
  const biome = currentBiome(depth);
  const pool = ENEMY_TYPES.filter(e => e.biome === biome);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) {
    if (r < e.weight) return e;
    r -= e.weight;
  }
  return pool[0];
}

function scaleEnemy(t, depth) {
  const mult = 1 + (depth - 1) * 0.12;
  const goldBase = t.goldMin + Math.random() * (t.goldMax - t.goldMin);
  return {
    id: uid(t.id),
    baseId: t.id,
    name: t.name,
    emoji: t.emoji,
    rarity: t.rarity,
    hp: Math.round(t.hp * mult),
    maxHp: Math.round(t.hp * mult),
    atk: Math.round(t.atk * mult),
    def: Math.round(t.def * mult),
    xp: Math.round(t.xpBase * mult),
    gold: Math.round(goldBase * mult),
    lootGranted: false,
    depth,
  };
}

function scaleLegendary(t, depth) {
  const mult = 1 + (depth - 1) * 0.05;
  const goldBase = t.goldMin + Math.random() * (t.goldMax - t.goldMin);
  return {
    id: uid(t.id),
    baseId: t.id,
    name: t.name,
    emoji: t.emoji,
    rarity: 'legendary',
    hp: Math.round(t.hp * mult),
    maxHp: Math.round(t.hp * mult),
    atk: Math.round(t.atk * mult),
    def: Math.round(t.def * mult),
    xp: Math.round(t.xpBase * mult),
    gold: Math.round(goldBase * mult),
    lootGranted: false,
    depth,
  };
}

function damageRoll(atk, def) {
  const base = Math.max(1, atk - def);
  const variance = base * (0.8 + Math.random() * 0.5);
  return Math.max(1, Math.round(variance));
}

function getCollectibleCount(player) {
  return Object.values(player.collectibles).reduce((s, a) => s + a.length, 0);
}

function getLuck(player) {
  return getCollectibleCount(player) + (player.bonusLuck || 0) + (player.trinket ? (player.trinket.luck || 0) : 0);
}

// 0 - 0.25, scales with luck (caps around 167 effective luck)
function luckBonus(player) {
  return Math.min(0.25, getLuck(player) * 0.0015);
}

const BESTIARY_THRESHOLDS_BASE = [20, 40, 60];
const BESTIARY_THRESHOLDS_EXTENDED = [20, 40, 60, 100, 150, 200];
const BESTIARY_THRESHOLDS_EXTENDED2 = [20, 40, 60, 100, 150, 200, 300, 400, 500];
const BESTIARY_THRESHOLDS_EXTENDED3 = [20, 40, 60, 100, 150, 200, 300, 400, 500, 700, 900, 1200];

function bestiaryTierFor(player, baseId) {
  if (!player.bestiaryUnlocked) return 0;
  const thresholds = player.cards5Unlocked ? BESTIARY_THRESHOLDS_EXTENDED3
    : player.cards3Unlocked ? BESTIARY_THRESHOLDS_EXTENDED2
    : player.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE;
  const kills = (player.kills && player.kills[baseId]) || 0;
  let tier = 0;
  thresholds.forEach(t => { if (kills >= t) tier += 1; });
  return tier; // 0-3 normally, 0-6 with Cards 2, 0-9 with Cards 3
}

// Returns { atkMult, defMult, dodgeBonus } for fighting a specific enemy baseId.
function bestiaryBonusVs(player, baseId) {
  const tier = bestiaryTierFor(player, baseId);
  return {
    atkMult: 1 + tier * 0.02,
    defMult: 1 + tier * 0.02,
    dodgeBonus: tier * 2,
  };
}

function getCollectibleName(player, category, index) {
  return (player.collectibleNames && player.collectibleNames[category] && player.collectibleNames[category][index])
    || COLLECTIBLE_NAMES[category][index];
}

function rollCollectible(player) {
  const categories = Object.keys(COLLECTIBLE_META);
  const cat = pickRandom(categories);
  const owned = player.collectibles[cat] || [];
  const missing = [];
  for (let i = 0; i < 50; i++) if (!owned.includes(i)) missing.push(i);
  if (missing.length === 0) return null;
  return { category: cat, index: pickRandom(missing) };
}

function rollLoot(enemy, player) {
  const enemyBiome = currentBiome(enemy.depth);
  const regionalLuckPct = ((player.regionalLuckBonus && player.regionalLuckBonus[enemyBiome]) || 0) / 100;
  const lb = luckBonus(player) + regionalLuckPct;
  let gold = enemy.gold, potions = 0, greaterPotions = 0, items = [], map = false, keyItem = null, throwables = 0, bullets = 0, arrows = 0;
  const mods = player.bodyMods || [];
  const hasChest = mods.includes('vest');
  const hasGreaves = mods.includes('pants');
  const hasFootwear = mods.includes('feet');
  const hasHeadgear = (player.heavilyArmedUnlocked || []).includes('headgear');
  const hasTrinket = mods.includes('trinket');
  const hasNecklace = mods.includes('necklace');
  const hasHandcannon = player.keyItems.includes('handcannon');
  const hasBow = player.keyItems.includes('bow');

  const rareGearPool = [...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS, ...(hasTrinket ? RARE_TRINKETS : []), ...(hasNecklace ? RARE_NECKLACES : [])];
  const epicGearPool = [...EPIC_WEAPONS, ...EPIC_ARMORS];
  const commonGearExtras = [];
  const rareGearExtras = [];
  const epicGearExtras = [];
  if (hasChest) { commonGearExtras.push(...COMMON_CHESTPIECES); rareGearExtras.push(...RARE_CHESTPIECES); epicGearExtras.push(...EPIC_CHESTPIECES); }
  if (hasGreaves) { commonGearExtras.push(...COMMON_GREAVES); rareGearExtras.push(...RARE_GREAVES); epicGearExtras.push(...EPIC_GREAVES); }
  if (hasFootwear) { commonGearExtras.push(...COMMON_FOOTWEAR); rareGearExtras.push(...RARE_FOOTWEAR); epicGearExtras.push(...EPIC_FOOTWEAR); }
  if (hasHeadgear) { commonGearExtras.push(...COMMON_HEADGEAR); rareGearExtras.push(...RARE_HEADGEAR); epicGearExtras.push(...EPIC_HEADGEAR); }

  if (enemy.rarity === 'legendary') {
    const legendaryGearExtras = [];
    if (hasChest) legendaryGearExtras.push(...LEGENDARY_CHESTPIECES);
    if (hasGreaves) legendaryGearExtras.push(...LEGENDARY_GREAVES);
    if (hasFootwear) legendaryGearExtras.push(...LEGENDARY_FOOTWEAR);
    if (hasHeadgear) legendaryGearExtras.push(...LEGENDARY_HEADGEAR);
    items.push(makeScaledItemInstance(pickRandom([...LEGENDARY_WEAPONS, ...LEGENDARY_ARMORS, ...legendaryGearExtras]), enemy.depth));
    items.push(makeScaledItemInstance(pickRandom([...epicGearPool, ...epicGearExtras]), enemy.depth));
    gold += 100;
    greaterPotions += 2;
    potions += 2;
    const notOwned = KEY_ITEMS.filter(k => !player.keyItems.includes(k.id));
    if (notOwned.length > 0) keyItem = pickRandom(notOwned).id;
  } else if (enemy.rarity === 'common') {
    if (Math.random() < 0.25 + lb * 0.3) items.push(makeScaledItemInstance(pickRandom([...COMMON_WEAPONS, ...commonGearExtras.filter(g => g.type !== 'armor')]), enemy.depth));
    if (Math.random() < 0.2 + lb * 0.3) items.push(makeScaledItemInstance(pickRandom([...COMMON_ARMORS, ...commonGearExtras]), enemy.depth));
    if (Math.random() < 0.15 + lb * 0.3) items.push(makeScaledItemInstance(pickRandom([...COMMON_RINGS, ...COMMON_EARRINGS, ...(hasTrinket ? COMMON_TRINKETS : []), ...(hasNecklace ? COMMON_NECKLACES : [])]), enemy.depth));
    if (Math.random() < 0.05 + lb * 0.15) items.push(makeItemInstance(pickRandom(COMMON_SKILLBOOKS)));
    if (Math.random() < 0.3 + lb * 0.3) potions += 1;
    if (Math.random() < 0.12 + lb * 0.2) throwables += 1 + Math.floor(Math.random() * 3);
    if (hasHandcannon && Math.random() < 0.15 + lb * 0.2) bullets += 1 + Math.floor(Math.random() * 3);
    if (hasBow && Math.random() < 0.15 + lb * 0.2) arrows += 1 + Math.floor(Math.random() * 3);
  } else {
    // Guaranteed one piece of rare gear (weapon/armor/ring/earring/trinket/necklace, plus chest/greaves/footwear if unlocked).
    items.push(makeScaledItemInstance(pickRandom([...rareGearPool, ...rareGearExtras]), enemy.depth));
    if (Math.random() < 0.15 + lb * 0.5) items.push(makeScaledItemInstance(pickRandom([...epicGearPool, ...epicGearExtras]), enemy.depth));
    // Magical runes (rare skill books) are now a separate, rarer 5% drop.
    if (Math.random() < 0.05 + lb * 0.15) items.push(makeItemInstance(pickRandom(RARE_SKILLBOOKS)));
    if (Math.random() < 0.5) greaterPotions += 1;
    if (Math.random() < 0.35) potions += 1;
    gold += 10;
    if (Math.random() < 0.04 + lb * 0.2) map = true;
    if (hasHandcannon && Math.random() < 0.4) bullets += 2 + Math.floor(Math.random() * 4);
    if (hasBow && Math.random() < 0.4) arrows += 2 + Math.floor(Math.random() * 4);
    if (Math.random() < 0.1) {
      const notOwned = KEY_ITEMS.filter(k => !player.keyItems.includes(k.id));
      if (notOwned.length > 0) keyItem = pickRandom(notOwned).id;
    }
  }

  // Double Pagination (Figures 7) — chance a found skill book duplicates itself.
  let paginationProc = false;
  if (player.doublePaginationChance) {
    items.filter(it => it.type === 'skillbook').forEach(b => {
      if (Math.random() * 100 < player.doublePaginationChance) {
        items.push({ ...b, uid: uid(b.id) });
        paginationProc = true;
      }
    });
  }

  items = applyFactorySealedToItems(items, player.factorySealedChance);

  return { gold, potions, greaterPotions, items, map, keyItem, throwables, bullets, arrows, paginationProc };
}

function generateMerchantStock(depth, player) {
  const scale = 1 + depth * 0.04;
  const ledgerDiscount = (player && player.keyItems && player.keyItems.includes('merchant_ledger')) ? 0.85 : 1;

  const bmUnlocked = (player && player.betterMerchantUnlocked) || [];
  let bmDiscount = 1, extraSlots = 0, moreSkillbooks = false;
  bmUnlocked.forEach(nodeId => {
    const node = BETTER_MERCHANT_TREE.find(n => n.id === nodeId);
    if (!node) return;
    if (node.effect.discount) bmDiscount -= node.effect.discount;
    if (node.effect.extraSlots) extraSlots += node.effect.extraSlots;
    if (node.effect.moreSkillbooks) moreSkillbooks = true;
  });
  const discount = Math.max(0.5, ledgerDiscount * bmDiscount);

  const commonSkillbookPool = COMMON_SKILLBOOKS.map(it => ({ ...it, price: Math.round(15 * scale * discount) }));
  const rareSkillbookPool = RARE_SKILLBOOKS.map(it => ({ ...it, price: Math.round(95 * scale * discount) }));
  const commonPool = [
    ...COMMON_WEAPONS, ...COMMON_ARMORS, ...COMMON_RINGS, ...COMMON_EARRINGS, ...commonSkillbookPool,
  ].map(it => ({ ...it, price: Math.round(15 * scale * discount) }));
  const rarePool = [
    ...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS, ...rareSkillbookPool,
  ].map(it => ({ ...it, price: Math.round(95 * scale * discount) }));
  const epicPool = [
    ...EPIC_WEAPONS, ...EPIC_ARMORS,
  ].map(it => ({ ...it, price: Math.round(220 * scale * discount) }));
  const legendaryPool = [
    ...LEGENDARY_WEAPONS, ...LEGENDARY_ARMORS,
  ].map(it => ({ ...it, price: Math.round(650 * scale * discount) }));

  // Merchant stock quality rises with depth — beginner gear phases out entirely
  // by depth 30, and a legendary occasionally shows up once you're deep enough
  // to actually afford one.
  let commonReps, rareReps, epicReps, legendaryReps;
  if (depth < 12) { commonReps = 3; rareReps = 1; epicReps = 1; legendaryReps = 0; }
  else if (depth < 30) { commonReps = 1; rareReps = 2; epicReps = 1; legendaryReps = 0; }
  else if (depth < 55) { commonReps = 0; rareReps = 2; epicReps = 2; legendaryReps = 0; }
  else { commonReps = 0; rareReps = 1; epicReps = 2; legendaryReps = 1; }

  const weighted = moreSkillbooks
    ? [
        ...Array(commonReps).fill(commonSkillbookPool).flat(),
        ...Array(rareReps + 1).fill(rareSkillbookPool).flat(),
        ...Array(rareReps).fill(rarePool).flat(),
        ...Array(epicReps).fill(epicPool).flat(),
        ...Array(legendaryReps).fill(legendaryPool).flat(),
      ]
    : [
        ...Array(commonReps).fill(commonPool).flat(),
        ...Array(rareReps).fill(rarePool).flat(),
        ...Array(epicReps).fill(epicPool).flat(),
        ...Array(legendaryReps).fill(legendaryPool).flat(),
      ];

  const baseSlots = 4 + extraSlots;
  const shuffled = [...weighted].sort(() => Math.random() - 0.5).slice(0, baseSlots)
    .map(it => (it.type === 'skillbook' ? makeItemInstance(it) : makeScaledItemInstance(it, depth)));
  shuffled.push({ id: 'health_potion', name: 'Health Potion', type: 'potion', rarity: 'common', price: Math.round(10 * discount), uid: uid('hp') });
  shuffled.push({ id: 'greater_potion', name: 'Greater Elixir', type: 'greaterPotion', rarity: 'rare', price: Math.round(35 * discount), uid: uid('gp') });

  const sellsThrowables = bmUnlocked.some(id => BETTER_MERCHANT_TREE.find(n => n.id === id)?.effect.sellsThrowables);
  const sellsBullets = bmUnlocked.some(id => BETTER_MERCHANT_TREE.find(n => n.id === id)?.effect.sellsBullets);
  const sellsArrows = bmUnlocked.some(id => BETTER_MERCHANT_TREE.find(n => n.id === id)?.effect.sellsArrows);

  if (sellsThrowables) {
    shuffled.push({ id: 'throwing_knives', name: 'Throwing Knives (x5)', type: 'throwableStock', count: 5, rarity: 'common', atk: THROWABLES[0].atk, price: Math.round(20 * discount), uid: uid('knives') });
  }
  if (sellsBullets && player && player.keyItems && player.keyItems.includes('handcannon')) {
    shuffled.push({ id: 'bullets', name: 'Bullets (x5)', type: 'ammoStock', ammoKey: 'bullets', count: 5, rarity: 'common', price: Math.round(18 * discount), uid: uid('bullets') });
  }
  if (sellsArrows && player && player.keyItems && player.keyItems.includes('bow')) {
    shuffled.push({ id: 'arrows', name: 'Arrows (x5)', type: 'ammoStock', ammoKey: 'arrows', count: 5, rarity: 'common', price: Math.round(15 * discount), uid: uid('arrows') });
  }
  return shuffled;
}

function generateCollectorOffers(player, depth) {
  const scale = 1 + depth * 0.05;
  const owned = [];
  Object.keys(COLLECTIBLE_META).forEach(cat => {
    (player.collectibles[cat] || []).forEach(idx => owned.push({ category: cat, index: idx }));
  });
  if (owned.length === 0) return [];
  const offers = [];
  for (let i = 0; i < 3; i++) {
    const costCount = 1 + Math.floor(Math.random() * 2);
    const shuffledOwned = [...owned].sort(() => Math.random() - 0.5);
    const cost = shuffledOwned.slice(0, Math.min(costCount, shuffledOwned.length));
    const r = Math.random();
    let reward;
    if (r < 0.4) reward = { type: 'gold', amount: Math.round((20 + cost.length * 18) * scale) };
    else if (r < 0.6) reward = { type: 'potion', amount: cost.length };
    else if (r < 0.75) reward = { type: 'greaterPotion', amount: 1 };
    else if (r < 0.93) reward = { type: 'item', item: makeItemInstance(pickRandom([...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS])) };
    else reward = { type: 'item', item: makeItemInstance(pickRandom([...EPIC_WEAPONS, ...EPIC_ARMORS])) };
    offers.push({ id: uid('offer'), cost, reward });
  }
  return offers;
}

function describeReward(reward) {
  if (reward.type === 'gold') return `For: ${reward.amount}g`;
  if (reward.type === 'potion') return `For: ${reward.amount} Health Potion${reward.amount > 1 ? 's' : ''}`;
  if (reward.type === 'greaterPotion') return 'For: 1 Greater Elixir';
  if (reward.type === 'item') return `For: ${reward.item.name}`;
  return '';
}

function generateTreasureLoot(depth, player) {
  const mult = 1 + (depth - 1) * 0.12;
  const gold = Math.round((30 + Math.random() * 40) * mult);
  let items = [makeScaledItemInstance(pickRandom([...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS]), depth)];
  if (Math.random() < 0.3) items.push(makeItemInstance(pickRandom(RARE_SKILLBOOKS)));
  if (Math.random() < 0.35 + luckBonus(player)) items.push(makeScaledItemInstance(pickRandom([...EPIC_WEAPONS, ...EPIC_ARMORS]), depth));
  items = applyFactorySealedToItems(items, player && player.factorySealedChance);
  const potions = 1 + Math.floor(Math.random() * 2);
  const greaterPotions = Math.random() < 0.5 ? 1 : 0;
  return { gold, items, potions, greaterPotions };
}

// Coins 4 — Grand Library: every normal skillbook, plus exclusive tomes.
function generateLibraryStock(depth, player) {
  const scale = 1 + depth * 0.04;
  const ledgerDiscount = (player.keyItems && player.keyItems.includes('merchant_ledger')) ? 0.85 : 1;
  const commonStock = COMMON_SKILLBOOKS.map(b => ({ ...b, price: Math.round(20 * scale * ledgerDiscount), uid: uid(b.id) }));
  const rareStock = RARE_SKILLBOOKS.map(b => ({ ...b, price: Math.round(110 * scale * ledgerDiscount), uid: uid(b.id) }));
  let exclusiveCount = (player.keyItems && player.keyItems.includes('archivists_key')) ? 3 : 2;
  if (player.bannedBooksUnlocked) exclusiveCount += 1;
  const exclusivePool = [...EXCLUSIVE_LIBRARY_BOOKS, ...(player.bannedBooksUnlocked ? BANNED_BOOKS : [])];
  const exclusiveStock = [...exclusivePool]
    .sort(() => Math.random() - 0.5)
    .slice(0, exclusiveCount)
    .map(b => ({ ...b, price: Math.round(280 * scale * ledgerDiscount), uid: uid(b.id) }));
  return [...commonStock, ...rareStock, ...exclusiveStock];
}

// Figures 3 — Wheel of Fortune: one spin, one of gold/book/weapon/armor.
function generateWheelReward(depth, player) {
  const r = Math.random();
  if (r < 0.35) {
    return { type: 'gold', amount: Math.round((40 + Math.random() * 60) * (1 + (depth - 1) * 0.08)) };
  } else if (r < 0.55) {
    return { type: 'book', item: makeItemInstance(pickRandom([...COMMON_SKILLBOOKS, ...RARE_SKILLBOOKS])) };
  } else if (r < 0.8) {
    return { type: 'weapon', item: makeScaledItemInstance(pickRandom([...RARE_WEAPONS, ...EPIC_WEAPONS]), depth) };
  }
  return { type: 'armor', item: makeScaledItemInstance(pickRandom([...RARE_ARMORS, ...EPIC_ARMORS]), depth) };
}

// Stamps 3 — Relic Room: choose exactly one relic from a small paid offering.
function generateRelicOffers(player, depth) {
  const ownedIds = player.keyItems || [];
  const pool = [...KEY_ITEMS, ...EXCLUSIVE_RELICS].filter(r => !ownedIds.includes(r.id));
  const scale = 1 + depth * 0.05;
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(4, pool.length));
  return shuffled.map(r => ({ ...r, price: Math.round((120 + Math.random() * 80) * scale) }));
}

// Figures 4 — Deluxe Merchant: absurdly expensive, absurdly strong fixed
// stock. Both stats and price scale with depth, same as the regular
// Merchant and Grand Library, so it stays worth the splurge at any depth
// it happens to appear rather than being frozen at its base numbers.
function generateDeluxeMerchantStock(depth, player) {
  const scale = 1 + depth * 0.04;
  const ledgerDiscount = (player && player.keyItems && player.keyItems.includes('merchant_ledger')) ? 0.85 : 1;
  return DELUXE_MERCHANT_STOCK.map(it => {
    const priced = { ...it, price: Math.round(it.price * scale * ledgerDiscount) };
    return priced.type === 'skillbook' ? makeItemInstance(priced) : makeScaledItemInstance(priced, depth);
  });
}

function generateRoom(depth, player) {
  if (depth % 6 === 0) {
    return { type: 'merchant', enemies: [], cleared: true, stock: generateMerchantStock(depth, player) };
  }
  if (depth % 9 === 0) {
    return { type: 'healer', enemies: [], cleared: true };
  }
  if (player.figures4TreeUnlocked && Math.random() < 0.01) {
    return {
      type: 'deluxe_merchant',
      enemies: [],
      cleared: true,
      stock: generateDeluxeMerchantStock(depth, player),
    };
  }
  if (player.coins4TreeUnlocked && Math.random() < 0.06) {
    return { type: 'library', enemies: [], cleared: true, stock: generateLibraryStock(depth, player) };
  }
  if (player.figures3TreeUnlocked) {
    const wheelChance = 0.07 + ((player.keyItems || []).includes('gamblers_coin') ? 0.05 : 0);
    if (Math.random() < wheelChance) {
      return { type: 'wheel', enemies: [], cleared: false, spun: false, reward: generateWheelReward(depth, player) };
    }
  }
  if (player.stamps3TreeUnlocked && Math.random() < 0.05) {
    return { type: 'relic', enemies: [], cleared: false, bought: false, offers: generateRelicOffers(player, depth) };
  }
  if (player.coins6TreeUnlocked && Math.random() < 0.04) {
    return { type: 'tunnel', enemies: [], cleared: false, used: false };
  }
  const compassBonus = (player.keyItems || []).includes('wanderers_compass');
  if (getCollectibleCount(player) > 0 && Math.random() < (compassBonus ? 0.15 : 0.1)) {
    return { type: 'collector', enemies: [], cleared: true, offers: generateCollectorOffers(player, depth) };
  }
  if (Math.random() < (compassBonus ? 0.12 : 0.08)) {
    return { type: 'treasure', enemies: [], cleared: false, opened: false, loot: generateTreasureLoot(depth, player) };
  }
  const enemyCount = 1 + Math.floor(Math.random() * 3);
  const enemies = Array.from({ length: enemyCount }, () => scaleEnemy(pickEnemyTemplate(depth), depth));
  return { type: 'combat', enemies, cleared: false, fled: false };
}

function applyXp(player, xpGain) {
  let p = { ...player, xp: player.xp + xpGain };
  let leveled = false;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level += 1;
    p.maxHp += 10;
    p.hp = p.maxHp;
    p.atk += 2;
    p.def += 1;
    p.xpNext = Math.round(p.xpNext * 1.4);
    leveled = true;
  }
  return { player: p, leveled };
}

function describeEffect(eff) {
  const parts = [];
  if (eff.hp) parts.push(`+${eff.hp} max HP`);
  if (eff.atk) parts.push(`+${eff.atk} ATK`);
  if (eff.def) parts.push(`+${eff.def} DEF`);
  return `Permanently grants ${parts.join(', ')}.`;
}

function freshPrestige() {
  return {
    souls: 0,
    unlocked: {},        // nodeId -> times bought (1 for non-repeatable, N for repeatable)
    bodyMods: [],         // ['ear','pants','vest','feet','finger']
    bestDepthEver: 1,
    kills: {},             // persists forever, across every run
    bestiaryUnlocked: false,
    readyOrNotTreeUnlocked: false,
    readyOrNotUnlocked: [], // array of READY_OR_NOT_TREE ids
    combatTricks: [],       // array of COMBAT_TRICKS ids
    betterMerchantTreeUnlocked: false,
    betterMerchantUnlocked: [], // array of BETTER_MERCHANT_TREE ids
    coinsTradedIn: false,
    coins2TreeUnlocked: false,
    coins2Unlocked: [],
    coins3TreeUnlocked: false,
    coins3Unlocked: [],
    coins4TreeUnlocked: false, // Grand Library room unlocked
    coins5TreeUnlocked: false, // Wealth prestige tree unlocked
    wealthUnlocked: [],        // array of WEALTH_TREE ids
    figures2TreeUnlocked: false,
    figures2Unlocked: [],
    figures3TreeUnlocked: false, // Wheel of Fortune room unlocked
    figures4TreeUnlocked: false, // Deluxe Merchant room unlocked
    figures5TreeUnlocked: false, // Heavily Armed prestige tree unlocked
    heavilyArmedUnlocked: [],    // array of HEAVILY_ARMED_TREE ids ('headgear', 'dualwield')
    stamps2TreeUnlocked: false,
    stamps2Unlocked: [],
    stamps3TreeUnlocked: false, // Relic Room unlocked
    stamps4TreeUnlocked: false, // Health prestige tree unlocked
    healthUnlocked: [],         // array of HEALTH_TREE ids
    cards2Unlocked: false,   // second card set traded in — unlocks bestiary tiers 4-6
    cards3Unlocked: false,   // third card set traded in — unlocks bestiary tiers 7-9
    cards4TreeUnlocked: false, // fourth card set traded in — Ranged Mastery prestige tree unlocks
    rangedMasteryUnlocked: [], // array of RANGED_MASTERY_TREE ids
    cards5Unlocked: false,   // fifth card set traded in — unlocks bestiary tiers 10-12
    coins6TreeUnlocked: false,  // Secret Tunnel room unlocked
    stamps5TreeUnlocked: false, // Skills XI-XV unlocked
    stamps6TreeUnlocked: false, // sixth stamp set traded in — Grizzled Veteran prestige tree unlocks
    stamps6Unlocked: [],         // array of STAMPS6_TREE ids
    figures6TreeUnlocked: false, // Well-Read prestige tree unlocked
    wellReadUnlocked: [],        // array of WELL_READ_TREE ids
    figures7TreeUnlocked: false, // Book Smarts prestige tree unlocked
    bookSmartsUnlocked: [],      // array of BOOK_SMARTS_TREE ids
    regionalMasteryTreeUnlocked: false, // bought with Souls directly, like the Atlas
    regionalMasteryUnlocked: [],        // array of REGIONAL_MASTERY_TREE ids
    ascensionLevel: 0,       // permanent New Game+ level — see ASCEND action
    atlasUnlocked: false,    // bought with 100 Souls directly, no collectible trade-in required
    biomeVisits: {},         // biomeIndex -> lifetime visit count, permanent across every run
    soulwellUnlocked: false, // bought with 80 Souls directly, like the Atlas
    soulwellPulls: 0,        // lifetime pull count, for flavour
    soulwellLog: [],         // recent pull results, most recent first — for the Soulwell feed UI
    soulwellBonuses: freshSoulwellBonuses(), // stacking permanent gacha bonuses, see rollSoulwellBonus()
    stamps7TreeUnlocked: false,  // seventh stamp trade-in — Back with a Vengeance prestige tree unlocks
    backWithAVengeanceUnlocked: [], // array of STAMPS7_TREE ids
    lastDeathWeapon: null,       // snapshot of the weapon equipped the moment a run ends: { name, atk, def, rarity }
    coins7TreeUnlocked: false,   // seventh coin trade-in — Ancestral Memory prestige tree unlocks
    ancestralMemoryUnlocked: [], // array of ANCESTRAL_MEMORY_TREE ids
    figures8TreeUnlocked: false, // eighth figure trade-in — Factory Sealed prestige tree unlocks
    factorySealedUnlocked: [],   // array of FIGURES8_TREE ids
  };
}

function emptySlot(id, label, type) {
  return { id, name: label, type, rarity: 'common', atk: 0, def: 0 };
}

function applyPrestigeToPlayer(player, prestige) {
  let p = { ...player };
  p.bodyMods = [...prestige.bodyMods];
  p.kills = { ...(prestige.kills || {}) };
  p.bestiaryUnlocked = !!prestige.bestiaryUnlocked;
  p.cards2Unlocked = !!prestige.cards2Unlocked;
  p.cards3Unlocked = !!prestige.cards3Unlocked;
  p.combatTricks = [...(prestige.combatTricks || [])];
  p.betterMerchantUnlocked = [...(prestige.betterMerchantUnlocked || [])];
  p.atlasUnlocked = !!prestige.atlasUnlocked;
  p.biomeVisits = { ...(prestige.biomeVisits || {}) };
  p.soulwellUnlocked = !!prestige.soulwellUnlocked;
  const sw = prestige.soulwellBonuses || {};
  p.soulwellBonuses = {
    dmgEnemy: { ...(sw.dmgEnemy || {}) },
    dmgBiome: { ...(sw.dmgBiome || {}) },
    dodgeEnemy: { ...(sw.dodgeEnemy || {}) },
    defEnemy: { ...(sw.defEnemy || {}) },
    blockEnemy: { ...(sw.blockEnemy || {}) },
    knifeDmgEnemy: { ...(sw.knifeDmgEnemy || {}) },
  };
  p.stamps7TreeUnlocked = !!prestige.stamps7TreeUnlocked;
  p.coins7TreeUnlocked = !!prestige.coins7TreeUnlocked;
  p.ancestralMemoryChance = (prestige.ancestralMemoryUnlocked || []).length * 0.1;
  p.figures8TreeUnlocked = !!prestige.figures8TreeUnlocked;
  p.factorySealedChance = (prestige.factorySealedUnlocked || []).length * 1;
  p.coins4TreeUnlocked = !!prestige.coins4TreeUnlocked;
  p.figures3TreeUnlocked = !!prestige.figures3TreeUnlocked;
  p.figures4TreeUnlocked = !!prestige.figures4TreeUnlocked;
  p.stamps3TreeUnlocked = !!prestige.stamps3TreeUnlocked;
  p.coins5TreeUnlocked = !!prestige.coins5TreeUnlocked;
  p.figures5TreeUnlocked = !!prestige.figures5TreeUnlocked;
  p.stamps4TreeUnlocked = !!prestige.stamps4TreeUnlocked;
  p.heavilyArmedUnlocked = [...(prestige.heavilyArmedUnlocked || [])];
  p.coins6TreeUnlocked = !!prestige.coins6TreeUnlocked;
  p.stamps5TreeUnlocked = !!prestige.stamps5TreeUnlocked;
  p.figures6TreeUnlocked = !!prestige.figures6TreeUnlocked;
  p.figures7TreeUnlocked = !!prestige.figures7TreeUnlocked;
  p.cards4TreeUnlocked = !!prestige.cards4TreeUnlocked;
  p.cards5Unlocked = !!prestige.cards5Unlocked;
  p.stamps6TreeUnlocked = !!prestige.stamps6TreeUnlocked;
  p.regionalMasteryTreeUnlocked = !!prestige.regionalMasteryTreeUnlocked;

  // Regional Mastery — per-biome damage/gold/luck bonuses, one array slot per biome index.
  p.regionalMasteryUnlocked = [...(prestige.regionalMasteryUnlocked || [])];
  const regionalDmgBonus = new Array(BIOMES.length).fill(0);
  const regionalGoldBonus = new Array(BIOMES.length).fill(0);
  const regionalLuckBonus = new Array(BIOMES.length).fill(0);
  p.regionalMasteryUnlocked.forEach(nodeId => {
    const node = REGIONAL_MASTERY_TREE.find(n => n.id === nodeId);
    if (!node) return;
    if (node.kind === 'dmg') regionalDmgBonus[node.biomeIndex] += 10;
    else if (node.kind === 'gold') regionalGoldBonus[node.biomeIndex] += 5;
    else if (node.kind === 'luck') regionalLuckBonus[node.biomeIndex] += 5;
  });
  p.regionalDmgBonus = regionalDmgBonus;
  p.regionalGoldBonus = regionalGoldBonus;
  p.regionalLuckBonus = regionalLuckBonus;

  // Wealth (Coins 5) — bonus gold from selling and from loot sources (kills, Wheel)
  const wealthTiers = (prestige.wealthUnlocked || []).length;
  p.wealthSellBonus = wealthTiers * 0.02;
  p.wealthLootBonus = wealthTiers * 0.02;

  // Well-Read (Figures 6) — chance a skillbook's effect triggers twice
  const wellReadTiers = (prestige.wellReadUnlocked || []).length;
  p.wellReadChance = wellReadTiers * 2;

  // Book Smarts (Figures 7) — three one-time unlocks building on Well-Read
  p.bookSmartsUnlocked = [...(prestige.bookSmartsUnlocked || [])];
  p.bookEffectMult = p.bookSmartsUnlocked.includes('booksmarts') ? 2 : 1;
  p.doublePaginationChance = p.bookSmartsUnlocked.includes('double_pagination') ? 20 : 0;
  p.bannedBooksUnlocked = p.bookSmartsUnlocked.includes('banned_books');

  // Health (Stamps 4) — permanent % bonus to starting max HP
  const healthTiers = (prestige.healthUnlocked || []).length;
  if (healthTiers > 0) {
    p.maxHp = Math.round(p.maxHp * (1 + healthTiers * 0.05));
    p.hp = p.maxHp;
  }

  // Ascension — the capstone New Game+ layer. Permanently boosts core stats
  // and adds flat Luck, stacking with everything above. Enemies also scale
  // harder with depth from here on (see scaleEnemy/scaleLegendary).
  p.ascensionLevel = prestige.ascensionLevel || 0;
  if (p.ascensionLevel > 0) {
    const ascMult = ascensionStatMult(p.ascensionLevel);
    p.atk = Math.round(p.atk * ascMult);
    p.def = Math.round(p.def * ascMult);
    p.maxHp = Math.round(p.maxHp * ascMult);
    p.hp = p.maxHp;
    p.bonusLuck = (p.bonusLuck || 0) + p.ascensionLevel * 3;
  }
  p.ascensionGoldMult = p.ascensionLevel * 0.10;
  p.ascensionXpMult = p.ascensionLevel * 0.10;

  // Heavily Armed (Figures 5) — new slots
  if (p.heavilyArmedUnlocked.includes('headgear')) p.headgear = emptySlot('no_headgear', 'Empty Headgear Slot', 'headgear');
  if (p.heavilyArmedUnlocked.includes('dualwield')) p.weapon2 = emptySlot('no_weapon2', 'Empty Second Weapon Slot', 'weapon');

  // The Atlas — permanently grants every biome-exclusive weapon/armor pair
  // you've earned (30/60/90 lifetime visits to that biome) at the start of each run.
  if (p.atlasUnlocked) {
    const atlasWeapons = [];
    const atlasArmors = [];
    BIOMES.forEach((_, biomeIdx) => {
      const visits = p.biomeVisits[biomeIdx] || 0;
      ATLAS_TIERS.forEach((threshold, i) => {
        if (visits >= threshold) {
          const gear = buildBiomeGear(biomeIdx, i + 1);
          atlasWeapons.push(makeItemInstance(gear.weapon));
          atlasArmors.push(makeItemInstance(gear.armor));
        }
      });
    });
    if (atlasWeapons.length) p.weaponsBag = [...(p.weaponsBag || []), ...atlasWeapons];
    if (atlasArmors.length) p.armorsBag = [...(p.armorsBag || []), ...atlasArmors];
  }

  // Coins 2 prestige — knife buffs
  let knifeDmgBonus = 0, knifeCritBonus = 0, knifeSaveBonus = 0;
  (prestige.coins2Unlocked || []).forEach(nodeId => {
    const node = COINS2_TREE.find(n => n.id === nodeId);
    if (!node) return;
    if (node.effect.knifeDmg) knifeDmgBonus += node.effect.knifeDmg;
    if (node.effect.knifeCrit) knifeCritBonus += node.effect.knifeCrit;
    if (node.effect.knifeSave) knifeSaveBonus += node.effect.knifeSave;
  });

  // Ranged Mastery (Cards 4) — Handcannon/Bow/Knife buffs. Knife damage
  // stacks directly into the same total as Blade Mastery (Coins 2).
  p.rangedMasteryUnlocked = [...(prestige.rangedMasteryUnlocked || [])];
  let handcannonDmgBonus = 0, bowDmgBonus = 0, ammoSaveChance = 0, pierceCritChance = 0;
  p.rangedMasteryUnlocked.forEach(nodeId => {
    const node = RANGED_MASTERY_TREE.find(n => n.id === nodeId);
    if (!node) return;
    if (node.effect.handcannonDmg) handcannonDmgBonus += node.effect.handcannonDmg;
    if (node.effect.bowDmg) bowDmgBonus += node.effect.bowDmg;
    if (node.effect.knifeDmg) knifeDmgBonus += node.effect.knifeDmg;
    if (node.effect.ammoSave) ammoSaveChance += node.effect.ammoSave;
    if (node.effect.pierceCrit) pierceCritChance += node.effect.pierceCrit;
  });
  p.handcannonDmgBonus = handcannonDmgBonus;
  p.bowDmgBonus = bowDmgBonus;
  p.ammoSaveChance = Math.min(75, ammoSaveChance);
  p.knifePierceCritChance = Math.min(50, pierceCritChance);

  p.knifeDmgBonus = knifeDmgBonus;
  p.knifeCritChance = Math.min(50, knifeCritBonus);
  p.knifeSaveChance = Math.min(50, knifeSaveBonus);

  // Grizzled Veteran (Stamps 6) — a few one-time veteran conveniences
  p.stamps6Unlocked = [...(prestige.stamps6Unlocked || [])];
  p.tunnelDiscount = p.stamps6Unlocked.includes('tunnel_discount');
  p.megaCritChance = p.stamps6Unlocked.includes('megacrit') ? 1 : 0;
  p.restCostMult = p.stamps6Unlocked.includes('efficient_rest') ? 0.7 : 1;
  p.soulWindfallBonus = p.stamps6Unlocked.includes('soul_windfall') ? 0.1 : 0;


  // Madgod (Figures 2) — chaos loot procs
  const madgodTiers = (prestige.figures2Unlocked || []).length;
  p.madgodChance = Math.min(5, madgodTiers);

  // Physician (Stamps 2) — healing procs
  const physicianTiers = (prestige.stamps2Unlocked || []).length;
  p.physicianChance = Math.min(5, physicianTiers);

  // Slicing Giants (Coins 3) — boss-specific knife buffs
  let bossDmgBonus = 0, bossCritBonus = 0, bonusBladeChance = 0;
  (prestige.coins3Unlocked || []).forEach(nodeId => {
    const node = SLICING_GIANTS_TREE.find(n => n.id === nodeId);
    if (!node) return;
    if (node.effect.bossDmg) bossDmgBonus += node.effect.bossDmg;
    if (node.effect.bossCrit) bossCritBonus += node.effect.bossCrit;
    if (node.effect.bonusBlade) bonusBladeChance += node.effect.bonusBlade;
  });
  p.bossDmgBonus = bossDmgBonus;
  p.bossCritBonus = Math.min(50, bossCritBonus);
  p.bonusBladeChance = Math.min(50, bonusBladeChance);

  let bonusLuck = 0, bonusAtk = 0, bonusDef = 0, dodge = 0;
  Object.entries(prestige.unlocked || {}).forEach(([nodeId, times]) => {
    const node = PRESTIGE_TREE.find(n => n.id === nodeId);
    if (!node || node.group !== 'stat') return;
    const eff = node.effect;
    if (eff.luck) bonusLuck += eff.luck * times;
    if (eff.atk) bonusAtk += eff.atk * times;
    if (eff.def) bonusDef += eff.def * times;
    if (eff.dodge) dodge += eff.dodge * times;
  });
  p.bonusLuck = (p.bonusLuck || 0) + bonusLuck;
  p.atk += bonusAtk;
  p.def += bonusDef;
  p.dodgeChance = Math.min(40, dodge);

  if (p.bodyMods.includes('finger')) p.ring3 = emptySlot('no_ring3', 'Empty Ring Slot', 'ring');
  if (p.bodyMods.includes('ear')) p.earring2 = emptySlot('no_earring2', 'Empty Earring Slot', 'earring');
  if (p.bodyMods.includes('vest')) p.chestpiece = emptySlot('no_chest', 'Empty Chestpiece Slot', 'chestpiece');
  if (p.bodyMods.includes('pants')) p.greaves = emptySlot('no_greaves', 'Empty Greaves Slot', 'greaves');
  if (p.bodyMods.includes('feet')) p.footwear = emptySlot('no_footwear', 'Empty Footwear Slot', 'footwear');
  if (p.bodyMods.includes('trinket')) p.trinket = emptySlot('no_trinket', 'Empty Trinket Slot', 'trinket');
  if (p.bodyMods.includes('necklace')) p.necklace = emptySlot('no_necklace', 'Empty Necklace Slot', 'necklace');

  // Ready or Not: apply each unlocked tier's starting gear override.
  (prestige.readyOrNotUnlocked || []).forEach(nodeId => {
    const node = READY_OR_NOT_TREE.find(n => n.id === nodeId);
    if (!node) return;
    Object.entries(node.startingGear).forEach(([slot, item]) => {
      if (slot === 'footwear' && !p.footwear) return; // requires the slot to exist
      p[slot] = makeItemInstance(item);
    });
  });

  return p;
}

function freshPlayer(prestige, name) {
  const isNaomi = (name || '').trim().toLowerCase() === 'naomi';
  const base = {
    name: (name || '').trim() || 'Nameless Wanderer',
    hp: 50, maxHp: 50, atk: 5 + (isNaomi ? 10 : 0), def: 1, gold: 25,
    level: 1, xp: 0, xpNext: 30,
    weapon: { id: 'fists', name: 'Fists', type: 'weapon', rarity: 'common', atk: 0 },
    armor: { id: 'rags', name: 'Tattered Rags', type: 'armor', rarity: 'common', def: 0 },
    ring1: emptySlot('no_ring1', 'Empty Ring Slot', 'ring'),
    ring2: emptySlot('no_ring2', 'Empty Ring Slot', 'ring'),
    earring: emptySlot('no_earring', 'Empty Earring Slot', 'earring'),
    potions: 2, greaterPotions: 0,
    weaponsBag: [], armorsBag: [], accessoriesBag: [], skillbooksBag: [],
    chestpiecesBag: [], greavesBag: [], footwearBag: [], headgearBag: [], trinketsBag: [], necklacesBag: [],
    abilities: [],
    collectibles: { coins: [], cards: [], stamps: [], figures: [] },
    collectibleNames: { coins: {}, cards: {}, stamps: {}, figures: {} },
    pendingNames: [],
    discoveryOrder: [],
    maps: 0,
    keyItems: [],
    bonusLuck: 0,
    skillsUnlocked: [],
    maxDepthReached: 1,
    dodgeChance: 0,
    bodyMods: [],
    kills: {},
    bestiaryUnlocked: false,
    cards2Unlocked: false,
    combatTricks: [],
    betterMerchantUnlocked: [],
    throwable: null,
    throwableCount: 0,
    throwablesBag: [],
    bullets: 0,
    arrows: 0,
    knifeDmgBonus: 0,
    knifeCritChance: 0,
    knifeSaveChance: 0,
    madgodChance: 0,
    physicianChance: 0,
    elixirsOfLife: 0,
    bossDmgBonus: 0,
    bossCritBonus: 0,
    bonusBladeChance: 0,
    atlasUnlocked: false,
    biomeVisits: {},
    soulwellUnlocked: false,
    soulwellBonuses: freshSoulwellBonuses(),
    stamps7TreeUnlocked: false,
    coins7TreeUnlocked: false,
    ancestralMemoryChance: 0,
    figures8TreeUnlocked: false,
    factorySealedChance: 0,
    coins4TreeUnlocked: false,
    figures3TreeUnlocked: false,
    figures4TreeUnlocked: false,
    stamps3TreeUnlocked: false,
    usedSecondWind: false,
    coins5TreeUnlocked: false,
    figures5TreeUnlocked: false,
    stamps4TreeUnlocked: false,
    heavilyArmedUnlocked: [],
    wealthSellBonus: 0,
    wealthLootBonus: 0,
    cards3Unlocked: false,
    coins6TreeUnlocked: false,
    stamps5TreeUnlocked: false,
    figures6TreeUnlocked: false,
    wellReadChance: 0,
    figures7TreeUnlocked: false,
    bookSmartsUnlocked: [],
    bookEffectMult: 1,
    doublePaginationChance: 0,
    bannedBooksUnlocked: false,
    cards4TreeUnlocked: false,
    rangedMasteryUnlocked: [],
    handcannonDmgBonus: 0,
    bowDmgBonus: 0,
    ammoSaveChance: 0,
    knifePierceCritChance: 0,
    cards5Unlocked: false,
    stamps6TreeUnlocked: false,
    stamps6Unlocked: [],
    tunnelDiscount: false,
    megaCritChance: 0,
    restCostMult: 1,
    soulWindfallBonus: 0,
    regionalMasteryTreeUnlocked: false,
    regionalMasteryUnlocked: [],
    regionalDmgBonus: new Array(BIOMES.length).fill(0),
    regionalGoldBonus: new Array(BIOMES.length).fill(0),
    regionalLuckBonus: new Array(BIOMES.length).fill(0),
    ascensionLevel: 0,
    ascensionGoldMult: 0,
    ascensionXpMult: 0,
  };
  return prestige ? applyPrestigeToPlayer(base, prestige) : base;
}

function soulsForRun(maxDepthReached) {
  // 1 Soul per 3 depths reached, minimum 1 if you made it past depth 1.
  return Math.max(0, Math.floor((maxDepthReached - 1) / 3));
}

// Back with a Vengeance (Stamps 7): each new run has a small chance to
// start already holding the Vorpal Sword, a weapon exactly as strong as
// whatever was equipped the moment the previous run ended in death.
function rollBackWithAVengeance(prestige) {
  const chance = (prestige.backWithAVengeanceUnlocked || []).length; // 1 percentage point per tier
  if (chance <= 0 || !prestige.lastDeathWeapon) return null;
  if (Math.random() * 100 >= chance) return null;
  const dw = prestige.lastDeathWeapon;
  return { id: 'vorpal_sword', name: 'Vorpal Sword', type: 'weapon', rarity: dw.rarity || 'common', atk: dw.atk || 0, def: dw.def || 0, uid: uid('vorpal_sword'), sourceName: dw.name };
}

function freshState(prestige, preserveCollectibles, name) {
  const basePrestige = prestige || freshPrestige();
  const prevVisits = (basePrestige.biomeVisits && basePrestige.biomeVisits[0]) || 0;
  const usedPrestige = recordBiomeVisit(basePrestige, 0);
  const newVisits = usedPrestige.biomeVisits[0];
  const atlasMsgs = usedPrestige.atlasUnlocked ? atlasMilestoneLog(prevVisits, newVisits, 0) : [];
  let player = freshPlayer(usedPrestige, name);
  const vorpal = rollBackWithAVengeance(usedPrestige);
  if (vorpal) player = { ...player, weapon: vorpal };
  if (preserveCollectibles) {
    player.collectibles = preserveCollectibles.collectibles;
    player.collectibleNames = preserveCollectibles.collectibleNames;
    player.discoveryOrder = preserveCollectibles.discoveryOrder || [];
  }
  const isNaomi = (name || '').trim().toLowerCase() === 'naomi';
  return {
    player,
    prestige: usedPrestige,
    depth: 1,
    room: generateRoom(1, player),
    log: [
      `${player.name} steps through the threshold. Cold, wet air rushes up from the dark.`,
      ...(isNaomi ? ['✦ The dungeon recognizes you, Naomi. +10 ATK granted.'] : []),
      ...(vorpal ? [`⚔️ Back with a Vengeance! The Vorpal Sword (once your ${vorpal.sourceName}) is already in your hand — ${vorpal.atk} ATK, ${vorpal.def} DEF.`] : []),
      ...atlasMsgs,
    ],
    gameOver: false,
    prestigeReady: false,
    selectedTarget: 0,
    narration: null,
    narrationLoading: true,
    biomeIntroId: 1,
    biomeChoicePending: false,
    loaded: true,
  };
}

function totalAtk(player) {
  return player.atk
    + (player.weapon.atk || 0) + (player.armor.atk || 0)
    + (player.ring1.atk || 0) + (player.ring2.atk || 0) + (player.earring.atk || 0)
    + (player.ring3 ? (player.ring3.atk || 0) : 0)
    + (player.earring2 ? (player.earring2.atk || 0) : 0)
    + (player.chestpiece ? (player.chestpiece.atk || 0) : 0)
    + (player.greaves ? (player.greaves.atk || 0) : 0)
    + (player.footwear ? (player.footwear.atk || 0) : 0)
    + (player.headgear ? (player.headgear.atk || 0) : 0)
    + (player.trinket ? (player.trinket.atk || 0) : 0)
    + (player.necklace ? (player.necklace.atk || 0) : 0)
    + (player.weapon2 ? (player.weapon2.atk || 0) : 0);
}
function totalDef(player) {
  return player.def
    + (player.weapon.def || 0) + (player.armor.def || 0)
    + (player.ring1.def || 0) + (player.ring2.def || 0) + (player.earring.def || 0)
    + (player.ring3 ? (player.ring3.def || 0) : 0)
    + (player.earring2 ? (player.earring2.def || 0) : 0)
    + (player.chestpiece ? (player.chestpiece.def || 0) : 0)
    + (player.greaves ? (player.greaves.def || 0) : 0)
    + (player.footwear ? (player.footwear.def || 0) : 0)
    + (player.headgear ? (player.headgear.def || 0) : 0)
    + (player.trinket ? (player.trinket.def || 0) : 0)
    + (player.necklace ? (player.necklace.def || 0) : 0)
    + (player.weapon2 ? (player.weapon2.def || 0) : 0);
}

/* =========================================================
   COMBAT HELPERS (shared by ATTACK / FLEE)
========================================================= */

function enemyTurn(player, enemies, log) {
  let p = player;
  const lb = luckBonus(p) * 0.5;
  const baseDodge = (p.dodgeChance || 0) / 100;
  enemies.forEach(e => {
    if (e.hp > 0) {
      const bb = bestiaryBonusVs(p, e.baseId);
      const dodge = baseDodge + bb.dodgeBonus / 100 + soulwellDodgeFor(p, e.baseId);
      let blocked = false;
      if (dodge > 0 && Math.random() < dodge) {
        blocked = true;
        log.push(`You dodge the ${e.name}'s attack entirely!`);
      }
      if (!blocked && p.abilities.includes('ironskin') && Math.random() < 0.15 + lb) {
        blocked = true;
        log.push(`Your skin turns to stone — the ${e.name}'s attack is deflected!`);
      }
      if (!blocked) {
        const soulwellBlock = soulwellBlockChanceFor(p, e.baseId);
        if (soulwellBlock > 0 && Math.random() < soulwellBlock) {
          blocked = true;
          log.push(`🎰 A Soulwell ward flares — the ${e.name}'s attack is fully blocked!`);
        }
      }
      if (!blocked) {
        const edmg = damageRoll(Math.max(1, e.atk), Math.round(totalDef(p) * bb.defMult * soulwellDefMultFor(p, e.baseId)));
        const physicianChance = (p.physicianChance || 0) / 100;
        if (physicianChance > 0 && Math.random() < physicianChance) {
          const healed = Math.min(p.maxHp - p.hp, edmg);
          if (healed > 0) {
            p = { ...p, hp: Math.min(p.maxHp, p.hp + healed) };
            log.push(`The ${e.name} strikes — but the blow heals you for ${healed} instead! (Physician)`);
          } else {
            log.push(`The ${e.name} strikes — the Physician turns the blow to nothing!`);
          }
        } else {
          p = { ...p, hp: Math.max(0, p.hp - edmg) };
          log.push(`The ${e.name} hits you for ${edmg}.`);
          if (p.abilities.includes('thorns') && edmg > 0 && e.hp > 0) {
            const reflected = Math.max(1, Math.round(edmg * 0.25));
            e.hp = Math.max(0, e.hp - reflected);
            log.push(`🌵 Thorns reflect ${reflected} damage back at the ${e.name}.`);
          }
        }
      }
      if (p.abilities.includes('counter') && Math.random() < 0.15 + lb && e.hp > 0) {
        const cdmg = damageRoll(Math.max(1, Math.round(totalAtk(p) * 0.5)), e.def);
        e.hp = Math.max(0, e.hp - cdmg);
        log.push(`You riposte the ${e.name} for ${cdmg}.`);
      }
    }
  });
  return p;
}

// The first time a run's player would die, Second Wind (if learned) keeps
// them alive at 1 HP instead. Returns the (possibly revived) player and
// whether death was prevented.
function applySecondWind(player, log) {
  if (player.hp > 0) return { player, prevented: false };
  if (player.abilities.includes('second_wind') && !player.usedSecondWind) {
    const p = { ...player, hp: 1, usedSecondWind: true };
    log.push('✦ The Phoenix Pact ignites — you cling to life with 1 HP instead of falling!');
    return { player: p, prevented: true };
  }
  return { player, prevented: false };
}

// Captures whatever weapon was equipped the moment a run actually ends
// (Second Wind failed to save them). Feeds Back with a Vengeance (Stamps 7)
// — the next run has a small chance to start already holding a Vorpal
// Sword built from this exact snapshot.
function snapshotDeathWeapon(weapon) {
  if (!weapon) return null;
  return { name: weapon.name, atk: weapon.atk || 0, def: weapon.def || 0, rarity: weapon.rarity || 'common' };
}

function grantLootForDefeated(player, enemies, log) {
  let p = player;
  enemies.forEach(e => {
    if (e.hp <= 0 && !e.lootGranted) {
      e.lootGranted = true;
      log.push(`The ${e.name} falls!`);

      const kills = { ...(p.kills || {}) };
      const prevKills = kills[e.baseId] || 0;
      kills[e.baseId] = prevKills + 1;
      p = { ...p, kills };
      if (p.bestiaryUnlocked) {
        const milestoneThresholds = p.cards5Unlocked ? BESTIARY_THRESHOLDS_EXTENDED3
          : p.cards3Unlocked ? BESTIARY_THRESHOLDS_EXTENDED2
          : p.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE;
        milestoneThresholds.forEach(threshold => {
          if (prevKills + 1 === threshold) {
            log.push(`📖 Bestiary milestone: ${threshold} kills on the ${e.name}! Combat bonus against them increased.`);
          }
        });
      }

      const loot = rollLoot(e, p);

      let goldGain = loot.gold;
      if (p.keyItems.includes('thief_signet')) goldGain = Math.round(goldGain * 1.15);
      if (p.wealthLootBonus) goldGain = Math.round(goldGain * (1 + p.wealthLootBonus));
      const eBiome = currentBiome(e.depth);
      const regionalGoldPct = ((p.regionalGoldBonus && p.regionalGoldBonus[eBiome]) || 0) / 100;
      const regionalLuckPct = ((p.regionalLuckBonus && p.regionalLuckBonus[eBiome]) || 0) / 100;
      if (regionalGoldPct) goldGain = Math.round(goldGain * (1 + regionalGoldPct));
      if (p.ascensionGoldMult) goldGain = Math.round(goldGain * (1 + p.ascensionGoldMult));
      p = { ...p, gold: p.gold + goldGain };

      let xpGain = e.xp;
      if (p.keyItems.includes('sage_monocle')) xpGain = Math.round(xpGain * 1.15);
      if (p.ascensionXpMult) xpGain = Math.round(xpGain * (1 + p.ascensionXpMult));
      const { player: leveledPlayer, leveled } = applyXp(p, xpGain);
      p = leveledPlayer;

      if (loot.potions) p = { ...p, potions: p.potions + loot.potions };
      if (loot.greaterPotions) p = { ...p, greaterPotions: p.greaterPotions + loot.greaterPotions };
      loot.items.forEach(it => {
        if (it.type === 'weapon') p = { ...p, weaponsBag: [...p.weaponsBag, it] };
        else if (it.type === 'armor') p = { ...p, armorsBag: [...p.armorsBag, it] };
        else if (it.type === 'chestpiece') p = { ...p, chestpiecesBag: [...(p.chestpiecesBag || []), it] };
        else if (it.type === 'greaves') p = { ...p, greavesBag: [...(p.greavesBag || []), it] };
        else if (it.type === 'footwear') p = { ...p, footwearBag: [...(p.footwearBag || []), it] };
        else if (it.type === 'headgear') p = { ...p, headgearBag: [...(p.headgearBag || []), it] };
        else if (it.type === 'trinket') p = { ...p, trinketsBag: [...(p.trinketsBag || []), it] };
        else if (it.type === 'necklace') p = { ...p, necklacesBag: [...(p.necklacesBag || []), it] };
        else if (it.type === 'ring' || it.type === 'earring') p = { ...p, accessoriesBag: [...p.accessoriesBag, it] };
        else if (it.type === 'skillbook') p = { ...p, skillbooksBag: [...p.skillbooksBag, it] };
      });

      if (loot.throwables) {
        p = { ...p, throwablesBag: [...(p.throwablesBag || []), { ...THROWABLES[0], uid: uid('knives'), count: loot.throwables }] };
      }
      if (loot.bullets) p = { ...p, bullets: (p.bullets || 0) + loot.bullets };
      if (loot.arrows) p = { ...p, arrows: (p.arrows || 0) + loot.arrows };

      // Madgod procs on kill loot
      const madgod = p.madgodChance || 0;
      if (madgod > 0) {
        if (loot.items.length > 0 && Math.random() * 100 < madgod) {
          const duped = { ...pickRandom(loot.items), uid: uid('duped') };
          if (duped.type === 'weapon') p = { ...p, weaponsBag: [...p.weaponsBag, duped] };
          else if (duped.type === 'armor') p = { ...p, armorsBag: [...p.armorsBag, duped] };
          else if (duped.type === 'chestpiece') p = { ...p, chestpiecesBag: [...(p.chestpiecesBag || []), duped] };
          else if (duped.type === 'greaves') p = { ...p, greavesBag: [...(p.greavesBag || []), duped] };
          else if (duped.type === 'footwear') p = { ...p, footwearBag: [...(p.footwearBag || []), duped] };
          else if (duped.type === 'headgear') p = { ...p, headgearBag: [...(p.headgearBag || []), duped] };
          else if (duped.type === 'trinket') p = { ...p, trinketsBag: [...(p.trinketsBag || []), duped] };
          else if (duped.type === 'necklace') p = { ...p, necklacesBag: [...(p.necklacesBag || []), duped] };
          else if (duped.type === 'ring' || duped.type === 'earring') p = { ...p, accessoriesBag: [...p.accessoriesBag, duped] };
          else if (duped.type === 'skillbook') p = { ...p, skillbooksBag: [...p.skillbooksBag, duped] };
          log.push(`✨ The Madgod cackles — you find a duplicate ${duped.name}!`);
        }
        if (Math.random() * 100 < madgod) {
          p = { ...p, elixirsOfLife: (p.elixirsOfLife || 0) + 1 };
          log.push('✨ The Madgod blesses you — an Elixir of Life materialises in your hands!');
        }
      }

      if (loot.map) {
        p = { ...p, maps: p.maps + 1 };
        log.push('🗺️ You find a tattered map among the remains!');
      }

      if (loot.keyItem) {
        const ki = KEY_ITEMS.find(k => k.id === loot.keyItem);
        if (ki.id === 'heart_mountain') p = { ...p, maxHp: p.maxHp + 20, hp: p.hp + 20, keyItems: [...p.keyItems, ki.id] };
        else if (ki.id === 'berserker_tooth') p = { ...p, atk: p.atk + 3, keyItems: [...p.keyItems, ki.id] };
        else if (ki.id === 'guardian_ward') p = { ...p, def: p.def + 3, keyItems: [...p.keyItems, ki.id] };
        else p = { ...p, keyItems: [...p.keyItems, ki.id] };
        log.push(`✨ Relic found: ${ki.name}! ${ki.desc}`);
      }

      let lootMsg = `Loot: +${goldGain}g, +${xpGain}xp`;
      if (loot.items.length) lootMsg += `, found ${loot.items.map(i => i.name).join(', ')}`;
      if (loot.potions) lootMsg += `, +${loot.potions} potion`;
      if (loot.greaterPotions) lootMsg += `, +${loot.greaterPotions} elixir`;
      if (loot.throwables) lootMsg += `, +${loot.throwables} Throwing Knives`;
      if (loot.bullets) lootMsg += `, +${loot.bullets} Bullets`;
      if (loot.arrows) lootMsg += `, +${loot.arrows} Arrows`;
      log.push(lootMsg);
      if (loot.paginationProc) log.push('📖 Double Pagination — the tome copies itself in your hands!');
      if (leveled) log.push(`✦ You reached level ${p.level}! HP and stats increased, wounds mended.`);

      const collChance = (e.rarity === 'common' ? 0.12 : 0.3) + luckBonus(p) + regionalLuckPct;
      if (Math.random() < collChance) {
        const coll = rollCollectible(p);
        if (coll) {
          const updatedList = [...p.collectibles[coll.category], coll.index];
          p = {
            ...p,
            collectibles: { ...p.collectibles, [coll.category]: updatedList },
            pendingNames: [...p.pendingNames, { category: coll.category, index: coll.index }],
          };
          const meta = COLLECTIBLE_META[coll.category];
          const singular = meta.label.slice(0, -1).toLowerCase();
          log.push(`${meta.icon} You find a curious ${singular} — added to your collection! (${meta.label} ${updatedList.length}/50)`);
        }
      }
    }
  });
  return p;
}

/* =========================================================
   AI NARRATION & NAMING
========================================================= */

function fallbackNarration(room) {
  const list = FALLBACK_NARRATIONS[room.type] || FALLBACK_NARRATIONS.combat;
  return pickRandom(list);
}

function buildBiomePrompt(state) {
  const biome = BIOMES[currentBiome(state.depth)];
  return `You are the narrator of a dark fantasy dungeon crawler RPG. The hero has just descended into a new region: ${biome.name} (${biome.desc}), now at dungeon level ${state.depth}. Write exactly one atmospheric sentence (max 30 words) introducing this new area and its mood. Output only the sentence, no quotes, no preamble.`;
}

async function fetchNarration(prompt) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const block = data?.content?.find(c => c.type === 'text');
    const text = block?.text?.trim();
    if (!text) return null;
    return text.replace(/^["']+|["']+$/g, '');
  } catch (e) {
    return null;
  }
}

async function fetchCollectibleName(category, index) {
  const meta = COLLECTIBLE_META[category];
  const seed = COLLECTIBLE_NAMES[category][index];
  const singular = meta.label.slice(0, -1).toLowerCase();
  const prompt = `You are naming items for a fantasy dungeon crawler's collection cabinet. The player just found a ${singular} loosely inspired by "${seed}". Invent ONE unique, evocative, slightly whimsical name for this specific item (max 6 words). Output only the name, no quotes, no preamble, no numbering.`;
  return fetchNarration(prompt);
}

/* =========================================================
   REDUCER
========================================================= */

function reducer(state, action) {
  if (!state.loaded && action.type !== 'LOAD' && action.type !== 'START_GAME' && action.type !== 'SHOW_TITLE') return state;

  switch (action.type) {
    case 'SHOW_TITLE':
      return { loaded: false, showTitle: true };

    case 'LOAD': {
      const p = action.payload;
      const prestige = { ...freshPrestige(), ...p.prestige };
      const fp = freshPlayer(prestige);
      const player = {
        ...fp,
        ...p.player,
        weapon: p.player?.weapon || fp.weapon,
        armor: p.player?.armor || fp.armor,
        ring1: p.player?.ring1 || fp.ring1,
        ring2: p.player?.ring2 || fp.ring2,
        ring3: p.player?.ring3 || fp.ring3,
        earring: p.player?.earring || fp.earring,
        earring2: p.player?.earring2 || fp.earring2,
        chestpiece: p.player?.chestpiece || fp.chestpiece,
        greaves: p.player?.greaves || fp.greaves,
        footwear: p.player?.footwear || fp.footwear,
        headgear: p.player?.headgear || fp.headgear,
        trinket: p.player?.trinket || fp.trinket,
        necklace: p.player?.necklace || fp.necklace,
        weapon2: p.player?.weapon2 || fp.weapon2,
        weaponsBag: p.player?.weaponsBag || [],
        armorsBag: p.player?.armorsBag || [],
        accessoriesBag: p.player?.accessoriesBag || [],
        skillbooksBag: p.player?.skillbooksBag || [],
        chestpiecesBag: p.player?.chestpiecesBag || [],
        greavesBag: p.player?.greavesBag || [],
        footwearBag: p.player?.footwearBag || [],
        headgearBag: p.player?.headgearBag || [],
        trinketsBag: p.player?.trinketsBag || [],
        necklacesBag: p.player?.necklacesBag || [],
        throwablesBag: p.player?.throwablesBag || [],
        throwable: p.player?.throwable || null,
        throwableCount: p.player?.throwableCount || 0,
        bullets: p.player?.bullets || 0,
        arrows: p.player?.arrows || 0,
        abilities: p.player?.abilities || [],
        collectibles: p.player?.collectibles || fp.collectibles,
        collectibleNames: p.player?.collectibleNames || fp.collectibleNames,
        pendingNames: p.player?.pendingNames || [],
        discoveryOrder: p.player?.discoveryOrder || [],
        maps: p.player?.maps || 0,
        keyItems: p.player?.keyItems || [],
        bonusLuck: p.player?.bonusLuck || 0,
        skillsUnlocked: p.player?.skillsUnlocked || [],
        maxDepthReached: p.player?.maxDepthReached || p.depth || 1,
        dodgeChance: fp.dodgeChance,
        bodyMods: fp.bodyMods,
        kills: fp.kills,
        bestiaryUnlocked: fp.bestiaryUnlocked,
        combatTricks: fp.combatTricks,
        betterMerchantUnlocked: fp.betterMerchantUnlocked,
        madgodChance: fp.madgodChance,
        physicianChance: fp.physicianChance,
        elixirsOfLife: p.player?.elixirsOfLife || 0,
        bossDmgBonus: fp.bossDmgBonus,
        bossCritBonus: fp.bossCritBonus,
        bonusBladeChance: fp.bonusBladeChance,
        cards2Unlocked: fp.cards2Unlocked,
        atlasUnlocked: fp.atlasUnlocked,
        biomeVisits: fp.biomeVisits,
        soulwellUnlocked: fp.soulwellUnlocked,
        soulwellBonuses: fp.soulwellBonuses,
        stamps7TreeUnlocked: fp.stamps7TreeUnlocked,
        coins7TreeUnlocked: fp.coins7TreeUnlocked,
        ancestralMemoryChance: fp.ancestralMemoryChance,
        figures8TreeUnlocked: fp.figures8TreeUnlocked,
        factorySealedChance: fp.factorySealedChance,
        coins4TreeUnlocked: fp.coins4TreeUnlocked,
        figures3TreeUnlocked: fp.figures3TreeUnlocked,
        figures4TreeUnlocked: fp.figures4TreeUnlocked,
        stamps3TreeUnlocked: fp.stamps3TreeUnlocked,
        usedSecondWind: p.player?.usedSecondWind || false,
        coins5TreeUnlocked: fp.coins5TreeUnlocked,
        figures5TreeUnlocked: fp.figures5TreeUnlocked,
        stamps4TreeUnlocked: fp.stamps4TreeUnlocked,
        heavilyArmedUnlocked: fp.heavilyArmedUnlocked,
        wealthSellBonus: fp.wealthSellBonus,
        wealthLootBonus: fp.wealthLootBonus,
        cards3Unlocked: fp.cards3Unlocked,
        coins6TreeUnlocked: fp.coins6TreeUnlocked,
        stamps5TreeUnlocked: fp.stamps5TreeUnlocked,
        figures6TreeUnlocked: fp.figures6TreeUnlocked,
        wellReadChance: fp.wellReadChance,
        figures7TreeUnlocked: fp.figures7TreeUnlocked,
        bookSmartsUnlocked: fp.bookSmartsUnlocked,
        bookEffectMult: fp.bookEffectMult,
        doublePaginationChance: fp.doublePaginationChance,
        bannedBooksUnlocked: fp.bannedBooksUnlocked,
        cards4TreeUnlocked: fp.cards4TreeUnlocked,
        rangedMasteryUnlocked: fp.rangedMasteryUnlocked,
        handcannonDmgBonus: fp.handcannonDmgBonus,
        bowDmgBonus: fp.bowDmgBonus,
        ammoSaveChance: fp.ammoSaveChance,
        knifePierceCritChance: fp.knifePierceCritChance,
        cards5Unlocked: fp.cards5Unlocked,
        stamps6TreeUnlocked: fp.stamps6TreeUnlocked,
        stamps6Unlocked: fp.stamps6Unlocked,
        tunnelDiscount: fp.tunnelDiscount,
        megaCritChance: fp.megaCritChance,
        restCostMult: fp.restCostMult,
        soulWindfallBonus: fp.soulWindfallBonus,
        regionalMasteryTreeUnlocked: fp.regionalMasteryTreeUnlocked,
        regionalMasteryUnlocked: fp.regionalMasteryUnlocked,
        regionalDmgBonus: fp.regionalDmgBonus,
        regionalGoldBonus: fp.regionalGoldBonus,
        regionalLuckBonus: fp.regionalLuckBonus,
        ascensionLevel: fp.ascensionLevel,
        ascensionGoldMult: fp.ascensionGoldMult,
        ascensionXpMult: fp.ascensionXpMult,
      };
      return {
        player,
        prestige,
        depth: p.depth,
        room: p.room,
        log: p.log || [],
        gameOver: !!p.gameOver,
        prestigeReady: !!p.prestigeReady,
        selectedTarget: p.selectedTarget || 0,
        narration: fallbackNarration(p.room),
        narrationLoading: false,
        biomeIntroId: p.biomeIntroId || 1,
        biomeChoicePending: !!p.biomeChoicePending,
        loaded: true,
      };
    }

    case 'NEW_GAME':
      // Returns to the title screen so a new character name can be chosen.
      // Wipes prestige too — this is the full hard reset, used only on explicit confirmation.
      return { loaded: false, showTitle: true };

    case 'START_GAME': {
      // Fired from the title screen with a chosen name — begins the very first run.
      return freshState(null, null, action.payload);
    }

    case 'CLAIM_PRESTIGE': {
      // Called from the Game Over screen: bank Souls earned this run.
      if (!state.gameOver || state.prestigeReady) return state;
      const baseEarned = soulsForRun(state.player.maxDepthReached || 1);
      const earned = Math.round(baseEarned * (1 + (state.player.soulWindfallBonus || 0)));
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls + earned,
        bestDepthEver: Math.max(state.prestige.bestDepthEver, state.player.maxDepthReached || 1),
        kills: { ...(state.player.kills || {}) },
      };
      const windfallNote = earned > baseEarned ? ' (✦ Soul Windfall)' : '';
      const log = [...state.log, `💀 Run ended. You banked ${earned} Soul${earned === 1 ? '' : 's'} for prestige upgrades.${windfallNote}`];
      return { ...state, prestige, prestigeReady: true, log: log.slice(-50) };
    }

    case 'UNLOCK_PRESTIGE': {
      const nodeId = action.payload;
      const node = PRESTIGE_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      const timesBought = state.prestige.unlocked[nodeId] || 0;
      if (!node.repeatable && timesBought >= 1) return state;
      if (node.max && timesBought >= node.max) return state;
      const cost = prestigeCost(node, timesBought);
      if (state.prestige.souls < cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - cost,
        unlocked: { ...state.prestige.unlocked, [nodeId]: timesBought + 1 },
        bodyMods: node.effect.bodyMod && !state.prestige.bodyMods.includes(node.effect.bodyMod)
          ? [...state.prestige.bodyMods, node.effect.bodyMod]
          : state.prestige.bodyMods,
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_ATLAS': {
      if (state.prestige.atlasUnlocked) return state;
      if (state.prestige.souls < ATLAS_COST) return state;
      const prestige = { ...state.prestige, souls: state.prestige.souls - ATLAS_COST, atlasUnlocked: true };
      return { ...state, prestige };
    }

    case 'UNLOCK_SOULWELL': {
      if (state.prestige.soulwellUnlocked) return state;
      if (state.prestige.souls < SOULWELL_UNLOCK_COST) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - SOULWELL_UNLOCK_COST,
        soulwellUnlocked: true,
        soulwellBonuses: state.prestige.soulwellBonuses || freshSoulwellBonuses(),
      };
      const log = [...state.log, '🎰 The Soulwell opens — feed it Souls for permanent, stacking combat boons.'];
      return { ...state, prestige, log: log.slice(-50) };
    }

    case 'PULL_SOULWELL': {
      if (!state.prestige.soulwellUnlocked) return state;
      if (state.prestige.souls < 1) return state;
      const roll = rollSoulwellBonus();
      const prevBonuses = state.prestige.soulwellBonuses || freshSoulwellBonuses();
      const bucket = { ...(prevBonuses[roll.type] || {}) };
      bucket[roll.target] = (bucket[roll.target] || 0) + roll.value;
      const soulwellBonuses = { ...prevBonuses, [roll.type]: bucket };
      const soulwellLog = [{ ...roll, id: uid('pull') }, ...(state.prestige.soulwellLog || [])].slice(0, 20);
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - 1,
        soulwellBonuses,
        soulwellPulls: (state.prestige.soulwellPulls || 0) + 1,
        soulwellLog,
      };
      const rarityTag = roll.rarity === 'rare' ? '✨ RARE' : roll.rarity === 'uncommon' ? 'Uncommon' : 'Common';
      const log = [...state.log, `🎰 Soulwell (${rarityTag}): ${roll.desc}`];
      return { ...state, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_REGIONAL_MASTERY_TREE': {
      if (state.prestige.regionalMasteryTreeUnlocked) return state;
      if (state.prestige.souls < REGIONAL_MASTERY_UNLOCK_COST) return state;
      const prestige = { ...state.prestige, souls: state.prestige.souls - REGIONAL_MASTERY_UNLOCK_COST, regionalMasteryTreeUnlocked: true };
      return { ...state, prestige };
    }

    case 'UNLOCK_REGIONAL_MASTERY_TIER': {
      if (!state.prestige.regionalMasteryTreeUnlocked) return state;
      const nodeId = action.payload;
      const node = REGIONAL_MASTERY_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      const unlocked = state.prestige.regionalMasteryUnlocked || [];
      if (unlocked.includes(nodeId)) return state;
      // Enforce the sequential order (damage -> gold -> luck) per biome, even
      // if this action were somehow dispatched out of the UI's own order.
      if (node.order > 0) {
        const prevNode = REGIONAL_MASTERY_TREE.find(n => n.biomeIndex === node.biomeIndex && n.order === node.order - 1);
        if (prevNode && !unlocked.includes(prevNode.id)) return state;
      }
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        regionalMasteryUnlocked: [...unlocked, nodeId],
      };
      return { ...state, prestige };
    }

    case 'ASCEND': {
      // Only available from the post-run Prestige screen, and only once this
      // run's deepest point clears the ladder for the next Ascension level.
      if (!state.prestigeReady) return state;
      const currentLevel = state.prestige.ascensionLevel || 0;
      const requiredDepth = ascensionRequiredDepth(currentLevel);
      if ((state.player.maxDepthReached || 1) < requiredDepth) return state;
      const newLevel = currentLevel + 1;
      const prestige = { ...state.prestige, ascensionLevel: newLevel };
      const log = [...state.log, `🌟 You Ascend! Ascension Level ${newLevel} reached — permanently mightier, forevermore.`];
      return { ...state, prestige, log: log.slice(-50) };
    }

    case 'START_NEW_RUN': {
      // Begin a new run, keeping prestige upgrades, the collection cabinet, and the character's name.
      return freshState(
        state.prestige,
        { collectibles: state.player.collectibles, collectibleNames: state.player.collectibleNames, discoveryOrder: state.player.discoveryOrder },
        state.player.name
      );
    }

    case 'SET_NARRATION':
      return { ...state, narration: action.payload.narration, narrationLoading: action.payload.loading };

    case 'SET_COLLECTIBLE_NAME': {
      const { category, index, name } = action.payload;
      const collectibleNames = {
        ...state.player.collectibleNames,
        [category]: { ...state.player.collectibleNames[category], [index]: name },
      };
      const pendingNames = (state.player.pendingNames || []).filter(p => !(p.category === category && p.index === index));
      const discoveryOrder = [{ category, index }, ...(state.player.discoveryOrder || [])].slice(0, 8);
      return { ...state, player: { ...state.player, collectibleNames, pendingNames, discoveryOrder } };
    }

    case 'SELECT_TARGET': {
      if (!isCombatRoom(state.room.type) || state.room.cleared || state.gameOver) return state;
      const idx = action.payload;
      if (!state.room.enemies[idx] || state.room.enemies[idx].hp <= 0) return state;
      return { ...state, selectedTarget: idx };
    }

    case 'ATTACK': {
      if (state.gameOver || !isCombatRoom(state.room.type) || state.room.cleared) return state;
      const enemies = state.room.enemies.map(e => ({ ...e }));
      let idx = state.selectedTarget;
      if (!enemies[idx] || enemies[idx].hp <= 0) {
        idx = enemies.findIndex(e => e.hp > 0);
        if (idx < 0) return state;
      }
      const target = enemies[idx];
      let player = { ...state.player };
      let log = [...state.log];
      const lb = luckBonus(player) * 0.5;
      const tricks = player.combatTricks || [];

      const bb = bestiaryBonusVs(player, target.baseId);
      const regionalDmgMult = 1 + ((player.regionalDmgBonus && player.regionalDmgBonus[currentBiome(target.depth)]) || 0) / 100;
      const soulwellMult = soulwellDmgMultFor(player, target);
      const soulRendProc = player.abilities.includes('soul_rend') && Math.random() < 0.2;
      let dmg = damageRoll(Math.round(totalAtk(player) * bb.atkMult * regionalDmgMult * soulwellMult), soulRendProc ? 0 : target.def);
      let crit = false;
      let megaCrit = false;
      if ((player.megaCritChance || 0) > 0 && Math.random() * 100 < player.megaCritChance) {
        dmg *= 8;
        megaCrit = true;
      } else if (player.abilities.includes('crit') && Math.random() < 0.15 + lb) { dmg *= 2; crit = true; }
      if (player.abilities.includes('momentum')) {
        const woundedFrac = 1 - (target.hp / target.maxHp);
        dmg = Math.round(dmg * (1 + woundedFrac * 0.25));
      }
      target.hp = Math.max(0, target.hp - dmg);
      log.push(`You strike the ${target.name} for ${dmg} damage.${megaCrit ? ' 💢 MEGACRIT!' : crit ? ' Critical hit!' : ''}${soulRendProc ? ' 🗡️ Soul Rend tears clean through their defenses!' : ''}`);

      if (player.abilities.includes('withering_curse') && !target.cursed && Math.random() < 0.15) {
        target.cursed = true;
        const reduction = Math.round(target.atk * 0.3);
        target.atk = Math.max(1, target.atk - reduction);
        log.push(`🩸 Withering Curse settles over the ${target.name} — their ATK falls by ${reduction} for the rest of the fight.`);
      }

      if (tricks.includes('cleave') && Math.random() < 0.03) {
        const otherIdx = enemies.findIndex((e, i) => i !== idx && e.hp > 0);
        if (otherIdx >= 0) {
          const other = enemies[otherIdx];
          const bb2 = bestiaryBonusVs(player, other.baseId);
          const cleaveDmg = damageRoll(Math.round(totalAtk(player) * bb2.atkMult), other.def);
          other.hp = Math.max(0, other.hp - cleaveDmg);
          log.push(`⚔ Cleaving Strike! Your blow also hits the ${other.name} for ${cleaveDmg}.`);
        }
      }

      if (player.abilities.includes('lifesteal') && player.hp < player.maxHp && dmg > 0) {
        const healAmt = Math.min(player.maxHp - player.hp, Math.max(1, Math.round(dmg * 0.2)));
        if (healAmt > 0) {
          player = { ...player, hp: player.hp + healAmt };
          log.push(`Vampiric Strike restores ${healAmt} HP.`);
        }
      }

      if (player.abilities.includes('echo') && Math.random() < 0.2 && target.hp > 0) {
        const echoDmg = Math.round(damageRoll(Math.round(totalAtk(player) * bb.atkMult), target.def) * 0.5);
        target.hp = Math.max(0, target.hp - echoDmg);
        log.push(`✦ Echo Strike! Your blade rings twice — ${echoDmg} bonus damage to the ${target.name}.`);
      }

      if (target.hp <= 0 && player.abilities.includes('grave_pact') && Math.random() < 0.1) {
        const healAmt = Math.min(player.maxHp - player.hp, Math.round(target.maxHp * 0.2));
        if (healAmt > 0) {
          player = { ...player, hp: player.hp + healAmt };
          log.push(`💀 Grave Pact drains the last of the ${target.name}'s life — you heal ${healAmt} HP.`);
        }
      }

      if (enemies.some(e => e.hp > 0)) {
        player = enemyTurn(player, enemies, log);
      }

      player = grantLootForDefeated(player, enemies, log);

      const allDead = enemies.every(e => e.hp <= 0);
      let newSelected = idx;
      if (enemies[newSelected].hp <= 0) {
        const alive = enemies.findIndex(e => e.hp > 0);
        newSelected = alive >= 0 ? alive : 0;
      }

      let gameOver = state.gameOver;
      let prestige = state.prestige;
      if (player.hp <= 0) {
        const sw = applySecondWind(player, log);
        player = sw.player;
        if (!sw.prevented) {
          gameOver = true;
          prestige = { ...state.prestige, lastDeathWeapon: snapshotDeathWeapon(player.weapon) };
          log.push(`Your vision fades to black. You have fallen at depth ${state.depth}...`);
        }
      }

      return {
        ...state,
        player,
        prestige,
        room: { ...state.room, enemies, cleared: allDead },
        log: log.slice(-50),
        selectedTarget: newSelected,
        gameOver,
      };
    }

    case 'USE_POTION':
    case 'USE_GREATER': {
      if (state.gameOver) return state;
      const isGreater = action.type === 'USE_GREATER';
      const count = isGreater ? state.player.greaterPotions : state.player.potions;
      if (count <= 0) return state;
      if (state.player.hp >= state.player.maxHp) return state;

      let player = { ...state.player };
      let heal = isGreater ? 60 : 25;
      if (player.keyItems.includes('phoenix_charm')) heal += 15;
      const physicianCrit = (player.physicianChance || 0) / 100;
      let critMsg = '';
      if (physicianCrit > 0 && Math.random() < physicianCrit) {
        heal *= 2;
        critMsg = ' Physician crit — double healing!';
      }
      const healed = Math.min(player.maxHp - player.hp, heal);
      player.hp += healed;

      const tricks = player.combatTricks || [];
      let refunded = false;
      if (isGreater) {
        if (tricks.includes('elixir_refund') && Math.random() < 0.03) refunded = true;
        else player.greaterPotions -= 1;
      } else {
        if (tricks.includes('potion_refund') && Math.random() < 0.03) refunded = true;
        else player.potions -= 1;
      }

      // Potions are a free action — no enemy retaliation.
      let msg = `You drink ${isGreater ? 'a Greater Elixir' : 'a Health Potion'}, recovering ${healed} HP.${critMsg} (A free action — no retaliation.)`;
      if (refunded) msg += isGreater ? ' Waste Not triggers — the elixir wasn\'t consumed!' : ' Frugal Hands triggers — the potion wasn\'t consumed!';
      const log = [...state.log, msg];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'THROW':
    case 'FIRE_HANDCANNON':
    case 'FIRE_BOW': {
      if (state.gameOver || !isCombatRoom(state.room.type) || state.room.cleared) return state;
      let player = { ...state.player };
      let ammoKey, ammoLabel, weaponName, baseAtk;
      if (action.type === 'THROW') {
        if (!player.throwable || player.throwableCount <= 0) return state;
        ammoKey = 'throwableCount'; ammoLabel = player.throwable.name; weaponName = player.throwable.name;
        baseAtk = player.throwable.atk || 4;
      } else if (action.type === 'FIRE_HANDCANNON') {
        if (!player.keyItems.includes('handcannon') || player.bullets <= 0) return state;
        ammoKey = 'bullets'; ammoLabel = 'Bullet'; weaponName = 'Handcannon';
        baseAtk = 10;
      } else {
        if (!player.keyItems.includes('bow') || player.arrows <= 0) return state;
        ammoKey = 'arrows'; ammoLabel = 'Arrow'; weaponName = 'Bow';
        baseAtk = 7;
      }

      const enemies = state.room.enemies.map(e => ({ ...e }));
      let idx = state.selectedTarget;
      if (!enemies[idx] || enemies[idx].hp <= 0) {
        idx = enemies.findIndex(e => e.hp > 0);
        if (idx < 0) return state;
      }
      const target = enemies[idx];
      let log = [...state.log];
      const bb = bestiaryBonusVs(player, target.baseId);
      const regionalDmgMult = 1 + ((player.regionalDmgBonus && player.regionalDmgBonus[currentBiome(target.depth)]) || 0) / 100;
      const soulwellMult = soulwellDmgMultFor(player, target);
      const soulwellKnifeMult = soulwellKnifeDmgMultFor(player, target.baseId);

      let throwBaseAtk = baseAtk;
      let consumed = true;
      let critMsg = '';

      if (action.type === 'THROW') {
        if (player.throwable && player.throwable.autoKill) {
          // Throatslayer — instantly kills the target
          target.hp = 0;
          player[ammoKey] -= 1;
          log.push(`Throatslayer finds the gap in their defences — the ${target.name} is slain instantly! (Free action)`);
        } else {
          const isBoss = target.rarity === 'rare' || target.rarity === 'legendary';
          throwBaseAtk = (baseAtk + (player.knifeDmgBonus || 0) + (isBoss ? (player.bossDmgBonus || 0) : 0)) * regionalDmgMult * soulwellMult * soulwellKnifeMult;
          const baseCrit = player.knifeCritChance || 0;
          const bossCrit = isBoss ? (player.bossCritBonus || 0) : 0;
          const saveRoll = Math.random() * 100 < (player.knifeSaveChance || 0);
          if (saveRoll) consumed = false;

          const pierceCritRoll = (player.knifePierceCritChance || 0) > 0 && Math.random() * 100 < player.knifePierceCritChance;
          let dmg;
          if (pierceCritRoll) {
            dmg = damageRoll(Math.round(throwBaseAtk * bb.atkMult), 0) * 6;
            critMsg = ' 💥 Piercing Megacrit! The blade tears clean through their defences!';
          } else {
            const critRoll = Math.random() * 100 < (baseCrit + bossCrit);
            dmg = damageRoll(Math.round(throwBaseAtk * bb.atkMult), target.def);
            if (critRoll) { dmg *= 2; critMsg = ' Critical throw!'; }
          }

          target.hp = Math.max(0, target.hp - dmg);
          if (consumed) player[ammoKey] -= 1;
          log.push(`You hurl a ${weaponName} for ${dmg} damage.${critMsg}${!consumed ? ' The knife bounces back — not consumed!' : ' (Free action, -1 knife)'}`.trim());

          // Slicing Giants bonus blade — free throw that doesn't consume a knife, rolls its own independent crit
          const bonusBladeChance = isBoss ? (player.bonusBladeChance || 0) : 0;
          if (bonusBladeChance > 0 && Math.random() * 100 < bonusBladeChance && target.hp > 0) {
            const bonusCritRoll = Math.random() * 100 < (baseCrit + bossCrit);
            let bonusDmg = damageRoll(Math.round(throwBaseAtk * bb.atkMult), target.def);
            if (bonusCritRoll) bonusDmg *= 2;
            target.hp = Math.max(0, target.hp - bonusDmg);
            log.push(`⚡ Slicing Giants: a second blade flies free — ${bonusDmg} damage to the ${target.name}!${bonusCritRoll ? ' Critical!' : ''}`);
          }
        }
      } else {
        const rangedBonus = action.type === 'FIRE_HANDCANNON' ? (player.handcannonDmgBonus || 0) : (player.bowDmgBonus || 0);
        const dmg = damageRoll(Math.round((baseAtk + rangedBonus) * bb.atkMult * regionalDmgMult * soulwellMult), target.def);
        target.hp = Math.max(0, target.hp - dmg);
        const ammoSaved = (player.ammoSaveChance || 0) > 0 && Math.random() * 100 < player.ammoSaveChance;
        if (!ammoSaved) player[ammoKey] -= 1;
        log.push(`You use your ${weaponName}, dealing ${dmg} damage to the ${target.name}. (A free action — no retaliation${ammoSaved ? ', ammo conserved!' : `, -1 ${ammoLabel}`})`);
      }

      player = grantLootForDefeated(player, enemies, log);
      const allDead = enemies.every(e => e.hp <= 0);
      let newSelected = idx;
      if (enemies[newSelected].hp <= 0) {
        const alive = enemies.findIndex(e => e.hp > 0);
        newSelected = alive >= 0 ? alive : 0;
      }
      return {
        ...state,
        player,
        room: { ...state.room, enemies, cleared: allDead },
        log: log.slice(-50),
        selectedTarget: newSelected,
      };
    }

    case 'FLEE': {
      if (state.gameOver || state.room.type !== 'combat' || state.room.cleared) return state;
      let player = { ...state.player };
      let log = [...state.log];
      let room = { ...state.room };
      const fleeChance = 0.6 + luckBonus(player);

      if (Math.random() < fleeChance) {
        log.push('You slip past the enemies into the dark passage beyond.');
        room.cleared = true;
        room.fled = true;
      } else {
        log.push('You stumble while trying to flee!');
        const enemies = room.enemies.map(e => ({ ...e }));
        player = enemyTurn(player, enemies, log);
        player = grantLootForDefeated(player, enemies, log);
        room.enemies = enemies;
        room.cleared = enemies.every(e => e.hp <= 0);
        if (player.hp <= 0) {
          const sw = applySecondWind(player, log);
          player = sw.player;
          if (!sw.prevented) {
            log.push(`Your vision fades to black. You have fallen at depth ${state.depth}...`);
            const prestige = { ...state.prestige, lastDeathWeapon: snapshotDeathWeapon(player.weapon) };
            return { ...state, player, prestige, room, log: log.slice(-50), gameOver: true };
          }
        }
      }
      return { ...state, player, room, log: log.slice(-50) };
    }

    case 'DESCEND': {
      if (state.gameOver) return state;
      if (isCombatRoom(state.room.type) && !state.room.cleared) return state;
      // At the end of a 10-depth biome block, offer a choice instead of auto-advancing.
      if (state.depth % 10 === 0 && !state.biomeChoicePending) {
        return { ...state, biomeChoicePending: true };
      }
      const newDepth = state.depth + 1;
      const newRoom = generateRoom(newDepth, state.player);
      const maxDepthReached = Math.max(state.player.maxDepthReached || 1, newDepth);
      const enteringNewBiome = (newDepth - 1) % 10 === 0;
      let prestige = state.prestige;
      let extraLog = [];
      if (enteringNewBiome) {
        const biomeIdx = currentBiome(newDepth);
        const prevVisits = (prestige.biomeVisits && prestige.biomeVisits[biomeIdx]) || 0;
        prestige = recordBiomeVisit(prestige, biomeIdx);
        const newVisits = prestige.biomeVisits[biomeIdx];
        if (prestige.atlasUnlocked) extraLog = atlasMilestoneLog(prevVisits, newVisits, biomeIdx);
      }
      return {
        ...state,
        player: { ...state.player, maxDepthReached },
        prestige,
        depth: newDepth,
        room: newRoom,
        selectedTarget: 0,
        biomeChoicePending: false,
        log: [...state.log, `— You descend to depth ${newDepth} —`, ...extraLog].slice(-50),
        narration: enteringNewBiome ? null : fallbackNarration(newRoom),
        narrationLoading: enteringNewBiome,
        biomeIntroId: enteringNewBiome ? state.biomeIntroId + 1 : state.biomeIntroId,
      };
    }

    case 'DESCEND_CHOICE': {
      // action.payload: 'advance' or 'loop'
      if (!state.biomeChoicePending) return state;
      if (action.payload === 'loop') {
        const loopDepth = state.depth - 9; // back to the start of this biome's 10-depth block
        const biomeIdx = currentBiome(loopDepth);
        const prevVisits = (state.prestige.biomeVisits && state.prestige.biomeVisits[biomeIdx]) || 0;
        const prestige = recordBiomeVisit(state.prestige, biomeIdx);
        const newVisits = prestige.biomeVisits[biomeIdx];
        const extraLog = prestige.atlasUnlocked ? atlasMilestoneLog(prevVisits, newVisits, biomeIdx) : [];
        const newRoom = generateRoom(loopDepth, state.player);
        const log = [...state.log, `— You circle back to relive ${BIOMES[biomeIdx].name} from its start —`, ...extraLog].slice(-50);
        return {
          ...state,
          prestige,
          depth: loopDepth,
          room: newRoom,
          selectedTarget: 0,
          biomeChoicePending: false,
          log,
          narration: fallbackNarration(newRoom),
          narrationLoading: false,
        };
      }
      // advance
      const newDepth = state.depth + 1;
      const biomeIdx = currentBiome(newDepth);
      const prevVisits = (state.prestige.biomeVisits && state.prestige.biomeVisits[biomeIdx]) || 0;
      const prestige = recordBiomeVisit(state.prestige, biomeIdx);
      const newVisits = prestige.biomeVisits[biomeIdx];
      const extraLog = prestige.atlasUnlocked ? atlasMilestoneLog(prevVisits, newVisits, biomeIdx) : [];
      const newRoom = generateRoom(newDepth, state.player);
      const maxDepthReached = Math.max(state.player.maxDepthReached || 1, newDepth);
      return {
        ...state,
        player: { ...state.player, maxDepthReached },
        prestige,
        depth: newDepth,
        room: newRoom,
        selectedTarget: 0,
        biomeChoicePending: false,
        log: [...state.log, `— You descend to depth ${newDepth} —`, ...extraLog].slice(-50),
        narration: null,
        narrationLoading: true,
        biomeIntroId: state.biomeIntroId + 1,
      };
    }

    case 'OPEN_TREASURE': {
      if (state.room.type !== 'treasure' || state.room.opened) return state;
      let player = { ...state.player };
      const loot = state.room.loot;
      player.gold += loot.gold;
      player.potions += loot.potions;
      player.greaterPotions += loot.greaterPotions;
      loot.items.forEach(it => {
        if (it.type === 'weapon') player.weaponsBag = [...player.weaponsBag, it];
        else if (it.type === 'armor') player.armorsBag = [...player.armorsBag, it];
        else if (it.type === 'ring' || it.type === 'earring') player.accessoriesBag = [...player.accessoriesBag, it];
        else if (it.type === 'skillbook') player.skillbooksBag = [...player.skillbooksBag, it];
      });
      let msg = `You open the chest: +${loot.gold}g`;
      if (loot.items.length) msg += `, found ${loot.items.map(i => i.name).join(', ')}`;
      if (loot.potions) msg += `, +${loot.potions} potion`;
      if (loot.greaterPotions) msg += `, +${loot.greaterPotions} elixir`;
      const chestLog = [msg];
      const madgod = player.madgodChance || 0;
      if (madgod > 0 && Math.random() * 100 < madgod) {
        const throatslayer = THROWABLES.find(t => t.id === 'throatslayer');
        player.throwablesBag = [...(player.throwablesBag || []), { ...throatslayer, uid: uid('throatslayer'), count: 1 }];
        chestLog.push('✨ The Madgod grins — Throatslayer glints from inside the chest!');
      }
      const log = [...state.log, ...chestLog];
      return { ...state, player, room: { ...state.room, opened: true, cleared: true }, log: log.slice(-50) };
    }

    case 'SPIN_WHEEL': {
      if (state.room.type !== 'wheel' || state.room.spun) return state;
      const reward = state.room.reward;
      let player = { ...state.player };
      let msg = '';
      if (reward.type === 'gold') {
        const amount = Math.round(reward.amount * (1 + (player.wealthLootBonus || 0)));
        player.gold += amount;
        msg = `The wheel stops on Gold — you win ${amount}g!`;
      } else if (reward.type === 'book') {
        player.skillbooksBag = [...player.skillbooksBag, reward.item];
        msg = `The wheel stops on a Tome — you win ${reward.item.name}!`;
      } else if (reward.type === 'weapon') {
        player.weaponsBag = [...player.weaponsBag, reward.item];
        msg = `The wheel stops on a Weapon — you win ${reward.item.name}!`;
      } else if (reward.type === 'armor') {
        player.armorsBag = [...player.armorsBag, reward.item];
        msg = `The wheel stops on Armor — you win ${reward.item.name}!`;
      }
      const log = [...state.log, `🎡 ${msg}`];
      return { ...state, player, room: { ...state.room, spun: true, cleared: true }, log: log.slice(-50) };
    }

    case 'BUY_RELIC': {
      if (state.room.type !== 'relic' || state.room.bought) return state;
      const relicId = action.payload;
      const relic = (state.room.offers || []).find(r => r.id === relicId);
      if (!relic) return state;
      let player = { ...state.player };
      if (player.gold < relic.price) return state;
      player.gold -= relic.price;
      if (relic.id === 'heart_mountain') { player.maxHp += 20; player.hp += 20; }
      else if (relic.id === 'berserker_tooth') { player.atk += 3; }
      else if (relic.id === 'guardian_ward') { player.def += 3; }
      else if (relic.id === 'ember_heart') { player.maxHp += 30; player.hp += 30; player.atk += 2; }
      player.keyItems = [...player.keyItems, relic.id];
      const log = [...state.log, `🗝️ You purchase ${relic.name} for ${relic.price}g. ${relic.desc}`];
      return { ...state, player, room: { ...state.room, bought: true, cleared: true }, log: log.slice(-50) };
    }

    case 'USE_TUNNEL': {
      if (state.room.type !== 'tunnel' || state.room.used) return state;
      const tunnelCost = effectiveTunnelCost(state.player);
      if (state.prestige.souls < tunnelCost) return state;
      const newDepth = state.depth + 20;
      const oldBiome = currentBiome(state.depth);
      const newBiome = currentBiome(newDepth);
      let prestige = { ...state.prestige, souls: state.prestige.souls - tunnelCost };
      let extraLog = [];
      if (newBiome !== oldBiome) {
        const prevVisits = (prestige.biomeVisits && prestige.biomeVisits[newBiome]) || 0;
        prestige = recordBiomeVisit(prestige, newBiome);
        const newVisits = prestige.biomeVisits[newBiome];
        if (prestige.atlasUnlocked) extraLog = atlasMilestoneLog(prevVisits, newVisits, newBiome);
      }
      const newRoom = generateRoom(newDepth, state.player);
      const maxDepthReached = Math.max(state.player.maxDepthReached || 1, newDepth);
      const log = [...state.log, `🕳️ You slip through the secret tunnel, skipping ahead to depth ${newDepth} — ${BIOMES[newBiome].name}.`, ...extraLog];
      return {
        ...state,
        player: { ...state.player, maxDepthReached },
        prestige,
        depth: newDepth,
        room: newRoom,
        selectedTarget: 0,
        biomeChoicePending: false,
        log: log.slice(-50),
        narration: fallbackNarration(newRoom),
        narrationLoading: false,
        biomeIntroId: state.biomeIntroId + 1,
      };
    }

    case 'USE_ELIXIR_OF_LIFE': {
      if (state.gameOver) return state;
      if ((state.player.elixirsOfLife || 0) <= 0) return state;
      if (state.player.hp >= state.player.maxHp) return state;
      const healed = state.player.maxHp - state.player.hp;
      const player = { ...state.player, hp: state.player.maxHp, elixirsOfLife: state.player.elixirsOfLife - 1 };
      const log = [...state.log, `You drink the Elixir of Life — restored to full HP (+${healed}). (Free action)`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'USE_MAP': {
      if (state.gameOver) return state;
      if (state.player.maps <= 0) return state;
      if (isCombatRoom(state.room.type) && !state.room.cleared) return state;
      const template = pickRandom(LEGENDARY_ENEMIES);
      const enemy = scaleLegendary(template, state.depth);
      const player = { ...state.player, maps: state.player.maps - 1 };
      const log = [...state.log, `🗺️ You unfurl the map. Reality tears open — ${enemy.name} emerges from the rift!`];
      return {
        ...state,
        player,
        room: { type: 'legendary', enemies: [enemy], cleared: false },
        log: log.slice(-50),
        narration: fallbackNarration({ type: 'legendary' }),
        narrationLoading: false,
        selectedTarget: 0,
      };
    }

    case 'BUY': {
      const item = action.payload;
      let player = { ...state.player };
      if (player.gold < item.price) return state;
      player.gold -= item.price;
      let log = [...state.log, `You bought ${item.name} for ${item.price}g.`];
      if (item.type === 'potion') player.potions += 1;
      else if (item.type === 'greaterPotion') player.greaterPotions += 1;
      else if (item.type === 'weapon') player.weaponsBag = [...player.weaponsBag, makeItemInstance(item)];
      else if (item.type === 'armor') player.armorsBag = [...player.armorsBag, makeItemInstance(item)];
      else if (item.type === 'chestpiece') player.chestpiecesBag = [...(player.chestpiecesBag || []), makeItemInstance(item)];
      else if (item.type === 'greaves') player.greavesBag = [...(player.greavesBag || []), makeItemInstance(item)];
      else if (item.type === 'footwear') player.footwearBag = [...(player.footwearBag || []), makeItemInstance(item)];
      else if (item.type === 'headgear') player.headgearBag = [...(player.headgearBag || []), makeItemInstance(item)];
      else if (item.type === 'trinket') player.trinketsBag = [...(player.trinketsBag || []), makeItemInstance(item)];
      else if (item.type === 'necklace') player.necklacesBag = [...(player.necklacesBag || []), makeItemInstance(item)];
      else if (item.type === 'ring' || item.type === 'earring') player.accessoriesBag = [...player.accessoriesBag, makeItemInstance(item)];
      else if (item.type === 'skillbook') player.skillbooksBag = [...player.skillbooksBag, makeItemInstance(item)];
      else if (item.type === 'throwableStock') player.throwablesBag = [...(player.throwablesBag || []), { id: item.id, name: 'Throwing Knives', type: 'throwable', rarity: 'common', atk: item.atk, uid: uid('knives'), count: item.count }];
      else if (item.type === 'ammoStock') player[item.ammoKey] = (player[item.ammoKey] || 0) + item.count;
      const room = { ...state.room, stock: state.room.stock.filter(s => s.uid !== item.uid) };
      return { ...state, player, room, log: log.slice(-50) };
    }

    case 'SELL': {
      const { bag, idx } = action.payload;
      const bagKeyMap = {
        weapon: 'weaponsBag', armor: 'armorsBag', accessory: 'accessoriesBag', skillbook: 'skillbooksBag',
        chestpiece: 'chestpiecesBag', greaves: 'greavesBag', footwear: 'footwearBag', headgear: 'headgearBag', trinket: 'trinketsBag', necklace: 'necklacesBag',
      };
      const bagKey = bagKeyMap[bag];
      if (!bagKey) return state;
      const list = state.player[bagKey] || [];
      const item = list[idx];
      if (!item) return state;
      let price;
      if (bag === 'skillbook') price = item.rarity === 'rare' ? 40 : 8;
      else price = item.rarity === 'mythic' ? 400 : item.rarity === 'legendary' ? 250 : item.rarity === 'epic' ? 110 : item.rarity === 'rare' ? 50 : 12;
      price = Math.round(price * (1 + (state.player.wealthSellBonus || 0)));
      const player = { ...state.player, gold: state.player.gold + price, [bagKey]: list.filter((_, i) => i !== idx) };
      const log = [...state.log, `You sold ${item.name} for ${price}g.`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'EQUIP': {
      const { bag, idx, slot } = action.payload;
      let player = { ...state.player };
      let itemName = '';
      let slotLabel = '';
      if (bag === 'weapon') {
        const list = player.weaponsBag; const item = list[idx]; if (!item) return state;
        itemName = item.name;
        const slotKey = (slot === 'weapon2' && player.weapon2) ? 'weapon2' : 'weapon';
        const old = player[slotKey];
        player[slotKey] = item;
        const rest = list.filter((_, i) => i !== idx);
        const emptyId = slotKey === 'weapon2' ? 'no_weapon2' : 'fists';
        player.weaponsBag = old.id !== emptyId ? [...rest, old] : rest;
        slotLabel = slotKey === 'weapon2' ? ' (Weapon II)' : '';
      } else if (bag === 'armor') {
        const list = player.armorsBag; const item = list[idx]; if (!item) return state;
        itemName = item.name;
        const old = player.armor;
        player.armor = item;
        const rest = list.filter((_, i) => i !== idx);
        player.armorsBag = old.id !== 'rags' ? [...rest, old] : rest;
      } else if (bag === 'chestpiece' || bag === 'greaves' || bag === 'footwear' || bag === 'headgear' || bag === 'trinket' || bag === 'necklace') {
        const bagKeyMap = { chestpiece: 'chestpiecesBag', greaves: 'greavesBag', footwear: 'footwearBag', headgear: 'headgearBag', trinket: 'trinketsBag', necklace: 'necklacesBag' };
        const emptyIdMap = { chestpiece: 'no_chest', greaves: 'no_greaves', footwear: 'no_footwear', headgear: 'no_headgear', trinket: 'no_trinket', necklace: 'no_necklace' };
        const bagKey = bagKeyMap[bag];
        const list = player[bagKey] || []; const item = list[idx]; if (!item) return state;
        if (!player[bag]) return state; // slot not unlocked
        itemName = item.name;
        const old = player[bag];
        player[bag] = item;
        const rest = list.filter((_, i) => i !== idx);
        player[bagKey] = old.id !== emptyIdMap[bag] ? [...rest, old] : rest;
      } else if (bag === 'accessory') {
        const list = player.accessoriesBag; const item = list[idx]; if (!item) return state;
        itemName = item.name;
        let slotKey;
        if (item.type === 'earring') {
          slotKey = (slot === 'earring2' && player.earring2) ? 'earring2' : 'earring';
        } else {
          slotKey = (slot === 'ring3' && player.ring3) ? 'ring3' : (slot === 'ring2' ? 'ring2' : 'ring1');
        }
        if (!player[slotKey]) return state; // slot not unlocked
        const labelMap = { ring1: ' (Ring I)', ring2: ' (Ring II)', ring3: ' (Ring III)', earring: ' (Earring I)', earring2: ' (Earring II)' };
        slotLabel = labelMap[slotKey] || '';
        const emptyIds = { ring1: 'no_ring1', ring2: 'no_ring2', ring3: 'no_ring3', earring: 'no_earring', earring2: 'no_earring2' };
        const old = player[slotKey];
        player[slotKey] = item;
        const rest = list.filter((_, i) => i !== idx);
        player.accessoriesBag = old.id !== emptyIds[slotKey] ? [...rest, old] : rest;
      } else {
        return state;
      }
      const log = [...state.log, `You equip the ${itemName}${slotLabel}.`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'EQUIP_THROWABLE': {
      const idx = action.payload;
      const list = state.player.throwablesBag || [];
      const stack = list[idx];
      if (!stack) return state;
      let player = { ...state.player };
      if (player.throwable && player.throwable.id === stack.id) {
        // Same type already active: just merge the counts.
        player.throwableCount = (player.throwableCount || 0) + stack.count;
      } else {
        // Swapping to a different throwable type: bank the old stack back into the bag.
        const rest = list.filter((_, i) => i !== idx);
        const newBag = player.throwable && player.throwableCount > 0
          ? [...rest, { ...player.throwable, uid: uid(player.throwable.id), count: player.throwableCount }]
          : rest;
        player.throwablesBag = newBag;
        player.throwable = { id: stack.id, name: stack.name, type: 'throwable', rarity: stack.rarity, atk: stack.atk };
        player.throwableCount = stack.count;
        const log = [...state.log, `You ready your ${stack.name}.`];
        return { ...state, player, log: log.slice(-50) };
      }
      player.throwablesBag = list.filter((_, i) => i !== idx);
      const log = [...state.log, `You add ${stack.count} ${stack.name} to your active stack (${player.throwableCount} total).`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'SELL_THROWABLE': {
      const idx = action.payload;
      const list = state.player.throwablesBag || [];
      const stack = list[idx];
      if (!stack) return state;
      const price = stack.count * 2;
      const player = { ...state.player, gold: state.player.gold + price, throwablesBag: list.filter((_, i) => i !== idx) };
      const log = [...state.log, `You sold ${stack.count} ${stack.name} for ${price}g.`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'READ_BOOK': {
      const idx = action.payload;
      const book = state.player.skillbooksBag[idx];
      if (!book) return state;
      let player = { ...state.player, skillbooksBag: state.player.skillbooksBag.filter((_, i) => i !== idx) };
      let log = [...state.log];
      const wellReadDoubled = (player.wellReadChance || 0) > 0 && Math.random() * 100 < player.wellReadChance;
      const bookSmartsMult = player.bookEffectMult || 1;
      const times = bookSmartsMult * (wellReadDoubled ? 2 : 1);
      const flavourParts = [];
      if (bookSmartsMult > 1) flavourParts.push('📚 Book Smarts doubles the lesson');
      if (wellReadDoubled) flavourParts.push('📖 Well-Read! It sinks in again');
      const flavour = flavourParts.length ? ` ${flavourParts.join(' and ')}.` : '';
      if (book.rarity === 'common') {
        const eff = book.effect || {};
        for (let t = 0; t < times; t++) {
          if (eff.hp) { player.maxHp += eff.hp; player.hp = Math.min(player.maxHp, player.hp + eff.hp); }
          player.atk += eff.atk || 0;
          player.def += eff.def || 0;
        }
        log.push(`You study the ${book.name}. ${describeEffect(eff)}${flavour}`);
      } else {
        if (player.abilities.includes(book.ability)) {
          const refund = 25 * times;
          player.gold += refund;
          log.push(`You already know this technique. The ${book.name} crumbles to dust, leaving ${refund} gold behind.${flavour}`);
        } else {
          player.abilities = [...player.abilities, book.ability];
          log.push(`✦ You master the ${book.name}! New ability: ${ABILITY_INFO[book.ability].name}.${flavourParts.length ? ' (The lesson echoes, though the ability need only be learned once.)' : ''}`);
        }
      }
      const ancestralChance = player.ancestralMemoryChance || 0;
      if (ancestralChance > 0 && Math.random() * 100 < ancestralChance) {
        const roll = Math.random();
        let statMsg;
        if (roll < 1 / 3) { player.atk += 1; statMsg = '+1 permanent ATK'; }
        else if (roll < 2 / 3) { player.def += 1; statMsg = '+1 permanent DEF'; }
        else { player.maxHp += 8; player.hp = Math.min(player.maxHp, player.hp + 8); statMsg = '+8 permanent max HP'; }
        log.push(`🧬 Ancestral Memory stirs — the reading echoes further: ${statMsg}!`);
      }
      return { ...state, player, log: log.slice(-50) };
    }

    case 'REST': {
      let player = { ...state.player };
      const missing = player.maxHp - player.hp;
      if (missing <= 0) return state;
      const cost = Math.max(1, Math.ceil((missing / 2) * (player.restCostMult || 1)));
      if (player.gold < cost) return state;
      player.gold -= cost;
      player.hp = player.maxHp;
      const log = [...state.log, `The healer mends your wounds for ${cost}g. Full HP restored.`];
      return { ...state, player, log: log.slice(-50) };
    }

    case 'TRADE': {
      if (state.room.type !== 'collector') return state;
      const offer = state.room.offers.find(o => o.id === action.payload);
      if (!offer) return state;
      let player = { ...state.player };
      for (const c of offer.cost) {
        if (!player.collectibles[c.category].includes(c.index)) return state;
      }
      const costNames = offer.cost.map(c => getCollectibleName(player, c.category, c.index)).join(', ');
      const collectibles = { ...player.collectibles };
      offer.cost.forEach(c => {
        collectibles[c.category] = collectibles[c.category].filter(i => i !== c.index);
      });
      player.collectibles = collectibles;
      let log = [...state.log];
      if (offer.reward.type === 'gold') {
        player.gold += offer.reward.amount;
        log.push(`You trade away ${costNames} for ${offer.reward.amount}g.`);
      } else if (offer.reward.type === 'potion') {
        player.potions += offer.reward.amount;
        log.push(`You trade away ${costNames} for ${offer.reward.amount} Health Potion(s).`);
      } else if (offer.reward.type === 'greaterPotion') {
        player.greaterPotions += offer.reward.amount;
        log.push(`You trade away ${costNames} for a Greater Elixir.`);
      } else if (offer.reward.type === 'item') {
        const it = offer.reward.item;
        if (it.type === 'weapon') player.weaponsBag = [...player.weaponsBag, it];
        else if (it.type === 'armor') player.armorsBag = [...player.armorsBag, it];
        else player.accessoriesBag = [...player.accessoriesBag, it];
        log.push(`You trade away ${costNames} for ${it.name}.`);
      }
      const room = { ...state.room, offers: state.room.offers.filter(o => o.id !== offer.id) };
      return { ...state, player, room, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS_TREE': {
      // First coin trade-in: unlocks Vigor/Might/Fortune V-X in the skill tree.
      if (state.prestige.coinsTradedIn) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coinsTradedIn: true };
      const log = [...state.log, '🪙 You trade away your entire coin collection — the advanced skill tiers (V-X) are now available for Vigor, Might, and Fortune.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS2_TREE': {
      // Second coin trade-in: unlocks the Coins 2 throwing knife prestige tree.
      if (!state.prestige.coinsTradedIn) return state;
      if (state.prestige.coins2TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins2TreeUnlocked: true };
      const log = [...state.log, '🪙 You trade away your second coin collection — the Blade Mastery prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS2_TIER': {
      if (!state.prestige.coins2TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = COINS2_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.coins2Unlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        coins2Unlocked: [...(state.prestige.coins2Unlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_COINS3_TREE': {
      if (!state.prestige.coins2TreeUnlocked) return state;
      if (state.prestige.coins3TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins3TreeUnlocked: true };
      const log = [...state.log, '🪙 You trade away your third coin collection — the Slicing Giants prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS3_TIER': {
      if (!state.prestige.coins3TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = SLICING_GIANTS_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.coins3Unlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        coins3Unlocked: [...(state.prestige.coins3Unlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_COINS4_TREE': {
      if (!state.prestige.coins3TreeUnlocked) return state;
      if (state.prestige.coins4TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, coins4TreeUnlocked: true, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins4TreeUnlocked: true };
      const log = [...state.log, '📚 You trade away your fourth coin collection — the Grand Library may now appear in the dungeon.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS5_TREE': {
      if (!state.prestige.coins4TreeUnlocked) return state;
      if (state.prestige.coins5TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, coins5TreeUnlocked: true, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins5TreeUnlocked: true };
      const log = [...state.log, '💰 You trade away your fifth coin collection — the Wealth prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_WEALTH_TIER': {
      if (!state.prestige.coins5TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = WEALTH_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.wealthUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        wealthUnlocked: [...(state.prestige.wealthUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_COINS6_TREE': {
      if (!state.prestige.coins5TreeUnlocked) return state;
      if (state.prestige.coins6TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, coins6TreeUnlocked: true, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins6TreeUnlocked: true };
      const log = [...state.log, '🕳️ You trade away your sixth coin collection — Secret Tunnels may now appear in the dungeon.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_COINS7_TREE': {
      if (!state.prestige.coins6TreeUnlocked) return state;
      if (state.prestige.coins7TreeUnlocked) return state;
      const owned = state.player.collectibles.coins || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, coins7TreeUnlocked: true, collectibles: { ...state.player.collectibles, coins: [] } };
      const prestige = { ...state.prestige, coins7TreeUnlocked: true };
      const log = [...state.log, '🧬 You trade away your seventh coin collection — the Ancestral Memory prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_ANCESTRAL_MEMORY_TIER': {
      if (!state.prestige.coins7TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = ANCESTRAL_MEMORY_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.ancestralMemoryUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        ancestralMemoryUnlocked: [...(state.prestige.ancestralMemoryUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_FIGURES2_TREE': {
      if (!state.prestige.betterMerchantTreeUnlocked) return state;
      if (state.prestige.figures2TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures2TreeUnlocked: true };
      const log = [...state.log, '🤖 You trade away your second figure collection — Luck of the Madgod prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_MADGOD_TIER': {
      if (!state.prestige.figures2TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = MADGOD_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.figures2Unlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        figures2Unlocked: [...(state.prestige.figures2Unlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_FIGURES3_TREE': {
      if (!state.prestige.figures2TreeUnlocked) return state;
      if (state.prestige.figures3TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures3TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures3TreeUnlocked: true };
      const log = [...state.log, '🎡 You trade away your third figure collection — Wheel of Fortune rooms may now appear in the dungeon.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_FIGURES4_TREE': {
      if (!state.prestige.figures3TreeUnlocked) return state;
      if (state.prestige.figures4TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures4TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures4TreeUnlocked: true };
      const log = [...state.log, '💎 You trade away your fourth figure collection — the Deluxe Merchant may now (rarely) appear.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_FIGURES5_TREE': {
      if (!state.prestige.figures4TreeUnlocked) return state;
      if (state.prestige.figures5TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures5TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures5TreeUnlocked: true };
      const log = [...state.log, '⚔️ You trade away your fifth figure collection — the Heavily Armed prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_HEAVILY_ARMED_TIER': {
      if (!state.prestige.figures5TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = HEAVILY_ARMED_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.heavilyArmedUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        heavilyArmedUnlocked: [...(state.prestige.heavilyArmedUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_FIGURES6_TREE': {
      if (!state.prestige.figures5TreeUnlocked) return state;
      if (state.prestige.figures6TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures6TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures6TreeUnlocked: true };
      const log = [...state.log, '📖 You trade away your sixth figure collection — the Well-Read prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_WELL_READ_TIER': {
      if (!state.prestige.figures6TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = WELL_READ_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.wellReadUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        wellReadUnlocked: [...(state.prestige.wellReadUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_FIGURES7_TREE': {
      if (!state.prestige.figures6TreeUnlocked) return state;
      if (state.prestige.figures7TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures7TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures7TreeUnlocked: true };
      const log = [...state.log, '📚 You trade away your seventh figure collection — the Book Smarts prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_BOOK_SMARTS_TIER': {
      if (!state.prestige.figures7TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = BOOK_SMARTS_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.bookSmartsUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        bookSmartsUnlocked: [...(state.prestige.bookSmartsUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_FIGURES8_TREE': {
      if (!state.prestige.figures7TreeUnlocked) return state;
      if (state.prestige.figures8TreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, figures8TreeUnlocked: true, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, figures8TreeUnlocked: true };
      const log = [...state.log, '✨ You trade away your eighth figure collection — the Factory Sealed prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_FACTORY_SEALED_TIER': {
      if (!state.prestige.figures8TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = FIGURES8_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.factorySealedUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        factorySealedUnlocked: [...(state.prestige.factorySealedUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_STAMPS2_TREE': {
      if (!state.prestige.readyOrNotTreeUnlocked) return state;
      if (state.prestige.stamps2TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps2TreeUnlocked: true };
      const log = [...state.log, '📮 You trade away your second stamp collection — Physician Heal Thyself prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_PHYSICIAN_TIER': {
      if (!state.prestige.stamps2TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = PHYSICIAN_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.stamps2Unlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        stamps2Unlocked: [...(state.prestige.stamps2Unlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_STAMPS3_TREE': {
      if (!state.prestige.stamps2TreeUnlocked) return state;
      if (state.prestige.stamps3TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, stamps3TreeUnlocked: true, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps3TreeUnlocked: true };
      const log = [...state.log, '🗝️ You trade away your third stamp collection — the Relic Room may now appear in the dungeon.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_STAMPS4_TREE': {
      if (!state.prestige.stamps3TreeUnlocked) return state;
      if (state.prestige.stamps4TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, stamps4TreeUnlocked: true, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps4TreeUnlocked: true };
      const log = [...state.log, '❤️ You trade away your fourth stamp collection — the Health prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_HEALTH_TIER': {
      if (!state.prestige.stamps4TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = HEALTH_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.healthUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        healthUnlocked: [...(state.prestige.healthUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_STAMPS5_TREE': {
      if (!state.prestige.stamps4TreeUnlocked) return state;
      if (state.prestige.stamps5TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, stamps5TreeUnlocked: true, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps5TreeUnlocked: true };
      const log = [...state.log, '📮 You trade away your fifth stamp collection — Skill tiers XI-XV unlock.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_STAMPS6_TREE': {
      if (!state.prestige.stamps5TreeUnlocked) return state;
      if (state.prestige.stamps6TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, stamps6TreeUnlocked: true, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps6TreeUnlocked: true };
      const log = [...state.log, '🎖️ You trade away your sixth stamp collection — the Grizzled Veteran prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_STAMPS6_TIER': {
      if (!state.prestige.stamps6TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = STAMPS6_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.stamps6Unlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        stamps6Unlocked: [...(state.prestige.stamps6Unlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_STAMPS7_TREE': {
      if (!state.prestige.stamps6TreeUnlocked) return state;
      if (state.prestige.stamps7TreeUnlocked) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, stamps7TreeUnlocked: true, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, stamps7TreeUnlocked: true };
      const log = [...state.log, '⚔️ You trade away your seventh stamp collection — the Back with a Vengeance prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_STAMPS7_TIER': {
      if (!state.prestige.stamps7TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = STAMPS7_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.backWithAVengeanceUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        backWithAVengeanceUnlocked: [...(state.prestige.backWithAVengeanceUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_BESTIARY': {
      if (state.player.bestiaryUnlocked) return state;
      const owned = state.player.collectibles.cards || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, bestiaryUnlocked: true, collectibles: { ...state.player.collectibles, cards: [] } };
      const prestige = { ...state.prestige, bestiaryUnlocked: true };
      const log = [...state.log, '📖 You trade away your entire card collection — the Bestiary unlocks, permanently tracking every kill and granting combat bonuses against well-studied foes.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_CARDS2': {
      if (!state.player.bestiaryUnlocked) return state;
      if (state.prestige.cards2Unlocked) return state;
      const owned = state.player.collectibles.cards || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, cards2Unlocked: true, collectibles: { ...state.player.collectibles, cards: [] } };
      const prestige = { ...state.prestige, cards2Unlocked: true };
      const log = [...state.log, '📖 You trade away your second card collection — Bestiary tiers 4, 5, and 6 unlock (100/150/200 kills).'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_CARDS3': {
      if (!state.prestige.cards2Unlocked) return state;
      if (state.prestige.cards3Unlocked) return state;
      const owned = state.player.collectibles.cards || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, cards3Unlocked: true, collectibles: { ...state.player.collectibles, cards: [] } };
      const prestige = { ...state.prestige, cards3Unlocked: true };
      const log = [...state.log, '📖 You trade away your third card collection — Bestiary tiers 7, 8, and 9 unlock (300/400/500 kills).'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_CARDS4_TREE': {
      if (!state.prestige.cards3Unlocked) return state;
      if (state.prestige.cards4TreeUnlocked) return state;
      const owned = state.player.collectibles.cards || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, cards4TreeUnlocked: true, collectibles: { ...state.player.collectibles, cards: [] } };
      const prestige = { ...state.prestige, cards4TreeUnlocked: true };
      const log = [...state.log, '🎯 You trade away your fourth card collection — the Ranged Mastery prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_RANGED_MASTERY_TIER': {
      if (!state.prestige.cards4TreeUnlocked) return state;
      const nodeId = action.payload;
      const node = RANGED_MASTERY_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      if ((state.prestige.rangedMasteryUnlocked || []).includes(nodeId)) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        rangedMasteryUnlocked: [...(state.prestige.rangedMasteryUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_CARDS5': {
      if (!state.prestige.cards4TreeUnlocked) return state;
      if (state.prestige.cards5Unlocked) return state;
      const owned = state.player.collectibles.cards || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, cards5Unlocked: true, collectibles: { ...state.player.collectibles, cards: [] } };
      const prestige = { ...state.prestige, cards5Unlocked: true };
      const log = [...state.log, '📖 You trade away your fifth card collection — Bestiary tiers 10, 11, and 12 unlock (700/900/1200 kills).'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_READY_OR_NOT_TREE': {
      if ((state.prestige.readyOrNotTreeUnlocked)) return state;
      const owned = state.player.collectibles.stamps || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, stamps: [] } };
      const prestige = { ...state.prestige, readyOrNotTreeUnlocked: true };
      const log = [...state.log, '📮 You trade away your entire stamp collection — the "Ready or Not" prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_READY_OR_NOT_TIER': {
      if (!state.prestige.readyOrNotTreeUnlocked) return state;
      const nodeId = action.payload;
      const node = READY_OR_NOT_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      const already = (state.prestige.readyOrNotUnlocked || []).includes(nodeId);
      if (already) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        readyOrNotUnlocked: [...(state.prestige.readyOrNotUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_COMBAT_TRICK': {
      const trickId = action.payload;
      const trick = COMBAT_TRICKS.find(t => t.id === trickId);
      if (!trick) return state;
      if ((state.prestige.combatTricks || []).includes(trickId)) return state;
      if (state.prestige.souls < trick.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - trick.cost,
        combatTricks: [...(state.prestige.combatTricks || []), trickId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_BETTER_MERCHANT_TREE': {
      if (state.prestige.betterMerchantTreeUnlocked) return state;
      const owned = state.player.collectibles.figures || [];
      if (owned.length < 50) return state;
      const player = { ...state.player, collectibles: { ...state.player.collectibles, figures: [] } };
      const prestige = { ...state.prestige, betterMerchantTreeUnlocked: true };
      const log = [...state.log, '🤖 You trade away your entire figure collection — the "Better Merchant" prestige tree unlocks.'];
      return { ...state, player, prestige, log: log.slice(-50) };
    }

    case 'UNLOCK_BETTER_MERCHANT_TIER': {
      if (!state.prestige.betterMerchantTreeUnlocked) return state;
      const nodeId = action.payload;
      const node = BETTER_MERCHANT_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      const already = (state.prestige.betterMerchantUnlocked || []).includes(nodeId);
      if (already) return state;
      if (state.prestige.souls < node.cost) return state;
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls - node.cost,
        betterMerchantUnlocked: [...(state.prestige.betterMerchantUnlocked || []), nodeId],
      };
      return { ...state, prestige };
    }

    case 'UNLOCK_SKILL': {
      const nodeId = action.payload;
      const node = SKILL_TREE.find(n => n.id === nodeId);
      if (!node) return state;
      let player = { ...state.player };
      const unlocked = player.skillsUnlocked || [];
      if (unlocked.includes(nodeId)) return state;
      if (node.requires && !unlocked.includes(node.requires)) return state;
      if ((player.maxDepthReached || 1) < node.reqDepth) return state;
      if (node.requiresCoinsTradedIn && !state.prestige.coinsTradedIn) return state;
      if (node.requiresStamps5TradedIn && !state.prestige.stamps5TreeUnlocked) return state;
      const totalPoints = Math.floor((player.maxDepthReached || 1) / 5);
      if (unlocked.length >= totalPoints) return state;

      const eff = node.effect;
      if (eff.maxHp) { player.maxHp += eff.maxHp; player.hp += eff.maxHp; }
      if (eff.atk) player.atk += eff.atk;
      if (eff.def) player.def += eff.def;
      if (eff.luck) player.bonusLuck = (player.bonusLuck || 0) + eff.luck;
      player.skillsUnlocked = [...unlocked, nodeId];
      const log = [...state.log, `✦ Skill learned: ${node.name} — ${node.desc}`];
      return { ...state, player, log: log.slice(-50) };
    }

    default:
      return state;
  }
}

/* =========================================================
   SMALL UI PIECES
========================================================= */

function StatBar({ icon, label, value, max, fillClass, critical }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="dc-amber shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="flex justify-between text-[11px] mb-0.5">
          <span className="dc-display tracking-wide" style={{ color: '#9a9788' }}>{label}</span>
          <span className="dc-mono" style={{ color: '#e7e2d0' }}>{value}/{max}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#11121a' }}>
          <div
            className={`h-full hp-fill ${critical ? 'hp-critical' : ''} ${fillClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function glowClass(rarity) {
  if (rarity === 'mythic') return 'mythic-glow';
  if (rarity === 'legendary') return 'legendary-glow';
  if (rarity === 'epic') return 'epic-glow';
  if (rarity === 'rare') return 'rare-glow';
  return '';
}

function RarityTag({ rarity }) {
  const cls = rarity === 'mythic' ? 'dc-mythic' : rarity === 'legendary' ? 'dc-legendary' : rarity === 'epic' ? 'dc-epic' : rarity === 'rare' ? 'dc-rare' : 'dc-common';
  return (
    <span className={`text-[10px] uppercase tracking-widest font-bold ${cls}`}>
      {rarity}
    </span>
  );
}

function ItemRow({ item, actions }) {
  const Icon = item.type === 'weapon' ? Sword
    : item.type === 'armor' ? Shield
    : (item.type === 'ring' || item.type === 'earring' || item.type === 'necklace') ? Gem
    : item.type === 'trinket' ? Sparkles
    : item.type === 'skillbook' ? BookOpen
    : FlaskConical;
  const colorCls = item.rarity === 'mythic' ? 'dc-mythic' : item.rarity === 'legendary' ? 'dc-legendary' : item.rarity === 'epic' ? 'dc-epic' : item.rarity === 'rare' ? 'dc-rare' : 'dc-common';
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${glowClass(item.rarity)} ${item.factorySealed ? 'factory-sealed-gloss' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={14} className={item.factorySealed ? '' : colorCls} style={item.factorySealed ? { color: '#fff' } : undefined} />
        <div className="min-w-0">
          <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{item.name}</div>
          <div className="flex gap-2 items-center flex-wrap">
            <RarityTag rarity={item.rarity} />
            {item.factorySealed && <span className="text-[10px]" style={{ color: '#fff' }}>✨ PERFECTED</span>}
            {item.atk ? <span className="text-[10px] dc-amber">+{item.atk} ATK</span> : null}
            {item.def ? <span className="text-[10px]" style={{ color: '#7aa8c9' }}>+{item.def} DEF</span> : null}
            {item.luck ? <span className="text-[10px]" style={{ color: '#9bd98f' }}>🍀+{item.luck}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0 flex-wrap justify-end">{actions}</div>
    </div>
  );
}

function SkillbookRow({ item, actions }) {
  const desc = item.ability ? ABILITY_INFO[item.ability].desc : describeEffect(item.effect);
  const colorCls = item.rarity === 'mythic' ? 'dc-mythic' : item.rarity === 'legendary' ? 'dc-legendary' : item.rarity === 'epic' ? 'dc-epic' : item.rarity === 'rare' ? 'dc-rare' : 'dc-common';
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${glowClass(item.rarity)}`}>
      <div className="flex items-center gap-2 min-w-0">
        <BookOpen size={14} className={colorCls} />
        <div className="min-w-0">
          <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{item.name}</div>
          <div className="flex gap-2 items-center">
            <RarityTag rarity={item.rarity} />
            <span className="text-[10px] truncate" style={{ color: '#9a9788' }}>{desc}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">{actions}</div>
    </div>
  );
}

function SmallBtn({ children, onClick, variant = 'ghost', disabled }) {
  const cls = variant === 'primary' ? 'dc-btn-primary' : variant === 'danger' ? 'dc-btn-danger' : 'dc-btn-ghost';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`dc-btn ${cls} text-[11px] px-2 py-1`}
    >
      {children}
    </button>
  );
}

function NarrationBox({ text, loading }) {
  return (
    <div className="dc-panel rounded px-3 py-2 mb-3 min-h-[3rem] flex items-center">
      {loading ? (
        <p className="text-sm italic dc-narration-loading" style={{ color: '#9a9788' }}>
          The dungeon stirs, finding the words...
        </p>
      ) : (
        <p className="text-sm italic" style={{ color: '#c8c3b0' }}>{text}</p>
      )}
    </div>
  );
}

function EnemyCard({ enemy, selected, onClick, disabled }) {
  const dead = enemy.hp <= 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled || dead}
      className={`enemy-card dc-panel rounded p-2 flex flex-col items-center text-center ${selected ? 'selected' : ''} ${dead ? 'dead' : ''} ${glowClass(enemy.rarity)}`}
    >
      <div className="text-2xl mb-1" style={enemyEmojiStyle(enemy)}>{enemy.emoji}</div>
      <div className="text-[11px] dc-display leading-tight mb-1" style={{ color: '#e7e2d0' }}>{enemy.name}</div>
      <RarityTag rarity={enemy.rarity} />
      <div className="w-full mt-1.5">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#11121a' }}>
          <div
            className="h-full hp-fill"
            style={{ width: `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`, background: dead ? '#3a3e4a' : '#c0392b' }}
          />
        </div>
        <div className="text-[10px] mt-0.5 dc-mono" style={{ color: '#9a9788' }}>{Math.max(0, enemy.hp)}/{enemy.maxHp}</div>
      </div>
      <div className="flex gap-2 mt-1 text-[10px] dc-mono" style={{ color: '#9a9788' }}>
        <span>ATK {enemy.atk}</span>
        <span>DEF {enemy.def}</span>
      </div>
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>{title.toUpperCase()}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/* =========================================================
   MAIN
========================================================= */

export default function DungeonCrawler() {
  const [state, dispatch] = useReducer(reducer, { loaded: false });
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState('equipment');
  const [musicOn, setMusicOn] = useState(false);

  const toggleMusic = () => {
    musicEngine.init();
    musicEngine.setMuted(musicOn);
    setMusicOn(!musicOn);
  };

  // Load save on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.storage.get('dungeon_save', false);
        if (mounted) {
          if (res && res.value) {
            dispatch({ type: 'LOAD', payload: JSON.parse(res.value) });
          } else {
            dispatch({ type: 'SHOW_TITLE' });
          }
        }
      } catch (e) {
        if (mounted) dispatch({ type: 'SHOW_TITLE' });
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Autosave
  useEffect(() => {
    if (!state.loaded) return;
    const toSave = {
      player: state.player,
      prestige: state.prestige,
      depth: state.depth,
      room: state.room,
      log: state.log.slice(-30),
      gameOver: state.gameOver,
      prestigeReady: state.prestigeReady,
      selectedTarget: state.selectedTarget,
      biomeIntroId: state.biomeIntroId,
      biomeChoicePending: state.biomeChoicePending,
    };
    window.storage.set('dungeon_save', JSON.stringify(toSave), false).catch(() => {});
  }, [state.player, state.room, state.depth, state.gameOver, state.log, state.loaded, state.biomeIntroId, state.prestige, state.prestigeReady, state.biomeChoicePending]);

  // AI narration — only when entering a brand new biome (every 10 depths), not every encounter
  useEffect(() => {
    if (!state.loaded) return;
    if (!state.narrationLoading) return;
    let cancelled = false;
    const prompt = buildBiomePrompt(state);
    (async () => {
      const text = await fetchNarration(prompt);
      if (!cancelled) {
        dispatch({ type: 'SET_NARRATION', payload: { narration: text || fallbackNarration(state.room), loading: false } });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded, state.biomeIntroId]);

  // AI naming for newly discovered collectibles, one at a time, locked in permanently
  useEffect(() => {
    if (!state.loaded) return;
    const pending = state.player?.pendingNames || [];
    if (pending.length === 0) return;
    const target = pending[0];
    let cancelled = false;
    (async () => {
      const name = await fetchCollectibleName(target.category, target.index);
      if (!cancelled) {
        dispatch({
          type: 'SET_COLLECTIBLE_NAME',
          payload: { category: target.category, index: target.index, name: name || COLLECTIBLE_NAMES[target.category][target.index] },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [state.loaded, state.player?.pendingNames]);

  // Unlock the SFX AudioContext on the very first tap anywhere in the game,
  // so combat sounds triggered later (from effects, not directly from a
  // click) are already backed by a running, user-gesture-approved context.
  useEffect(() => {
    const unlock = () => { sfxEngine.ensureCtx(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  // Combat sound cues — scan whichever log lines are new since the last
  // render and play a matching synthesized sound. Uses the last-seen line
  // as an anchor rather than array length, since the log is capped at 50
  // entries (older lines fall off the front, so length alone can't tell us
  // how many lines were just added).
  const lastSfxLineRef = useRef(null);
  const sfxPrimedRef = useRef(false);
  useEffect(() => {
    if (!state.loaded) return;
    const logArr = state.log || [];
    if (logArr.length === 0) return;

    let newLines;
    if (!sfxPrimedRef.current) {
      newLines = []; // don't replay the backlog on first load
      sfxPrimedRef.current = true;
    } else if (lastSfxLineRef.current) {
      const idx = logArr.lastIndexOf(lastSfxLineRef.current);
      newLines = idx >= 0 ? logArr.slice(idx + 1) : logArr.slice(-1);
    } else {
      newLines = logArr.slice(-1);
    }

    newLines.forEach(line => {
      if (line.includes('Critical hit!') || line.includes('MEGACRIT') || line.includes('Critical throw!') || line.includes('Piercing Megacrit')) {
        sfxEngine.critTing();
      }
      if (line.startsWith('🎰 Soulwell')) {
        sfxEngine.clank();
        if (line.includes('RARE')) sfxEngine.critTing();
      } else if (line.startsWith('You strike the')) {
        sfxEngine.clank();
      } else if (line.startsWith('You hurl a') || line.startsWith('You use your')) {
        sfxEngine.twang();
      } else if (line.includes('You dodge the')) {
        sfxEngine.whoosh();
      } else if (line.includes('attack is deflected')) {
        sfxEngine.block();
      } else if (line.includes('hits you for')) {
        sfxEngine.thud();
      } else if (line.includes('falls!')) {
        sfxEngine.defeatCrunch();
      } else if (line.includes('reached level')) {
        sfxEngine.levelUp();
      }
    });

    lastSfxLineRef.current = logArr[logArr.length - 1];
  }, [state.log]);

  if (state.showTitle) {
    return (
      <div className="dc-root" style={{ minHeight: '100vh' }}>
        <GlobalStyle />
        <TitleScreen onStart={(name) => dispatch({ type: 'START_GAME', payload: name })} />
      </div>
    );
  }

  if (!state.loaded) {
    return (
      <div className="dc-root flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <GlobalStyle />
        <div className="dc-display text-lg" style={{ color: '#e8a23d' }}>
          <Flame className="torch-icon inline-block mr-2" size={20} />
          Entering the dungeon...
        </div>
      </div>
    );
  }

  const { player, room, depth, log, gameOver, selectedTarget } = state;
  const biomeIndex = currentBiome(depth);
  const biome = BIOMES[biomeIndex];

  return (
    <div className="dc-root px-3 py-4" style={{ backgroundImage: BIOME_BACKGROUNDS[biomeIndex] }}>
      <GlobalStyle />
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="torch-icon dc-amber" size={22} />
            <div>
              <div className="dc-display text-lg leading-tight" style={{ color: '#e8a23d' }}>THE DEEPING</div>
              <div className="text-[11px] dc-mono" style={{ color: '#9a9788' }}>▼ DEPTH {String(depth).padStart(2, '0')} ▼ · {biome.name}</div>
              <div className="text-[10px] dc-mono" style={{ color: '#6b6f7a' }}>{player.name}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] dc-mono" style={{ color: '#5a5d68' }}>v{GAME_VERSION}</span>
              <SmallBtn onClick={toggleMusic}>{musicOn ? '🎵' : '🔇'}</SmallBtn>
            </div>
            {!confirmReset ? (
              <SmallBtn onClick={() => setConfirmReset(true)}>New Game</SmallBtn>
            ) : (
              <div className="flex gap-1">
                <SmallBtn variant="danger" onClick={() => { window.storage.delete('dungeon_save', false).catch(() => {}); dispatch({ type: 'NEW_GAME' }); setConfirmReset(false); }}>Confirm</SmallBtn>
                <SmallBtn onClick={() => setConfirmReset(false)}>Cancel</SmallBtn>
              </div>
            )}
          </div>
        </div>

        {/* Biome accent strip — the one screen region never covered by an
            opaque panel, so this is always visible even though the ambient
            background gradient mostly isn't. */}
        <div
          style={{
            height: 3, borderRadius: 2, marginBottom: 10,
            background: BIOME_ACCENT[biomeIndex],
            boxShadow: `0 0 10px 1px ${BIOME_ACCENT[biomeIndex]}99`,
            transition: 'background 1s ease, box-shadow 1s ease',
          }}
        />

        {/* Player stats */}
        <div className="dc-panel rounded p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>Level {player.level}</span>
            <div className="flex items-center gap-2.5 text-xs dc-mono flex-wrap justify-end">
              <span className="flex items-center gap-1 dc-gold"><Coins size={13} />{player.gold}</span>
              <span className="flex items-center gap-1 dc-amber"><Sword size={13} />{totalAtk(player)}</span>
              <span className="flex items-center gap-1" style={{ color: '#7aa8c9' }}><Shield size={13} />{totalDef(player)}</span>
              <span className="flex items-center gap-1" style={{ color: '#9bd98f' }}>🍀{getLuck(player)}</span>
              {player.maps > 0 && <span className="flex items-center gap-1" style={{ color: '#ffd76a' }}>🗺️{player.maps}</span>}
              {state.prestige.ascensionLevel > 0 && <span className="flex items-center gap-1" style={{ color: '#ffd76a' }}>🌟{state.prestige.ascensionLevel}</span>}
              <span className="flex items-center gap-1" style={{ color: '#ffd76a' }}>👻{state.prestige.souls}</span>
            </div>
          </div>
          <StatBar icon={<Heart size={14} />} label="HP" value={Math.max(0, player.hp)} max={player.maxHp} fillClass="hp-fill-hp" critical={player.hp / player.maxHp < 0.25} />
          <StatBar icon={<Star size={14} />} label="XP" value={player.xp} max={player.xpNext} fillClass="hp-fill-xp" />
          <div className="flex justify-between text-[11px] dc-mono pt-1" style={{ color: '#9a9788' }}>
            <span className="flex items-center gap-1"><HeartPulse size={12} className="dc-common" />{player.potions} Potions</span>
            <span className="flex items-center gap-1"><Sparkles size={12} className="dc-rare" />{player.greaterPotions} Elixirs</span>
          </div>
        </div>

        {/* Narration */}
        <NarrationBox text={state.narration} loading={state.narrationLoading} />

        {/* Main room content */}
        {gameOver ? (
          state.prestigeReady ? (
            <PrestigePanel
              prestige={state.prestige}
              player={player}
              onUnlock={(id) => dispatch({ type: 'UNLOCK_PRESTIGE', payload: id })}
              onUnlockTrick={(id) => dispatch({ type: 'UNLOCK_COMBAT_TRICK', payload: id })}
              onUnlockReadyOrNotTier={(id) => dispatch({ type: 'UNLOCK_READY_OR_NOT_TIER', payload: id })}
              onUnlockBetterMerchantTier={(id) => dispatch({ type: 'UNLOCK_BETTER_MERCHANT_TIER', payload: id })}
              onUnlockCoins2Tier={(id) => dispatch({ type: 'UNLOCK_COINS2_TIER', payload: id })}
              onUnlockCoins3Tier={(id) => dispatch({ type: 'UNLOCK_COINS3_TIER', payload: id })}
              onUnlockMadgodTier={(id) => dispatch({ type: 'UNLOCK_MADGOD_TIER', payload: id })}
              onUnlockPhysicianTier={(id) => dispatch({ type: 'UNLOCK_PHYSICIAN_TIER', payload: id })}
              onUnlockAtlas={() => dispatch({ type: 'UNLOCK_ATLAS' })}
              onUnlockSoulwell={() => dispatch({ type: 'UNLOCK_SOULWELL' })}
              onPullSoulwell={() => dispatch({ type: 'PULL_SOULWELL' })}
              onUnlockStamps7Tier={(id) => dispatch({ type: 'UNLOCK_STAMPS7_TIER', payload: id })}
              onUnlockAncestralMemoryTier={(id) => dispatch({ type: 'UNLOCK_ANCESTRAL_MEMORY_TIER', payload: id })}
              onUnlockFactorySealedTier={(id) => dispatch({ type: 'UNLOCK_FACTORY_SEALED_TIER', payload: id })}
              onUnlockWealthTier={(id) => dispatch({ type: 'UNLOCK_WEALTH_TIER', payload: id })}
              onUnlockHealthTier={(id) => dispatch({ type: 'UNLOCK_HEALTH_TIER', payload: id })}
              onUnlockHeavilyArmedTier={(id) => dispatch({ type: 'UNLOCK_HEAVILY_ARMED_TIER', payload: id })}
              onUnlockWellReadTier={(id) => dispatch({ type: 'UNLOCK_WELL_READ_TIER', payload: id })}
              onUnlockBookSmartsTier={(id) => dispatch({ type: 'UNLOCK_BOOK_SMARTS_TIER', payload: id })}
              onUnlockRangedMasteryTier={(id) => dispatch({ type: 'UNLOCK_RANGED_MASTERY_TIER', payload: id })}
              onUnlockStamps6Tier={(id) => dispatch({ type: 'UNLOCK_STAMPS6_TIER', payload: id })}
              onUnlockRegionalMasteryTree={() => dispatch({ type: 'UNLOCK_REGIONAL_MASTERY_TREE' })}
              onUnlockRegionalMasteryTier={(id) => dispatch({ type: 'UNLOCK_REGIONAL_MASTERY_TIER', payload: id })}
              onAscend={() => dispatch({ type: 'ASCEND' })}
              onNewRun={() => dispatch({ type: 'START_NEW_RUN' })}
            />
          ) : (
            <GameOverPanel depth={depth} player={player} onClaim={() => dispatch({ type: 'CLAIM_PRESTIGE' })} />
          )
        ) : state.biomeChoicePending ? (
          <BiomeChoicePanel
            depth={depth}
            biome={biome}
            onAdvance={() => dispatch({ type: 'DESCEND_CHOICE', payload: 'advance' })}
            onLoop={() => dispatch({ type: 'DESCEND_CHOICE', payload: 'loop' })}
          />
        ) : isCombatRoom(room.type) ? (
          <CombatPanel
            room={room}
            player={player}
            selectedTarget={selectedTarget}
            onSelect={(i) => dispatch({ type: 'SELECT_TARGET', payload: i })}
            onAttack={() => dispatch({ type: 'ATTACK' })}
            onFlee={() => dispatch({ type: 'FLEE' })}
            onPotion={() => dispatch({ type: 'USE_POTION' })}
            onGreater={() => dispatch({ type: 'USE_GREATER' })}
            onElixirOfLife={() => dispatch({ type: 'USE_ELIXIR_OF_LIFE' })}
            onThrow={() => dispatch({ type: 'THROW' })}
            onFireHandcannon={() => dispatch({ type: 'FIRE_HANDCANNON' })}
            onFireBow={() => dispatch({ type: 'FIRE_BOW' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'merchant' ? (
          <MerchantPanel
            room={room}
            player={player}
            onBuy={(item) => dispatch({ type: 'BUY', payload: item })}
            onPotion={() => dispatch({ type: 'USE_POTION' })}
            onGreater={() => dispatch({ type: 'USE_GREATER' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'collector' ? (
          <CollectorPanel
            room={room}
            player={player}
            onTrade={(id) => dispatch({ type: 'TRADE', payload: id })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'treasure' ? (
          <TreasurePanel
            room={room}
            onOpen={() => dispatch({ type: 'OPEN_TREASURE' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'library' ? (
          <LibraryPanel
            room={room}
            player={player}
            onBuy={(item) => dispatch({ type: 'BUY', payload: item })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'wheel' ? (
          <WheelPanel
            room={room}
            onSpin={() => dispatch({ type: 'SPIN_WHEEL' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'relic' ? (
          <RelicRoomPanel
            room={room}
            player={player}
            onBuy={(id) => dispatch({ type: 'BUY_RELIC', payload: id })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'tunnel' ? (
          <TunnelPanel
            room={room}
            depth={depth}
            prestige={state.prestige}
            player={player}
            onUse={() => dispatch({ type: 'USE_TUNNEL' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : room.type === 'deluxe_merchant' ? (
          <DeluxeMerchantPanel
            room={room}
            player={player}
            onBuy={(item) => dispatch({ type: 'BUY', payload: item })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        ) : (
          <HealerPanel
            player={player}
            onRest={() => dispatch({ type: 'REST' })}
            onDescend={() => dispatch({ type: 'DESCEND' })}
          />
        )}

        {/* Gear / Pack / Skills / Collection tabs */}
        {!gameOver && (
          <div className="dc-panel rounded mt-3">
            <div className="flex" style={{ borderBottom: '1px solid #33363f' }}>
              {[
                { id: 'equipment', label: 'Gear', icon: <Shield size={13} /> },
                { id: 'pack', label: 'Pack', icon: <Package size={13} /> },
                { id: 'skills', label: 'Skills', icon: <Star size={13} /> },
                { id: 'bestiary', label: 'Bestiary', icon: <BookOpen size={13} /> },
                { id: 'collection', label: 'Collection', icon: <Sparkles size={13} /> },
                { id: 'atlas', label: 'Atlas', icon: <Compass size={13} /> },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] dc-display tab-btn ${tab === t.id ? 'tab-active' : ''}`}
                  style={{ color: tab === t.id ? '#e8a23d' : '#9a9788' }}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            {tab === 'equipment' && <EquipmentPanel player={player} />}
            {tab === 'pack' && <PackPanel player={player} room={room} dispatch={dispatch} />}
            {tab === 'skills' && <SkillTreePanel player={player} prestige={state.prestige} dispatch={dispatch} />}
            {tab === 'bestiary' && (
              <div className="p-3">
                {player.bestiaryUnlocked
                  ? <BestiaryPanel player={player} />
                  : <p className="text-xs" style={{ color: '#9a9788' }}>📖 The Bestiary is locked. Trade in 50 Cards in your Collection to unlock it.</p>
                }
              </div>
            )}
            {tab === 'collection' && <CollectionPanel player={player} prestige={state.prestige} dispatch={dispatch} />}
            {tab === 'atlas' && (
              <div className="p-3">
                {state.prestige.atlasUnlocked
                  ? <AtlasPanel prestige={state.prestige} />
                  : <p className="text-xs" style={{ color: '#9a9788' }}>🗺️ The Atlas is locked. Unlock it from the Prestige panel for {ATLAS_COST} Souls after a run ends.</p>
                }
              </div>
            )}
          </div>
        )}

        {/* Log */}
        <div className="dc-panel rounded mt-3 p-2">
          <div className="text-[11px] dc-display tracking-widest mb-1" style={{ color: '#9a9788' }}>CHRONICLE</div>
          <div className="max-h-32 overflow-y-auto flex flex-col-reverse gap-0.5 text-[11px] dc-mono" style={{ color: '#b8b3a3' }}>
            {[...log].reverse().map((line, i) => (
              <div key={i} className={line.startsWith('✦') ? 'dc-amber' : line.startsWith('—') ? 'dc-rare' : ''}>{line}</div>
            ))}
          </div>
        </div>

        <div className="text-center text-[10px] mt-3" style={{ color: '#5a5d68' }}>
          autosaving each step · the dungeon never ends
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PANELS
========================================================= */

function CombatPanel({ room, player, selectedTarget, onSelect, onAttack, onFlee, onPotion, onGreater, onElixirOfLife, onThrow, onFireHandcannon, onFireBow, onDescend }) {
  const isLegendary = room.type === 'legendary';

  if (room.cleared) {
    return (
      <div className={`dc-panel rounded p-3 mb-1 text-center ${isLegendary ? 'legendary-glow' : ''}`}>
        <div className="dc-display text-base mb-1" style={{ color: isLegendary ? '#ffd76a' : '#e8a23d' }}>
          {isLegendary ? 'The Rift Collapses!' : room.fled ? 'You escaped into the dark.' : 'Victory!'}
        </div>
        <p className="text-xs mb-3" style={{ color: '#9a9788' }}>
          {isLegendary ? 'Incredible spoils spill from the closing tear in reality.' : room.fled ? 'The passage ahead waits, unguarded.' : 'The chamber falls silent. The way down is clear.'}
        </p>
        <button onClick={onDescend} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto">
          <ArrowDownCircle size={16} /> Descend
        </button>
      </div>
    );
  }

  const cols = room.enemies.length === 1 ? 'grid-cols-1' : room.enemies.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  const hasThrowable = player.throwable && player.throwableCount > 0;
  const hasHandcannon = player.keyItems.includes('handcannon') && player.bullets > 0;
  const hasBow = player.keyItems.includes('bow') && player.arrows > 0;
  const hasRanged = hasThrowable || hasHandcannon || hasBow;

  return (
    <div className={`dc-panel rounded p-3 mb-1 ${isLegendary ? 'legendary-glow' : ''}`}>
      {isLegendary && <div className="text-center text-xs dc-display mb-2" style={{ color: '#ffd76a' }}>⚠ LEGENDARY RIFT ⚠</div>}
      <div className={`grid ${cols} gap-2 mb-3`}>
        {room.enemies.map((e, i) => (
          <div key={e.id} className={room.enemies.length === 1 ? 'max-w-[160px] mx-auto w-full' : ''}>
            <EnemyCard enemy={e} selected={i === selectedTarget} onClick={() => onSelect(i)} />
          </div>
        ))}
      </div>
      <div className={`grid ${isLegendary ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-2`}>
        <button onClick={onAttack} className="dc-btn dc-btn-primary py-2 text-sm flex items-center justify-center gap-1.5">
          <Sword size={15} /> Attack
        </button>
        {!isLegendary && (
          <button onClick={onFlee} className="dc-btn dc-btn-ghost py-2 text-sm flex items-center justify-center gap-1.5">
            <Footprints size={15} /> Flee
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={onPotion} disabled={player.potions <= 0 || player.hp >= player.maxHp} className="dc-btn dc-btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5">
          <HeartPulse size={13} className="dc-common" /> Potion ({player.potions})
        </button>
        <button onClick={onGreater} disabled={player.greaterPotions <= 0 || player.hp >= player.maxHp} className="dc-btn dc-btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5">
          <Sparkles size={13} className="dc-rare" /> Elixir ({player.greaterPotions})
        </button>
      </div>
      {(player.elixirsOfLife || 0) > 0 && (
        <div className="mb-2">
          <button onClick={onElixirOfLife} disabled={player.hp >= player.maxHp} className="dc-btn dc-btn-ghost py-1.5 text-xs w-full flex items-center justify-center gap-1.5 legendary-glow">
            <Heart size={13} style={{ color: '#ffd76a' }} /> Elixir of Life ({player.elixirsOfLife}) — Full Restore
          </button>
        </div>
      )}
      {hasRanged && (
        <div className="grid grid-cols-3 gap-2">
          {player.throwable && (
            <button onClick={onThrow} disabled={player.throwableCount <= 0} className="dc-btn dc-btn-ghost py-1.5 text-[11px] flex items-center justify-center gap-1">
              🔪 {player.throwableCount}
            </button>
          )}
          {player.keyItems.includes('handcannon') && (
            <button onClick={onFireHandcannon} disabled={player.bullets <= 0} className="dc-btn dc-btn-ghost py-1.5 text-[11px] flex items-center justify-center gap-1">
              🔫 {player.bullets}
            </button>
          )}
          {player.keyItems.includes('bow') && (
            <button onClick={onFireBow} disabled={player.arrows <= 0} className="dc-btn dc-btn-ghost py-1.5 text-[11px] flex items-center justify-center gap-1">
              🏹 {player.arrows}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MerchantPanel({ room, player, onBuy, onPotion, onGreater, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <Store size={16} className="dc-amber" />
        <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>Wandering Merchant</span>
      </div>
      <div className="space-y-1.5 mb-3">
        {room.stock.length === 0 && <p className="text-xs" style={{ color: '#9a9788' }}>The stall is empty. Move on.</p>}
        {room.stock.map(item => (
          item.type === 'skillbook' ? (
            <SkillbookRow key={item.uid} item={item} actions={
              <SmallBtn variant="primary" disabled={player.gold < item.price} onClick={() => onBuy(item)}>
                Buy {item.price}g
              </SmallBtn>
            } />
          ) : (
            <ItemRow key={item.uid} item={item} actions={
              <SmallBtn variant="primary" disabled={player.gold < item.price} onClick={() => onBuy(item)}>
                Buy {item.price}g
              </SmallBtn>
            } />
          )
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={onPotion} disabled={player.potions <= 0 || player.hp >= player.maxHp} className="dc-btn dc-btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5">
          <HeartPulse size={13} className="dc-common" /> Potion ({player.potions})
        </button>
        <button onClick={onGreater} disabled={player.greaterPotions <= 0 || player.hp >= player.maxHp} className="dc-btn dc-btn-ghost py-1.5 text-xs flex items-center justify-center gap-1.5">
          <Sparkles size={13} className="dc-rare" /> Elixir ({player.greaterPotions})
        </button>
      </div>
      <button onClick={onDescend} className="dc-btn dc-btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
        <ArrowDownCircle size={16} /> Descend
      </button>
    </div>
  );
}

function CollectorPanel({ room, player, onTrade, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <ArrowLeftRight size={16} className="dc-rare" />
        <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>Wandering Collector</span>
      </div>
      {room.offers.length === 0 ? (
        <p className="text-xs mb-3" style={{ color: '#9a9788' }}>The collector shrugs — nothing left to trade this time.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {room.offers.map(offer => {
            const canAfford = offer.cost.every(c => player.collectibles[c.category].includes(c.index));
            return (
              <div key={offer.id} className="dc-panel-raised rounded p-2">
                <div className="text-xs mb-1.5" style={{ color: '#9a9788' }}>
                  Give: {offer.cost.map(c => `${COLLECTIBLE_META[c.category].icon} ${getCollectibleName(player, c.category, c.index)}`).join(', ')}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs dc-amber">{describeReward(offer.reward)}</span>
                  <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onTrade(offer.id)}>Trade</SmallBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={onDescend} className="dc-btn dc-btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
        <ArrowDownCircle size={16} /> Descend
      </button>
    </div>
  );
}

function TreasurePanel({ room, onOpen, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1 text-center">
      <div className="text-3xl mb-2">🪙</div>
      <div className="dc-display text-base mb-1" style={{ color: '#e8c468' }}>
        {room.opened ? 'Treasure Claimed' : 'A Hidden Cache'}
      </div>
      {!room.opened ? (
        <>
          <p className="text-xs mb-3" style={{ color: '#9a9788' }}>Something valuable glints in the shadows.</p>
          <button onClick={onOpen} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto">
            <Sparkles size={16} /> Open Chest
          </button>
        </>
      ) : (
        <button onClick={onDescend} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto mt-2">
          <ArrowDownCircle size={16} /> Descend
        </button>
      )}
    </div>
  );
}

function LibraryPanel({ room, player, onBuy, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={16} className="dc-rare" />
        <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>The Grand Library</span>
      </div>
      <p className="text-[11px] mb-2" style={{ color: '#9a9788' }}>Shelves without end, and a few tomes that shouldn't exist.</p>
      <div className="space-y-1.5 mb-3">
        {room.stock.map(item => (
          <SkillbookRow key={item.uid} item={item} actions={
            <SmallBtn variant="primary" disabled={player.gold < item.price} onClick={() => onBuy(item)}>Buy {item.price}g</SmallBtn>
          } />
        ))}
      </div>
      <button onClick={onDescend} className="dc-btn dc-btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
        <ArrowDownCircle size={16} /> Descend
      </button>
    </div>
  );
}

function WheelPanel({ room, onSpin, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1 text-center">
      <div className="text-3xl mb-2">🎡</div>
      <div className="dc-display text-base mb-1" style={{ color: '#e8c468' }}>
        {room.spun ? 'The Wheel Stops' : 'A Wheel of Fortune'}
      </div>
      {!room.spun ? (
        <>
          <p className="text-xs mb-3" style={{ color: '#9a9788' }}>An impossible wheel spins in the dark, waiting for a hand to stop it.</p>
          <button onClick={onSpin} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto">
            <Sparkles size={16} /> Spin the Wheel
          </button>
        </>
      ) : (
        <button onClick={onDescend} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto mt-2">
          <ArrowDownCircle size={16} /> Descend
        </button>
      )}
    </div>
  );
}

function RelicRoomPanel({ room, player, onBuy, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <Gem size={16} className="dc-rare" />
        <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>The Relic Room</span>
      </div>
      {room.bought ? (
        <p className="text-xs mb-3" style={{ color: '#9a9788' }}>You've made your choice. The other relics dissolve into dust.</p>
      ) : (room.offers || []).length === 0 ? (
        <p className="text-xs mb-3" style={{ color: '#9a9788' }}>There is nothing left here you don't already carry.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          <p className="text-[11px] mb-1" style={{ color: '#9a9788' }}>Choose one — the rest will be lost.</p>
          {room.offers.map(relic => (
            <div key={relic.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">{relic.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: '#e7e2d0' }}>{relic.name}</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>{relic.desc}</div>
                </div>
              </div>
              <SmallBtn variant="primary" disabled={player.gold < relic.price} onClick={() => onBuy(relic.id)}>{relic.price}g</SmallBtn>
            </div>
          ))}
        </div>
      )}
      <button onClick={onDescend} className="dc-btn dc-btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
        <ArrowDownCircle size={16} /> Descend
      </button>
    </div>
  );
}

function TunnelPanel({ room, depth, prestige, player, onUse, onDescend }) {
  const targetDepth = depth + 20;
  const targetBiome = BIOMES[currentBiome(targetDepth)];
  const tunnelCost = effectiveTunnelCost(player);
  const canAfford = prestige.souls >= tunnelCost;
  return (
    <div className="dc-panel rounded p-3 mb-1 text-center">
      <div className="text-3xl mb-2">🕳️</div>
      <div className="dc-display text-base mb-1" style={{ color: '#e8c468' }}>
        {room.used ? 'The Tunnel Closes' : 'A Secret Tunnel'}
      </div>
      {!room.used ? (
        <>
          <p className="text-xs mb-3" style={{ color: '#9a9788' }}>
            A narrow passage cuts straight through the dark, bypassing everything between here and {targetBiome.name}.
          </p>
          <button
            onClick={onUse}
            disabled={!canAfford}
            className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto mb-2"
          >
            🕳️ Skip to Depth {targetDepth} ({tunnelCost} 👻)
          </button>
          <div>
            <button onClick={onDescend} className="dc-btn dc-btn-ghost px-4 py-2 text-sm flex items-center gap-2 mx-auto">
              <ArrowDownCircle size={16} /> Continue Normally
            </button>
          </div>
        </>
      ) : (
        <button onClick={onDescend} className="dc-btn dc-btn-primary px-4 py-2 text-sm flex items-center gap-2 mx-auto mt-2">
          <ArrowDownCircle size={16} /> Descend
        </button>
      )}
    </div>
  );
}

function DeluxeMerchantPanel({ room, player, onBuy, onDescend }) {
  return (
    <div className="dc-panel rounded p-3 mb-1 mythic-glow">
      <div className="flex items-center gap-2 mb-2">
        <Store size={16} className="dc-mythic" />
        <span className="dc-display text-sm" style={{ color: '#5eead4' }}>The Deluxe Merchant</span>
      </div>
      <p className="text-[11px] mb-2" style={{ color: '#9a9788' }}>A merchant of impossible means. Everything here is absurdly expensive — and absurdly strong.</p>
      <div className="space-y-1.5 mb-3">
        {room.stock.map(item => (
          item.type === 'skillbook' ? (
            <SkillbookRow key={item.uid} item={item} actions={
              <SmallBtn variant="primary" disabled={player.gold < item.price} onClick={() => onBuy(item)}>Buy {item.price}g</SmallBtn>
            } />
          ) : (
            <ItemRow key={item.uid} item={item} actions={
              <SmallBtn variant="primary" disabled={player.gold < item.price} onClick={() => onBuy(item)}>Buy {item.price}g</SmallBtn>
            } />
          )
        ))}
      </div>
      <button onClick={onDescend} className="dc-btn dc-btn-primary w-full py-2 text-sm flex items-center justify-center gap-2">
        <ArrowDownCircle size={16} /> Descend
      </button>
    </div>
  );
}

function BiomeChoicePanel({ depth, biome, onAdvance, onLoop }) {
  const nextBiome = BIOMES[(currentBiome(depth) + 1) % BIOMES.length];
  return (
    <div className="dc-panel rounded p-4 mb-1 text-center legendary-glow">
      <div className="text-3xl mb-2">🧭</div>
      <div className="dc-display text-base mb-1" style={{ color: '#ffd76a' }}>The Path Forks</div>
      <p className="text-xs mb-4" style={{ color: '#9a9788' }}>
        You have cleared {biome.name} down to its depths. Push onward into {nextBiome.name}, or circle back and relive {biome.name} from its start to grind for more loot?
      </p>
      <div className="grid grid-cols-1 gap-2">
        <button onClick={onAdvance} className="dc-btn dc-btn-primary py-2.5 text-sm flex items-center justify-center gap-2">
          <ArrowDownCircle size={16} /> Advance to {nextBiome.name}
        </button>
        <button onClick={onLoop} className="dc-btn dc-btn-ghost py-2.5 text-sm flex items-center justify-center gap-2">
          <Footprints size={16} /> Loop back through {biome.name}
        </button>
      </div>
    </div>
  );
}

function HealerPanel({ player, onRest, onDescend }) {
  const missing = player.maxHp - player.hp;
  const cost = missing > 0 ? Math.max(1, Math.ceil((missing / 2) * (player.restCostMult || 1))) : 0;
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <HeartPulse size={16} className="dc-common" />
        <span className="dc-display text-sm" style={{ color: '#e7e2d0' }}>Shrine of Respite</span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#9a9788' }}>
        {missing <= 0 ? 'You are already at full strength.' : `Mend your wounds for ${cost} gold and walk on at full HP.`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onRest} disabled={missing <= 0 || player.gold < cost} className="dc-btn dc-btn-primary py-2 text-sm flex items-center justify-center gap-1.5">
          <Heart size={15} /> Rest {missing > 0 ? `(${cost}g)` : ''}
        </button>
        <button onClick={onDescend} className="dc-btn dc-btn-ghost py-2 text-sm flex items-center justify-center gap-2">
          <ArrowDownCircle size={15} /> Descend
        </button>
      </div>
    </div>
  );
}

function GameOverPanel({ depth, player, onClaim }) {
  const earned = soulsForRun(player.maxDepthReached || depth);
  return (
    <div className="dc-panel rounded p-4 mb-1 text-center">
      <Skull size={28} className="mx-auto mb-2" style={{ color: '#e0584a' }} />
      <div className="dc-display text-lg mb-1" style={{ color: '#e0584a' }}>You Have Fallen</div>
      <p className="text-xs mb-3" style={{ color: '#9a9788' }}>
        The dungeon claims another soul at depth {depth}, level {player.level}.
      </p>
      <p className="text-xs mb-3" style={{ color: '#ffd76a' }}>
        ✦ This run earned {earned} Soul{earned === 1 ? '' : 's'} for prestige upgrades.
      </p>
      <button onClick={onClaim} className="dc-btn dc-btn-primary px-4 py-2 text-sm mx-auto">
        Claim Souls
      </button>
    </div>
  );
}

function PrestigePanel({ prestige, player, onUnlock, onUnlockTrick, onUnlockReadyOrNotTier, onUnlockBetterMerchantTier, onUnlockCoins2Tier, onUnlockCoins3Tier, onUnlockMadgodTier, onUnlockPhysicianTier, onUnlockAtlas, onUnlockWealthTier, onUnlockHealthTier, onUnlockHeavilyArmedTier, onUnlockWellReadTier, onUnlockBookSmartsTier, onUnlockRangedMasteryTier, onUnlockStamps6Tier, onUnlockRegionalMasteryTree, onUnlockRegionalMasteryTier, onUnlockSoulwell, onPullSoulwell, onUnlockStamps7Tier, onUnlockAncestralMemoryTier, onUnlockFactorySealedTier, onAscend, onNewRun }) {
  const bodyNodes = PRESTIGE_TREE.filter(n => n.group === 'body');
  const statNodes = PRESTIGE_TREE.filter(n => n.group === 'stat');
  const [confirmAscend, setConfirmAscend] = useState(false);
  const ascLevel = prestige.ascensionLevel || 0;
  const ascRequiredDepth = ascensionRequiredDepth(ascLevel);
  const canAscend = (player.maxDepthReached || 1) >= ascRequiredDepth;
  return (
    <div className="dc-panel rounded p-3 mb-1">
      <div className="flex items-center justify-between mb-3">
        <span className="dc-display text-base flex items-center gap-2" style={{ color: '#ffd76a' }}>
          <Sparkles size={18} /> Prestige
        </span>
        <span className="text-sm dc-mono" style={{ color: '#ffd76a' }}>{prestige.souls} 👻 Souls</span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#9a9788' }}>
        Spend Souls on permanent upgrades that persist across every future run. Your collection cabinet carries over too.
      </p>
      <div className={`dc-panel-raised rounded p-3 mb-3 ${ascLevel > 0 ? 'legendary-glow' : ''}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="dc-display text-sm flex items-center gap-2" style={{ color: '#ffd76a' }}>🌟 Ascension</span>
          {ascLevel > 0 && <span className="text-xs dc-mono" style={{ color: '#ffd76a' }}>Level {ascLevel}</span>}
        </div>
        <p className="text-[11px] mb-2" style={{ color: '#9a9788' }}>
          {ascLevel > 0
            ? `Permanent +${Math.round((ascensionStatMult(ascLevel) - 1) * 100)}% ATK/DEF/max HP, +${ascLevel * 3} Luck, +${ascLevel * 10}% Gold & XP — no downside, no strings attached.`
            : "A one-way capstone: bank your standing into a permanent global power boost, no strings attached. The depths themselves stay just as tough as ever. Reach deep enough in a single run to unlock it."}
        </p>
        {canAscend ? (
          confirmAscend ? (
            <div className="flex gap-2">
              <SmallBtn variant="danger" onClick={() => { onAscend(); setConfirmAscend(false); }}>Confirm Ascend to Level {ascLevel + 1}</SmallBtn>
              <SmallBtn onClick={() => setConfirmAscend(false)}>Cancel</SmallBtn>
            </div>
          ) : (
            <SmallBtn variant="primary" onClick={() => setConfirmAscend(true)}>🌟 Ascend to Level {ascLevel + 1}</SmallBtn>
          )
        ) : (
          <p className="text-[10px]" style={{ color: '#6b6f7a' }}>
            Reach depth {ascRequiredDepth} in a single run to Ascend to Level {ascLevel + 1}. (Deepest this run: {player.maxDepthReached || 1})
          </p>
        )}
      </div>
      <Section title="Body Modifications">
        {bodyNodes.map(node => {
          const owned = prestige.bodyMods.includes(node.effect.bodyMod);
          const canAfford = prestige.souls >= node.cost;
          return (
            <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
              <div className="min-w-0">
                <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
              </div>
              {owned ? (
                <span className="text-[10px] dc-rare shrink-0">OWNED</span>
              ) : (
                <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlock(node.id)}>{node.cost} 👻</SmallBtn>
              )}
            </div>
          );
        })}
      </Section>
      <div className="mt-3">
        <Section title="Stat Training">
          {statNodes.map(node => {
            const times = prestige.unlocked[node.id] || 0;
            const atMax = node.max ? times >= node.max : false;
            const cost = prestigeCost(node, times);
            const canAfford = prestige.souls >= cost && !atMax;
            return (
              <div key={node.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: '#e7e2d0' }}>{node.name}{times > 0 ? ` ×${times}` : ''}</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}{atMax ? ' · maxed' : ''}</div>
                </div>
                <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlock(node.id)}>{atMax ? 'MAX' : `${cost} 👻`}</SmallBtn>
              </div>
            );
          })}
        </Section>
      </div>
      <div className="mt-3">
        <Section title="Combat Tricks">
          {COMBAT_TRICKS.map(trick => {
            const owned = (prestige.combatTricks || []).includes(trick.id);
            const canAfford = prestige.souls >= trick.cost;
            return (
              <div key={trick.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{trick.name}</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>{trick.desc}</div>
                </div>
                {owned ? (
                  <span className="text-[10px] dc-rare shrink-0">LEARNED</span>
                ) : (
                  <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockTrick(trick.id)}>{trick.cost} 👻</SmallBtn>
                )}
              </div>
            );
          })}
        </Section>
      </div>
      <div className="mt-3">
        <Section title="The Atlas">
          <div className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${prestige.atlasUnlocked ? 'mythic-glow' : ''}`}>
            <div className="min-w-0">
              <div className="text-xs" style={{ color: prestige.atlasUnlocked ? '#5eead4' : '#e7e2d0' }}>The Atlas</div>
              <div className="text-[10px]" style={{ color: '#9a9788' }}>Reveals the history of every biome and permanently grants biome-exclusive weapon &amp; armor pairs at 30/60/90 lifetime visits to each.</div>
            </div>
            {prestige.atlasUnlocked ? (
              <span className="text-[10px] shrink-0" style={{ color: '#5eead4' }}>OWNED</span>
            ) : (
              <SmallBtn variant="primary" disabled={prestige.souls < ATLAS_COST} onClick={onUnlockAtlas}>{ATLAS_COST} 👻</SmallBtn>
            )}
          </div>
        </Section>
      </div>
      <div className="mt-3">
        <Section title="The Soulwell">
          {!prestige.soulwellUnlocked ? (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
              <div className="min-w-0">
                <div className="text-xs" style={{ color: '#e7e2d0' }}>The Soulwell</div>
                <div className="text-[10px]" style={{ color: '#9a9788' }}>A gacha well. Feed it Souls one at a time for small, permanent, stacking bonuses (damage, dodge, defense, block, knife damage) against a random enemy — or sometimes a whole biome.</div>
              </div>
              <SmallBtn variant="primary" disabled={prestige.souls < SOULWELL_UNLOCK_COST} onClick={onUnlockSoulwell}>{SOULWELL_UNLOCK_COST} 👻</SmallBtn>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised mb-1.5">
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: '#e7e2d0' }}>🎰 Pull the Soulwell</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>{prestige.soulwellPulls || 0} pull{(prestige.soulwellPulls || 0) === 1 ? '' : 's'} so far · Common 70% · Uncommon 24% · Rare 6%</div>
                </div>
                <SmallBtn variant="primary" disabled={prestige.souls < 1} onClick={onPullSoulwell}>Pull (1 👻)</SmallBtn>
              </div>
              {(prestige.soulwellLog || []).length > 0 && (
                <div className="space-y-1">
                  {prestige.soulwellLog.slice(0, 6).map(pull => {
                    const color = pull.rarity === 'rare' ? '#ffd76a' : pull.rarity === 'uncommon' ? '#c9a4f7' : '#8fae6b';
                    return (
                      <div key={pull.id} className={`px-2 py-1 rounded dc-panel-raised text-[10px] ${pull.rarity === 'rare' ? 'legendary-glow' : ''}`} style={{ color }}>
                        {pull.rarity === 'rare' ? '✨' : '·'} {pull.desc}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Section>
      </div>
      <div className="mt-3">
        <Section title="Regional Mastery">
          {!prestige.regionalMasteryTreeUnlocked ? (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
              <div className="min-w-0">
                <div className="text-xs" style={{ color: '#e7e2d0' }}>Regional Mastery</div>
                <div className="text-[10px]" style={{ color: '#9a9788' }}>Unlocks a mastery track for every biome: +10% damage, then +5% gold, then +5% luck against that biome's enemies — one step revealed at a time.</div>
              </div>
              <SmallBtn variant="primary" disabled={prestige.souls < REGIONAL_MASTERY_UNLOCK_COST} onClick={onUnlockRegionalMasteryTree}>{REGIONAL_MASTERY_UNLOCK_COST} 👻</SmallBtn>
            </div>
          ) : (
            BIOMES.map((biome, i) => {
              const nodesForBiome = REGIONAL_MASTERY_TREE.filter(n => n.biomeIndex === i).sort((a, b) => a.order - b.order);
              const unlocked = prestige.regionalMasteryUnlocked || [];
              const ownedCount = nodesForBiome.filter(n => unlocked.includes(n.id)).length;
              const next = nodesForBiome[ownedCount];
              const discovered = ((prestige.biomeVisits && prestige.biomeVisits[i]) || 0) > 0;
              const genericDesc = next && (
                next.kind === 'dmg' ? "+10% damage against this region's enemies." :
                next.kind === 'gold' ? "+5% gold from this region's enemies." :
                "+5% luck from this region's enemy loot."
              );
              return (
                <div key={i} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${!next ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: discovered ? '#e7e2d0' : '#5a5d68' }}>
                      {discovered ? biome.name : '??? — Undiscovered'} <span style={{ color: '#9a9788' }}>({ownedCount}/3)</span>
                    </div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{next ? (discovered ? next.desc : genericDesc) : 'Fully mastered.'}</div>
                  </div>
                  {next ? (
                    <SmallBtn variant="primary" disabled={prestige.souls < next.cost} onClick={() => onUnlockRegionalMasteryTier(next.id)}>{next.cost} 👻</SmallBtn>
                  ) : (
                    <span className="text-[10px] dc-rare shrink-0">MAX</span>
                  )}
                </div>
              );
            })
          )}
        </Section>
      </div>
      {prestige.readyOrNotTreeUnlocked && (
        <div className="mt-3">
          <Section title="Ready or Not">
            {READY_OR_NOT_TREE.map(node => {
              const owned = (prestige.readyOrNotUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? (
                    <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                  ) : (
                    <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockReadyOrNotTier(node.id)}>{node.cost} 👻</SmallBtn>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.betterMerchantTreeUnlocked && (
        <div className="mt-3">
          <Section title="Better Merchant">
            {BETTER_MERCHANT_TREE.map(node => {
              const owned = (prestige.betterMerchantUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? (
                    <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                  ) : (
                    <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockBetterMerchantTier(node.id)}>{node.cost} 👻</SmallBtn>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.coins2TreeUnlocked && (
        <div className="mt-3">
          <Section title="Blade Mastery">
            {COINS2_TREE.map(node => {
              const owned = (prestige.coins2Unlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? (
                    <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                  ) : (
                    <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockCoins2Tier(node.id)}>{node.cost} 👻</SmallBtn>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.coins3TreeUnlocked && (
        <div className="mt-3">
          <Section title="Slicing Giants">
            {SLICING_GIANTS_TREE.map(node => {
              const owned = (prestige.coins3Unlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? (
                    <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                  ) : (
                    <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockCoins3Tier(node.id)}>{node.cost} 👻</SmallBtn>
                  )}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.figures2TreeUnlocked && (
        <div className="mt-3">
          <Section title="Luck of the Madgod">
            {MADGOD_TREE.map(node => {
              const owned = (prestige.figures2Unlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockMadgodTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.stamps2TreeUnlocked && (
        <div className="mt-3">
          <Section title="Physician Heal Thyself">
            {PHYSICIAN_TREE.map(node => {
              const owned = (prestige.stamps2Unlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockPhysicianTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.coins5TreeUnlocked && (
        <div className="mt-3">
          <Section title="Wealth">
            {WEALTH_TREE.map(node => {
              const owned = (prestige.wealthUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockWealthTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.stamps4TreeUnlocked && (
        <div className="mt-3">
          <Section title="Health">
            {HEALTH_TREE.map(node => {
              const owned = (prestige.healthUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockHealthTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.figures5TreeUnlocked && (
        <div className="mt-3">
          <Section title="Heavily Armed">
            {HEAVILY_ARMED_TREE.map(node => {
              const owned = (prestige.heavilyArmedUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockHeavilyArmedTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.figures6TreeUnlocked && (
        <div className="mt-3">
          <Section title="Well-Read">
            {WELL_READ_TREE.map(node => {
              const owned = (prestige.wellReadUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockWellReadTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.figures7TreeUnlocked && (
        <div className="mt-3">
          <Section title="Book Smarts">
            {BOOK_SMARTS_TREE.map(node => {
              const owned = (prestige.bookSmartsUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockBookSmartsTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.cards4TreeUnlocked && (
        <div className="mt-3">
          <Section title="Ranged Mastery">
            {RANGED_MASTERY_TREE.map(node => {
              const owned = (prestige.rangedMasteryUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockRangedMasteryTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.stamps6TreeUnlocked && (
        <div className="mt-3">
          <Section title="Grizzled Veteran">
            {STAMPS6_TREE.map(node => {
              const owned = (prestige.stamps6Unlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockStamps6Tier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.stamps7TreeUnlocked && (
        <div className="mt-3">
          <Section title="Back with a Vengeance">
            {STAMPS7_TREE.map(node => {
              const owned = (prestige.backWithAVengeanceUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockStamps7Tier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.coins7TreeUnlocked && (
        <div className="mt-3">
          <Section title="Ancestral Memory">
            {ANCESTRAL_MEMORY_TREE.map(node => {
              const owned = (prestige.ancestralMemoryUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockAncestralMemoryTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      {prestige.figures8TreeUnlocked && (
        <div className="mt-3">
          <Section title="Factory Sealed">
            {FIGURES8_TREE.map(node => {
              const owned = (prestige.factorySealedUnlocked || []).includes(node.id);
              const canAfford = prestige.souls >= node.cost;
              return (
                <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${owned ? 'rare-glow' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: owned ? '#c9a4f7' : '#e7e2d0' }}>{node.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{node.desc}</div>
                  </div>
                  {owned ? <span className="text-[10px] dc-rare shrink-0">OWNED</span>
                    : <SmallBtn variant="primary" disabled={!canAfford} onClick={() => onUnlockFactorySealedTier(node.id)}>{node.cost} 👻</SmallBtn>}
                </div>
              );
            })}
          </Section>
        </div>
      )}
      <button onClick={onNewRun} className="dc-btn dc-btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 mt-4">
        <ArrowDownCircle size={16} /> Begin New Descent
      </button>
    </div>
  );
}

/* =========================================================
   GEAR EXAMINE — tap an equipped item to inspect it. Built from
   stacked glyph layers (the item's own emoji, extruded along Z)
   with a clamped drag-rotate range, so it never turns edge-on
   and thins out. See coin-examine-preview.jsx for the full
   design history/rationale behind this approach.
========================================================= */

const EXAMINE_LAYERS = 32;
const EXAMINE_THICKNESS = 34;
const EXAMINE_MAX_TILT = 55;

function EmojiSolid3D({ emoji, rarityColor, filter, flip, perfected }) {
  const half = EXAMINE_THICKNESS / 2;
  const step = EXAMINE_THICKNESS / (EXAMINE_LAYERS - 1);
  const flipScale = flip ? -1 : 1;
  const [hue, setHue] = useState(0);
  useEffect(() => {
    if (!perfected) return undefined;
    let raf;
    const tick = () => { setHue(h => (h + 3) % 360); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [perfected]);
  const baseFilter = perfected ? `hue-rotate(${hue}deg) saturate(2) brightness(1.2)` : filter;
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}>
      {Array.from({ length: EXAMINE_LAYERS }).map((_, i) => {
        const z = -half + i * step;
        const depthFrac = i / (EXAMINE_LAYERS - 1);
        const brightness = 0.5 + depthFrac * 0.5;
        const isFront = i === EXAMINE_LAYERS - 1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 100,
              transform: `scaleX(${flipScale}) translateZ(${z}px)`,
              filter: isFront
                ? `${baseFilter} brightness(${brightness}) drop-shadow(0 0 14px ${rarityColor}bb)`
                : `${baseFilter} brightness(${brightness})`,
              backfaceVisibility: 'hidden',
            }}
          >
            {emoji}
          </div>
        );
      })}
    </div>
  );
}

function ExamineRotatable({ children, size = 220 }) {
  const [rot, setRot] = useState({ x: -16, y: 25 });
  const [dragging, setDragging] = useState(false);
  const interacted = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const clock = useRef(0);

  const clamp = (v) => Math.max(-EXAMINE_MAX_TILT, Math.min(EXAMINE_MAX_TILT, v));

  useEffect(() => {
    function tick() {
      if (!interacted.current) {
        clock.current += 0.02;
        setRot(r => ({ ...r, y: Math.sin(clock.current) * EXAMINE_MAX_TILT }));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const start = (x, y) => { interacted.current = true; setDragging(true); last.current = { x, y }; };
  const move = (x, y) => {
    const dx = x - last.current.x, dy = y - last.current.y;
    last.current = { x, y };
    setRot(r => ({ x: clamp(r.x - dy * 0.5), y: clamp(r.y + dx * 0.5) }));
  };

  return (
    <div
      style={{ width: size, height: size, perspective: 900, touchAction: 'none' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start(e.clientX, e.clientY); }}
      onPointerMove={(e) => dragging && move(e.clientX, e.clientY)}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <div
        style={{
          width: '100%', height: '100%', transformStyle: 'preserve-3d',
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function GearExamineOverlay({ item, onClose }) {
  const rarityColor = item.rarity === 'mythic' ? '#5eead4' : item.rarity === 'legendary' ? '#ffd76a'
    : item.rarity === 'epic' ? '#ff9152' : item.rarity === 'rare' ? '#c9a4f7' : '#8fae6b';
  const emoji = item.emoji || getGearEmoji(item);
  // Enemies examined from the Bestiary carry their own colourway/flip (set
  // when their preferred emoji collided with another enemy's); gear items
  // never set these fields, so this is a no-op for gear.
  const composedFilter = item.emojiFilter ? `${getGearFilter(item.rarity)} ${item.emojiFilter}` : getGearFilter(item.rarity);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,9,12,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <ExamineRotatable>
          <EmojiSolid3D emoji={emoji} rarityColor={rarityColor} filter={composedFilter} flip={!!item.emojiFlip} perfected={!!item.factorySealed} />
        </ExamineRotatable>
        <div style={{ textAlign: 'center' }}>
          <div className="dc-display" style={{ fontSize: 15, color: '#e7e2d0' }}>{item.name}</div>
          <div className="dc-mono" style={{ fontSize: 10, color: rarityColor, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 2 }}>
            {item.rarity}{item.factorySealed ? ' · ✨ PERFECTED' : ''}
          </div>
          <div className="flex gap-3 justify-center mt-1 text-xs dc-mono" style={{ color: '#9a9788' }}>
            {item.atk ? <span className="dc-amber">+{item.atk} ATK</span> : null}
            {item.def ? <span style={{ color: '#7aa8c9' }}>+{item.def} DEF</span> : null}
          </div>
        </div>
        <div className="dc-mono" style={{ fontSize: 10, color: '#6b6f7a' }}>Drag to rotate</div>
        <SmallBtn onClick={onClose}>Close</SmallBtn>
      </div>
    </div>
  );
}

/* =========================================================
   ANATOMICAL EQUIPMENT DISPLAY — a paper-doll style layout:
   a faint knight silhouette with gear slots positioned at their
   anatomical location. Tap an occupied slot to examine it in 3D.
========================================================= */

function isEmptySlotItem(item) {
  return !item || item.id === 'fists' || item.id === 'rags' || (typeof item.id === 'string' && item.id.startsWith('no_'));
}

const BODY_SLOT_LABELS = {
  weapon: 'Weapon', weapon2: 'Off-Hand', armor: 'Armor', chestpiece: 'Cloak', greaves: 'Greaves', footwear: 'Footwear',
  ring1: 'Ring I', ring2: 'Ring II', ring3: 'Ring III', earring: 'Earring I', earring2: 'Earring II', headgear: 'Headgear',
  trinket: 'Trinket', necklace: 'Necklace',
};

const BODY_SLOT_LAYOUT = [
  { key: 'headgear',   top: '4%',  left: '50%' },
  { key: 'earring',    top: '12%', left: '37%' },
  { key: 'earring2',   top: '12%', left: '63%' },
  { key: 'necklace',   top: '20%', left: '50%' },
  { key: 'armor',      top: '29%', left: '50%' },
  { key: 'chestpiece', top: '48%', left: '50%' },
  { key: 'weapon',     top: '40%', left: '86%' },
  { key: 'weapon2',    top: '40%', left: '14%' },
  { key: 'trinket',    top: '58%', left: '86%' },
  { key: 'ring1',      top: '58%', left: '14%' },
  { key: 'ring2',      top: '67%', left: '14%' },
  { key: 'ring3',      top: '76%', left: '14%' },
  { key: 'greaves',    top: '66%', left: '50%' },
  { key: 'footwear',   top: '88%', left: '50%' },
];

function rarityColorFor(rarity) {
  return rarity === 'mythic' ? '#5eead4' : rarity === 'legendary' ? '#ffd76a'
    : rarity === 'epic' ? '#ff9152' : rarity === 'rare' ? '#c9a4f7' : '#8fae6b';
}

function BodySlotBox({ slotKey, item, onExamine }) {
  const empty = isEmptySlotItem(item);
  const emoji = empty ? '·' : getGearEmoji(item);
  const perfected = !empty && item.factorySealed;
  const filter = empty ? 'none' : getGearFilter(item.rarity);
  const rarityColor = empty ? '#3a3e4a' : (perfected ? '#ffffff' : rarityColorFor(item.rarity));
  return (
    <button
      onClick={() => !empty && onExamine(item)}
      disabled={empty}
      title={empty ? `${BODY_SLOT_LABELS[slotKey]}: empty` : item.name}
      className={perfected ? 'factory-sealed-gloss' : ''}
      style={{
        width: 42, height: 42, borderRadius: 8,
        background: '#1e2029',
        border: `1.5px solid ${empty ? '#33363f' : rarityColor}`,
        boxShadow: empty ? 'none' : `0 0 10px ${rarityColor}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: empty ? 14 : 20,
        filter: perfected ? undefined : filter,
        cursor: empty ? 'default' : 'pointer',
        zIndex: 2,
        position: 'relative',
      }}
    >
      {emoji}
    </button>
  );
}

// Built from plain shapes rather than an emoji glyph — an emoji's internal
// proportions aren't something we can see or control, so slot positions
// tuned against one drift out of place (e.g. torso gear reading as headgear).
// These shapes are exact, so slot coordinates below line up with them for real.
function KnightSilhouette() {
  const fill = '#20222c';
  const stroke = '#33363f';
  const shape = (style) => ({
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    background: fill,
    border: `2px solid ${stroke}`,
    ...style,
  });
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* head */}
      <div style={shape({ top: '13%', left: '50%', width: 46, height: 46, borderRadius: '50%' })} />
      {/* neck */}
      <div style={shape({ top: '22%', left: '50%', width: 16, height: 10, borderRadius: 3 })} />
      {/* torso */}
      <div style={shape({ top: '42%', left: '50%', width: 92, height: 100, borderRadius: 18 })} />
      {/* arms */}
      <div style={shape({ top: '41%', left: '22%', width: 20, height: 86, borderRadius: 10 })} />
      <div style={shape({ top: '41%', left: '78%', width: 20, height: 86, borderRadius: 10 })} />
      {/* legs */}
      <div style={shape({ top: '76%', left: '39%', width: 28, height: 88, borderRadius: 10 })} />
      <div style={shape({ top: '76%', left: '61%', width: 28, height: 88, borderRadius: 10 })} />
    </div>
  );
}

function AnatomicalBody({ player, onExamine }) {
  const slots = BODY_SLOT_LAYOUT.filter(s => player[s.key]);
  return (
    <div style={{ position: 'relative', height: 335, marginBottom: 4 }}>
      <KnightSilhouette />
      {slots.map(s => (
        <div
          key={s.key}
          style={{
            position: 'absolute', top: s.top, left: s.left, transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, zIndex: 2,
          }}
        >
          <BodySlotBox slotKey={s.key} item={player[s.key]} onExamine={onExamine} />
          <span style={{ fontSize: 8, color: '#6b6f7a', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {BODY_SLOT_LABELS[s.key]}
          </span>
        </div>
      ))}
    </div>
  );
}

function EquipmentPanel({ player }) {
  const [examining, setExamining] = useState(null);
  return (
    <div className="p-3 space-y-3">
      <AnatomicalBody player={player} onExamine={setExamining} />
      {player.throwable && (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
          <div className="flex items-center gap-2 min-w-0">
            <span>🔪</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest" style={{ color: '#9a9788' }}>Throwable</div>
              <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{player.throwable.name}</div>
            </div>
          </div>
          <span className="text-[10px] dc-mono" style={{ color: '#9a9788' }}>×{player.throwableCount}</span>
        </div>
      )}
      <div>
        <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>ABILITIES</div>
        {player.abilities.length === 0 ? (
          <p className="text-xs" style={{ color: '#9a9788' }}>No special techniques learned. Rare skill books may unlock them.</p>
        ) : (
          <div className="space-y-1.5">
            {player.abilities.map(a => (
              <div key={a} className="dc-panel-raised rounded px-2 py-1.5">
                <div className="text-xs dc-rare">{ABILITY_INFO[a].name}</div>
                <div className="text-[11px]" style={{ color: '#9a9788' }}>{ABILITY_INFO[a].desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>RELICS</div>
        {(!player.keyItems || player.keyItems.length === 0) ? (
          <p className="text-xs" style={{ color: '#9a9788' }}>No relics found yet. Rare and legendary foes sometimes carry them.</p>
        ) : (
          <div className="space-y-1.5">
            {player.keyItems.map(id => {
              const ki = KEY_ITEMS.find(k => k.id === id) || EXCLUSIVE_RELICS.find(k => k.id === id);
              if (!ki) return null;
              const ammoLabel = id === 'handcannon' ? `${player.bullets || 0} Bullets` : id === 'bow' ? `${player.arrows || 0} Arrows` : null;
              return (
                <div key={id} className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{ki.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs dc-amber">{ki.name}</div>
                      <div className="text-[11px]" style={{ color: '#9a9788' }}>{ki.desc}</div>
                    </div>
                  </div>
                  {ammoLabel && <span className="text-[10px] dc-mono shrink-0" style={{ color: '#9a9788' }}>{ammoLabel}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>LUCK & EVASION</div>
        <p className="text-xs" style={{ color: '#9a9788' }}>
          🍀 {getLuck(player)} luck — every collectible and relic nudges fortune your way: better drops, steadier flights, sharper instincts.
        </p>
        {player.dodgeChance > 0 && (
          <p className="text-xs mt-1" style={{ color: '#9a9788' }}>
            💨 {player.dodgeChance}% chance to fully evade an enemy attack (from prestige training).
          </p>
        )}
      </div>
      {examining && <GearExamineOverlay item={examining} onClose={() => setExamining(null)} />}
    </div>
  );
}

function PackPanel({ player, room, dispatch }) {
  const empty = player.weaponsBag.length === 0 && player.armorsBag.length === 0
    && player.accessoriesBag.length === 0 && player.skillbooksBag.length === 0
    && (player.chestpiecesBag || []).length === 0 && (player.greavesBag || []).length === 0 && (player.footwearBag || []).length === 0
    && (player.headgearBag || []).length === 0
    && (player.trinketsBag || []).length === 0
    && (player.necklacesBag || []).length === 0
    && (player.throwablesBag || []).length === 0
    && (player.maps || 0) === 0;
  const mapsLocked = isCombatRoom(room.type) && !room.cleared;

  return (
    <div className="p-3 space-y-3">
      {empty && <p className="text-xs" style={{ color: '#9a9788' }}>Nothing but dust and echoes. Defeat enemies to find gear.</p>}

      {player.maps > 0 && (
        <Section title="Maps">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised legendary-glow">
            <div className="flex items-center gap-2">
              <span className="text-base">🗺️</span>
              <div>
                <div className="text-xs" style={{ color: '#e7e2d0' }}>Tattered Map ×{player.maps}</div>
                <div className="text-[10px]" style={{ color: '#9a9788' }}>Tears open a Legendary Rift with epic and legendary spoils.</div>
              </div>
            </div>
            <SmallBtn variant="primary" disabled={mapsLocked} onClick={() => dispatch({ type: 'USE_MAP' })}>Open Rift</SmallBtn>
          </div>
        </Section>
      )}

      {(player.throwablesBag || []).length > 0 && (
        <Section title="Throwables">
          {player.throwablesBag.map((stack, idx) => (
            <div key={stack.uid} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised">
              <div className="flex items-center gap-2 min-w-0">
                <span>🔪</span>
                <div className="min-w-0">
                  <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{stack.name} ×{stack.count}</div>
                  <div className="text-[10px] dc-amber">+{stack.atk} per throw</div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP_THROWABLE', payload: idx })}>Equip</SmallBtn>
                <SmallBtn onClick={() => dispatch({ type: 'SELL_THROWABLE', payload: idx })}>Sell</SmallBtn>
              </div>
            </div>
          ))}
        </Section>
      )}

      {player.weaponsBag.length > 0 && (
        <Section title="Weapons">
          {player.weaponsBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'weapon', idx, slot: 'weapon' } })}>Equip</SmallBtn>
              {player.weapon2 && <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'weapon', idx, slot: 'weapon2' } })}>Weapon II</SmallBtn>}
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'weapon', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.armorsBag.length > 0 && (
        <Section title="Armor">
          {player.armorsBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'armor', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'armor', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.chestpiece && (player.chestpiecesBag || []).length > 0 && (
        <Section title="Cloaks">
          {player.chestpiecesBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'chestpiece', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'chestpiece', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.headgear && (player.headgearBag || []).length > 0 && (
        <Section title="Headgear">
          {player.headgearBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'headgear', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'headgear', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.trinket && (player.trinketsBag || []).length > 0 && (
        <Section title="Trinkets">
          {player.trinketsBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'trinket', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'trinket', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.necklace && (player.necklacesBag || []).length > 0 && (
        <Section title="Necklaces">
          {player.necklacesBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'necklace', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'necklace', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.greaves && (player.greavesBag || []).length > 0 && (
        <Section title="Greaves">
          {player.greavesBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'greaves', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'greaves', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.footwear && (player.footwearBag || []).length > 0 && (
        <Section title="Footwear">
          {player.footwearBag.map((item, idx) => (
            <ItemRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'footwear', idx } })}>Equip</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'footwear', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}

      {player.accessoriesBag.length > 0 && (
        <Section title="Accessories">
          {player.accessoriesBag.map((item, idx) => {
            const colorCls = item.rarity === 'legendary' ? 'dc-legendary' : item.rarity === 'epic' ? 'dc-epic' : item.rarity === 'rare' ? 'dc-rare' : 'dc-common';
            return (
              <div key={item.uid} className={`px-2 py-2 rounded dc-panel-raised ${glowClass(item.rarity)} ${item.factorySealed ? 'factory-sealed-gloss' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Gem size={14} className={item.factorySealed ? '' : colorCls} style={item.factorySealed ? { color: '#fff' } : undefined} />
                  <div>
                    <div className="text-xs" style={{ color: '#e7e2d0' }}>{item.name}</div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <RarityTag rarity={item.rarity} />
                      {item.factorySealed && <span className="text-[10px]" style={{ color: '#fff' }}>✨ PERFECTED</span>}
                      {item.atk ? <span className="text-[10px] dc-amber">+{item.atk} ATK</span> : null}
                      {item.def ? <span className="text-[10px]" style={{ color: '#7aa8c9' }}>+{item.def} DEF</span> : null}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {item.type === 'earring' ? (
                    <>
                      <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'accessory', idx, slot: 'earring' } })}>Earring I</SmallBtn>
                      {player.earring2 && <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'accessory', idx, slot: 'earring2' } })}>Earring II</SmallBtn>}
                      <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'accessory', idx } })}>Sell</SmallBtn>
                    </>
                  ) : (
                    <>
                      <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'accessory', idx, slot: 'ring1' } })}>Ring I</SmallBtn>
                      <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'accessory', idx, slot: 'ring2' } })}>Ring II</SmallBtn>
                      {player.ring3 && <SmallBtn variant="primary" onClick={() => dispatch({ type: 'EQUIP', payload: { bag: 'accessory', idx, slot: 'ring3' } })}>Ring III</SmallBtn>}
                      <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'accessory', idx } })}>Sell</SmallBtn>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {player.skillbooksBag.length > 0 && (
        <Section title="Skill Books & Runes">
          {player.skillbooksBag.map((item, idx) => (
            <SkillbookRow key={item.uid} item={item} actions={<>
              <SmallBtn variant="primary" onClick={() => dispatch({ type: 'READ_BOOK', payload: idx })}>Read</SmallBtn>
              <SmallBtn onClick={() => dispatch({ type: 'SELL', payload: { bag: 'skillbook', idx } })}>Sell</SmallBtn>
            </>} />
          ))}
        </Section>
      )}
    </div>
  );
}

function SkillTreePanel({ player, prestige, dispatch }) {
  const maxDepthReached = player.maxDepthReached || 1;
  const totalPoints = Math.floor(maxDepthReached / 5);
  const unlocked = player.skillsUnlocked || [];
  const available = totalPoints - unlocked.length;
  const coinsTradedIn = prestige?.coinsTradedIn || false;
  const stamps5Unlocked = prestige?.stamps5TreeUnlocked || false;
  const branches = [
    { id: 'vigor', label: 'Vigor' },
    { id: 'might', label: 'Might' },
    { id: 'fortune', label: 'Fortune' },
  ];

  return (
    <div className="p-3 space-y-3">
      <div className="dc-panel-raised rounded px-2 py-1.5 text-xs" style={{ color: '#9a9788' }}>
        Skill Points: <span className="dc-amber">{available}</span> available
        <span className="block text-[10px] mt-0.5">{unlocked.length} learned · {totalPoints} earned (1 per 5 depths, deepest reached: {maxDepthReached})</span>
      </div>
      {!coinsTradedIn && (
        <div className="dc-panel-raised rounded px-2 py-1.5 text-[10px]" style={{ color: '#6b6f7a' }}>
          🪙 Tiers V-X are locked. Trade in 50 coins in your Collection to unlock them.
        </div>
      )}
      {!stamps5Unlocked && (
        <div className="dc-panel-raised rounded px-2 py-1.5 text-[10px]" style={{ color: '#6b6f7a' }}>
          📮 Tiers XI-XV are locked. Trade in a fifth 50 stamps in your Collection to unlock them.
        </div>
      )}
      {branches.map(b => {
        const branchNodes = SKILL_TREE.filter(n => n.branch === b.id);
        const current = [...branchNodes].reverse().find(n => unlocked.includes(n.id)) || null;
        const next = branchNodes.find(n => !unlocked.includes(n.id));
        return (
          <Section key={b.id} title={b.label}>
            {current && (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised rare-glow">
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: '#c9a4f7' }}>{current.name}</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>{current.desc}</div>
                </div>
                <span className="text-[10px] dc-rare shrink-0">CURRENT</span>
              </div>
            )}
            {!next ? (
              <div className="px-2 py-1.5 text-[10px]" style={{ color: '#6b6f7a' }}>All tiers learned.</div>
            ) : (() => {
              const isLocked = (next.requiresCoinsTradedIn && !coinsTradedIn) || (next.requiresStamps5TradedIn && !stamps5Unlocked);
              const prereqOk = !next.requires || unlocked.includes(next.requires);
              const depthOk = maxDepthReached >= next.reqDepth;
              const canUnlock = prereqOk && depthOk && !isLocked && available > 0;
              return (
                <div className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${isLocked ? 'opacity-40' : ''}`}>
                  <div className="min-w-0">
                    <div className="text-xs" style={{ color: isLocked ? '#5a5d68' : '#e7e2d0' }}>{next.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>
                      {next.desc}
                      {isLocked && next.requiresCoinsTradedIn ? ' · requires coin trade-in' : ''}
                      {isLocked && next.requiresStamps5TradedIn ? ' · requires 5th stamp trade-in' : ''}
                      {!isLocked && !depthOk ? ` · requires depth ${next.reqDepth}` : ''}
                    </div>
                  </div>
                  {isLocked ? (
                    <span className="text-[10px] shrink-0" style={{ color: '#5a5d68' }}>🔒</span>
                  ) : (
                    <SmallBtn variant="primary" disabled={!canUnlock} onClick={() => dispatch({ type: 'UNLOCK_SKILL', payload: next.id })}>Unlock</SmallBtn>
                  )}
                </div>
              );
            })()}
          </Section>
        );
      })}
    </div>
  );
}

function CollectionPanel({ player, prestige, dispatch }) {
  const { collectibles, collectibleNames, pendingNames, discoveryOrder } = player;
  const [selected, setSelected] = React.useState(null); // { category, index } | null
  return (
    <div className="p-3 space-y-4">
      {discoveryOrder && discoveryOrder.length > 0 && (
        <div>
          <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>RECENT FINDS</div>
          <div className="space-y-1">
            {discoveryOrder.map((d, i) => {
              const meta = COLLECTIBLE_META[d.category];
              const isPending = (pendingNames || []).some(p => p.category === d.category && p.index === d.index);
              const name = collectibleNames?.[d.category]?.[d.index];
              return (
                <div key={`${d.category}-${d.index}-${i}`} className="flex items-center gap-2 text-xs dc-panel-raised rounded px-2 py-1">
                  <span>{meta.icon}</span>
                  <span className={isPending ? 'dc-narration-loading' : ''} style={{ color: isPending ? '#9a9788' : '#e7e2d0' }}>
                    {name || (isPending ? 'Identifying...' : COLLECTIBLE_NAMES[d.category][d.index])}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {Object.keys(COLLECTIBLE_META).map(cat => {
        const owned = collectibles[cat] || [];
        const meta = COLLECTIBLE_META[cat];
        const isComplete = owned.length >= 50;
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="dc-display text-sm flex items-center gap-2" style={{ color: '#e7e2d0' }}>
                <span>{meta.icon}</span> {meta.label}
              </span>
              <span className="text-[11px] dc-mono" style={{ color: '#9a9788' }}>{owned.length}/50</span>
            </div>
            <div className="grid grid-cols-10 gap-1 mb-1.5">
              {Array.from({ length: 50 }).map((_, i) => {
                const has = owned.includes(i);
                const isSelected = selected && selected.category === cat && selected.index === i;
                const title = has ? getCollectibleName(player, cat, i) : '???';
                return (
                  <button
                    key={i}
                    title={title}
                    disabled={!has}
                    onClick={() => setSelected(isSelected ? null : { category: cat, index: i })}
                    className="aspect-square rounded flex items-center justify-center text-[11px]"
                    style={{
                      background: has ? (isSelected ? '#33363f' : '#262936') : '#11121a',
                      color: has ? '#e8c468' : '#3a3e4a',
                      border: isSelected ? '1px solid #e8a23d' : has ? '1px solid #3a3e4a' : '1px solid #22242c',
                      cursor: has ? 'pointer' : 'default',
                    }}
                  >
                    {has ? meta.icon : '·'}
                  </button>
                );
              })}
            </div>
            {selected && selected.category === cat && (
              <div className="dc-panel-raised rounded px-2 py-1.5 mb-2">
                <div className="text-xs mb-0.5" style={{ color: '#e8c468' }}>
                  {meta.icon} {getCollectibleName(player, cat, selected.index)}
                </div>
                <div className="text-[11px] italic" style={{ color: '#c8c3b0' }}>
                  {getCollectibleFlavour(cat, selected.index)}
                </div>
              </div>
            )}
            {cat === 'cards' && (
              !player.bestiaryUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade all 50 cards to permanently unlock the Bestiary.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_BESTIARY' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.cards2Unlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a second 50 cards to unlock Bestiary tiers 4-6 (100/150/200 kills).</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_CARDS2' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.cards3Unlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a third 50 cards to unlock Bestiary tiers 7-9 (300/400/500 kills).</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_CARDS3' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.cards4TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fourth 50 cards to unlock the Ranged Mastery prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_CARDS4_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.cards5Unlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fifth 50 cards to unlock Bestiary tiers 10-12 (700/900/1200 kills).</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_CARDS5' })}>Trade In</SmallBtn>
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>📖 All Bestiary tiers unlocked. Keep collecting.</p>
              )
            )}
            {cat === 'coins' && (
              !prestige?.coinsTradedIn ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade all 50 coins to unlock Vigor, Might, and Fortune tiers V-X.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins2TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a second 50 coins to unlock the Blade Mastery prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS2_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins3TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a third 50 coins to unlock the Slicing Giants prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS3_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins4TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fourth 50 coins to unlock the Grand Library room.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS4_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins5TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fifth 50 coins to unlock the Wealth prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS5_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins6TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a sixth 50 coins to unlock the Secret Tunnel room.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS6_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.coins7TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a seventh 50 coins to unlock the Ancestral Memory prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_COINS7_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>🧬 Ancestral Memory unlocked. Keep collecting.</p>
              )
            )}
            {cat === 'stamps' && (
              !prestige?.readyOrNotTreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade all 50 stamps to unlock the "Ready or Not" prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_READY_OR_NOT_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps2TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a second 50 stamps to unlock "Physician Heal Thyself".</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS2_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps3TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a third 50 stamps to unlock the Relic Room.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS3_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps4TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fourth 50 stamps to unlock the Health prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS4_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps5TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fifth 50 stamps to unlock Skill tiers XI-XV.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS5_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps6TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a sixth 50 stamps to unlock the Grizzled Veteran prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS6_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.stamps7TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a seventh 50 stamps to unlock the Back with a Vengeance prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_STAMPS7_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>⚔️ Back with a Vengeance unlocked. Keep collecting.</p>
              )
            )}
            {cat === 'figures' && (
              !prestige?.betterMerchantTreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade all 50 figures to unlock the "Better Merchant" prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_BETTER_MERCHANT_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures2TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a second 50 figures to unlock "Luck of the Madgod".</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES2_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures3TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a third 50 figures to unlock the Wheel of Fortune room.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES3_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures4TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fourth 50 figures to unlock the (very rare) Deluxe Merchant.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES4_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures5TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a fifth 50 figures to unlock the Heavily Armed prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES5_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures6TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a sixth 50 figures to unlock the Well-Read prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES6_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures7TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade a seventh 50 figures to unlock the Book Smarts prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES7_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : !prestige?.figures8TreeUnlocked ? (
                <div className="dc-panel-raised rounded px-2 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px]" style={{ color: '#9a9788' }}>Trade an eighth 50 figures to unlock the Factory Sealed prestige tree.</span>
                  <SmallBtn variant="primary" disabled={!isComplete} onClick={() => dispatch({ type: 'UNLOCK_FIGURES8_TREE' })}>Trade In</SmallBtn>
                </div>
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>✨ Factory Sealed unlocked. Keep collecting.</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function BestiaryPanel({ player }) {
  const kills = player.kills || {};
  const [selected, setSelected] = React.useState(null);
  const [examining, setExamining] = React.useState(null);
  const known = ENEMY_TYPES.filter(e => (kills[e.id] || 0) > 0);
  const selectedEnemy = selected ? ENEMY_TYPES.find(e => e.id === selected) : null;

  return (
    <div>
      <div className="text-[11px] dc-display tracking-widest mb-1.5" style={{ color: '#9a9788' }}>📖 BESTIARY</div>
      {known.length === 0 ? (
        <p className="text-xs" style={{ color: '#9a9788' }}>No kills recorded yet. The pages are blank.</p>
      ) : selectedEnemy ? (
        <div className="dc-panel-raised rounded p-3">
          <button onClick={() => setSelected(null)} className="text-[10px] dc-amber mb-2 block">← Back to index</button>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setExamining(selectedEnemy)}
              className="text-2xl"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1, ...enemyEmojiStyle(selectedEnemy) }}
              title="Tap to examine"
            >
              {selectedEnemy.emoji}
            </button>
            <div>
              <div className="text-sm dc-display" style={{ color: '#e7e2d0' }}>{selectedEnemy.name}</div>
              <RarityTag rarity={selectedEnemy.rarity} />
            </div>
          </div>
          <p className="text-xs italic mb-3" style={{ color: '#c8c3b0', borderLeft: '2px solid #3a3e4a', paddingLeft: '8px' }}>
            {BESTIARY_FLAVOUR[selectedEnemy.id] || 'A dangerous creature of the deep.'}
          </p>
          <div className="space-y-1 text-[11px] dc-mono" style={{ color: '#9a9788' }}>
            <div>Kills: <span style={{ color: '#e7e2d0' }}>{kills[selectedEnemy.id] || 0}</span></div>
            <div>ATK: <span style={{ color: '#e7e2d0' }}>{selectedEnemy.atk}</span> · DEF: <span style={{ color: '#e7e2d0' }}>{selectedEnemy.def}</span> · HP: <span style={{ color: '#e7e2d0' }}>{selectedEnemy.hp}</span></div>
          </div>
          {(() => {
            const tier = bestiaryTierFor(player, selectedEnemy.id);
            const thresholds = player.cards5Unlocked ? BESTIARY_THRESHOLDS_EXTENDED3
              : player.cards3Unlocked ? BESTIARY_THRESHOLDS_EXTENDED2
              : player.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE;
            const maxTier = thresholds.length;
            return tier > 0 ? (
              <div className="mt-2 text-[11px] dc-rare">
                Combat Bonus (Tier {tier}/{maxTier}): +{tier * 2}% ATK, +{tier * 2}% DEF, +{tier * 2}% dodge vs this foe
              </div>
            ) : (
              <div className="mt-2 text-[11px]" style={{ color: '#9a9788' }}>
                Kill {thresholds[0]} to earn combat bonuses against this foe.
              </div>
            );
          })()}
          <div className="mt-2 flex flex-wrap gap-2.5">
            {(player.cards5Unlocked ? BESTIARY_THRESHOLDS_EXTENDED3 : player.cards3Unlocked ? BESTIARY_THRESHOLDS_EXTENDED2 : player.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE).map(t => {
              const count = kills[selectedEnemy.id] || 0;
              const done = count >= t;
              return (
                <div key={t} className="text-[10px] text-center" style={{ color: done ? '#c9a4f7' : '#5a5d68' }}>
                  <div>{done ? '✓' : '○'}</div>
                  <div>{t}</div>
                </div>
              );
            })}
          </div>
          {examining && <GearExamineOverlay item={examining} onClose={() => setExamining(null)} />}
        </div>
      ) : (
        <div className="space-y-1">
          {(() => {
            const maxTier = (player.cards5Unlocked ? BESTIARY_THRESHOLDS_EXTENDED3 : player.cards3Unlocked ? BESTIARY_THRESHOLDS_EXTENDED2 : player.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE).length;
            return known.map(e => {
              const count = kills[e.id] || 0;
              const tier = bestiaryTierFor(player, e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => setSelected(e.id)}
                  className="w-full flex items-center justify-between gap-2 dc-panel-raised rounded px-2 py-1.5 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span style={enemyEmojiStyle(e)}>{e.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{e.name}</div>
                      <div className="text-[10px]" style={{ color: '#9a9788' }}>{count} kill{count === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <span className="text-[10px] dc-rare shrink-0">Tier {tier}/{maxTier} ›</span>
                </button>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

function AtlasPanel({ prestige }) {
  const [selected, setSelected] = React.useState(null);
  const visits = prestige.biomeVisits || {};

  if (selected !== null) {
    const biome = BIOMES[selected];
    const v = visits[selected] || 0;
    const discovered = v > 0;
    return (
      <div className="dc-panel-raised rounded p-3">
        <button onClick={() => setSelected(null)} className="text-[10px] dc-amber mb-2 block">← Back to Atlas</button>
        {!discovered ? (
          <>
            <div className="text-sm dc-display mb-1" style={{ color: '#5a5d68' }}>??? — Undiscovered</div>
            <p className="text-xs italic" style={{ color: '#6b6f7a' }}>
              You haven't set foot here yet. The Atlas can only record what you've actually seen.
            </p>
          </>
        ) : (
          <>
            <div className="text-sm dc-display mb-1" style={{ color: '#e7e2d0' }}>{biome.name}</div>
            <p className="text-xs italic mb-3" style={{ color: '#c8c3b0', borderLeft: '2px solid #3a3e4a', paddingLeft: '8px' }}>
              {BIOME_LORE[selected]}
            </p>
            <div className="text-[11px] dc-mono mb-2" style={{ color: '#9a9788' }}>
              Lifetime visits: <span style={{ color: '#e7e2d0' }}>{v}</span>
            </div>
            <div className="space-y-1.5">
              {ATLAS_TIERS.map((t, i) => {
                const reached = v >= t;
                const gear = buildBiomeGear(selected, i + 1);
                return (
                  <div key={t} className={`px-2 py-1.5 rounded dc-panel-raised ${reached ? 'mythic-glow' : ''}`}>
                    <div className="text-[11px]" style={{ color: reached ? '#5eead4' : '#5a5d68' }}>
                      {reached ? '✓' : '○'} {t} Visits — {gear.weapon.name} &amp; {gear.armor.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {BIOMES.map((biome, i) => {
        const v = visits[i] || 0;
        const discovered = v > 0;
        const tier = ATLAS_TIERS.filter(t => v >= t).length;
        return (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className="w-full flex items-center justify-between gap-2 dc-panel-raised rounded px-2 py-1.5 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs truncate" style={{ color: discovered ? '#e7e2d0' : '#5a5d68' }}>
                {discovered ? biome.name : '??? — Undiscovered'}
              </div>
              <div className="text-[10px]" style={{ color: '#9a9788' }}>{v} visit{v === 1 ? '' : 's'}</div>
            </div>
            {discovered && <span className="text-[10px] shrink-0" style={{ color: '#5eead4' }}>Tier {tier}/3 ›</span>}
          </button>
        );
      })}
    </div>
  );
}

/* =========================================================
   TITLE SCREEN
========================================================= */

function TitleScreen({ onStart }) {
  const [name, setName] = useState('');

  const handleStart = () => {
    onStart(name.trim());
  };

  return (
    <div className="flex items-center justify-center px-4" style={{ minHeight: '100vh' }}>
      <div className="title-vignette" />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <Flame className="torch-icon dc-amber mx-auto mb-3" size={40} />
          <div className="dc-display title-heading text-4xl mb-2" style={{ color: '#e8a23d' }}>THE DEEPING</div>
          <p className="text-xs tracking-widest uppercase" style={{ color: '#6b6f7a' }}>An Endless Descent</p>
        </div>

        <div className="dc-panel rounded p-4 mb-4">
          <label className="text-[11px] dc-display tracking-widest mb-2 block" style={{ color: '#9a9788' }}>
            WHO ENTERS THE DARK?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 24))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
            placeholder="Name your wanderer..."
            className="title-input w-full px-3 py-2.5 rounded text-sm"
            autoFocus
          />
          <p className="text-[10px] mt-2" style={{ color: '#5a5d68' }}>
            Some names are remembered by the dungeon itself.
          </p>
        </div>

        <button onClick={handleStart} className="dc-btn dc-btn-primary w-full py-3 text-sm flex items-center justify-center gap-2">
          <ArrowDownCircle size={18} /> Descend
        </button>

        <p className="text-center text-[10px] mt-6" style={{ color: '#5a5d68' }}>
          autosaving each step · the dungeon never ends
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   GLOBAL STYLE
========================================================= */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');

      .dc-root { background: #14151b; color: #e7e2d0; font-family: 'JetBrains Mono', monospace; min-height: 100vh; position: relative; transition: background-image 1.2s ease; }

      .title-vignette {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.5) 100%);
        pointer-events: none;
      }
      .title-heading { letter-spacing: 0.08em; text-shadow: 0 0 24px rgba(232,162,61,0.35); }
      .title-input {
        background: #11121a; border: 1px solid #3a3e4a; color: #e7e2d0;
        font-family: 'JetBrains Mono', monospace; outline: none; transition: border-color .15s ease;
      }
      .title-input:focus { border-color: #e8a23d; }
      .title-input::placeholder { color: #5a5d68; }
      .dc-display { font-family: 'Cinzel', serif; }
      .dc-mono { font-family: 'JetBrains Mono', monospace; }
      .dc-panel { background: #1e2029; border: 1px solid #33363f; }
      .dc-panel-raised { background: #262936; border: 1px solid #3a3e4a; }
      .dc-amber { color: #e8a23d; }
      .dc-common { color: #8fae6b; }
      .dc-rare { color: #c9a4f7; }
      .dc-epic { color: #ff9152; }
      .dc-legendary { color: #ffd76a; }
      .dc-mythic { color: #5eead4; }
      .dc-gold { color: #e8c468; }

      .torch-icon { animation: flicker 2.2s ease-in-out infinite; }
      @keyframes flicker {
        0%, 100% { opacity: 1; filter: brightness(1); transform: translateY(0); }
        25% { opacity: .85; filter: brightness(1.2); transform: translateY(-1px); }
        50% { opacity: .95; filter: brightness(.9); }
        75% { opacity: 1; filter: brightness(1.1); transform: translateY(1px); }
      }

      .dc-narration-loading { animation: dimPulse 1.6s ease-in-out infinite; }
      @keyframes dimPulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }

      .hp-fill { transition: width .4s ease; }
      .hp-fill-hp { background: linear-gradient(90deg, #c0392b, #e0584a); }
      .hp-fill-xp { background: linear-gradient(90deg, #355e7a, #7aa8c9); }
      .hp-critical { animation: pulseRed 1s ease-in-out infinite; }
      @keyframes pulseRed {
        0%, 100% { box-shadow: 0 0 0 0 rgba(224,88,74,0.5); }
        50% { box-shadow: 0 0 8px 1px rgba(224,88,74,0.6); }
      }

      .rare-glow { box-shadow: 0 0 8px rgba(201,164,247,0.35); border-color: #c9a4f7 !important; }
      .epic-glow { box-shadow: 0 0 10px rgba(255,145,82,0.45); border-color: #ff9152 !important; }
      .legendary-glow { box-shadow: 0 0 14px rgba(255,215,106,0.55); border-color: #ffd76a !important; }
      .mythic-glow { box-shadow: 0 0 16px rgba(94,234,212,0.6); border-color: #5eead4 !important; }

      @keyframes rainbow-gloss {
        0%   { filter: hue-rotate(0deg) saturate(2) brightness(1.2); }
        100% { filter: hue-rotate(360deg) saturate(2) brightness(1.2); }
      }
      .factory-sealed-gloss {
        animation: rainbow-gloss 3s linear infinite;
        box-shadow: 0 0 12px rgba(255,255,255,0.5);
        border-color: #ffffff !important;
      }

      .enemy-card { cursor: pointer; transition: all .15s ease; }
      .enemy-card.selected { border-color: #e8a23d !important; box-shadow: 0 0 0 1px #e8a23d inset; }
      .enemy-card.dead { opacity: .35; cursor: default; }
      .enemy-card:disabled { cursor: default; }

      .tab-btn { border-bottom: 2px solid transparent; transition: all .15s ease; }
      .tab-active { border-bottom: 2px solid #e8a23d; }

      .dc-btn { font-family: 'JetBrains Mono', monospace; font-weight: 600; border-radius: 4px; border: 1px solid #3a3e4a; transition: all .15s ease; }
      .dc-btn:disabled { opacity: .4; cursor: not-allowed; }
      .dc-btn-primary { background: #e8a23d; color: #14151b; border-color: #e8a23d; }
      .dc-btn-primary:hover:not(:disabled) { background: #f4b65a; }
      .dc-btn-ghost { background: #262936; color: #e7e2d0; }
      .dc-btn-ghost:hover:not(:disabled) { background: #33363f; }
      .dc-btn-danger { background: #7a2e25; color: #f3d9d4; border-color: #7a2e25; }
      .dc-btn-danger:hover:not(:disabled) { background: #94392e; }
    `}</style>
  );
}
