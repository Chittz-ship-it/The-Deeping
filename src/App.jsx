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
   DATA
========================================================= */

const GAME_VERSION = '1.00';

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
];

function currentBiome(depth) {
  return Math.floor((depth - 1) / 10) % BIOMES.length;
}

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
  { id: 'sunken_god',      name: 'Sunken God-Idol',   rarity: 'rare',   weight: 1,  hp: 125, atk: 21, def: 8,  xpBase: 102, goldMin: 58, goldMax: 108, emoji: '🗿', biome: 4 },

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
  { id: 'candlewax_ghost',  name: 'Candlewax Ghost',    rarity: 'common', weight: 24, hp: 40, atk: 15, def: 3, xpBase: 23, goldMin: 11, goldMax: 19, emoji: '🕯️', biome: 6 },
  { id: 'bone_chorister',   name: 'Bone Chorister',     rarity: 'common', weight: 24, hp: 43, atk: 14, def: 5, xpBase: 23, goldMin: 11, goldMax: 19, emoji: '💀', biome: 6 },
  { id: 'sepulcher_titan',  name: 'Sepulcher Titan',    rarity: 'rare',   weight: 1,  hp: 145, atk: 26, def: 12, xpBase: 120, goldMin: 65, goldMax: 125, emoji: '🗿', biome: 6 },
  { id: 'reliquary_seraph', name: 'Reliquary Seraph',   rarity: 'rare',   weight: 1,  hp: 138, atk: 28, def: 10, xpBase: 122, goldMin: 65, goldMax: 128, emoji: '😇', biome: 6 },
  { id: 'osteomancer',      name: 'Osteomancer',        rarity: 'rare',   weight: 1,  hp: 140, atk: 27, def: 11, xpBase: 124, goldMin: 66, goldMax: 130, emoji: '🧙', biome: 6 },
  { id: 'undying_curator',  name: 'Undying Curator',    rarity: 'rare',   weight: 1,  hp: 150, atk: 25, def: 13, xpBase: 126, goldMin: 68, goldMax: 132, emoji: '👑', biome: 6 },

  // --- Biome 7: The Shattered Meridian ---
  { id: 'glasswing_stalker',  name: 'Glasswing Stalker',   rarity: 'common', weight: 24, hp: 47, atk: 16, def: 4, xpBase: 24, goldMin: 11, goldMax: 20, emoji: '🦋', biome: 7 },
  { id: 'mirrorborn_wraith',  name: 'Mirrorborn Wraith',   rarity: 'common', weight: 24, hp: 44, atk: 17, def: 3, xpBase: 24, goldMin: 11, goldMax: 20, emoji: '🪞', biome: 7 },
  { id: 'prism_horror',       name: 'Prism Horror',        rarity: 'common', weight: 24, hp: 50, atk: 15, def: 6, xpBase: 25, goldMin: 12, goldMax: 21, emoji: '💎', biome: 7 },
  { id: 'shard_golem',        name: 'Shard Golem',         rarity: 'common', weight: 24, hp: 52, atk: 14, def: 8, xpBase: 25, goldMin: 12, goldMax: 21, emoji: '🔷', biome: 7 },
  { id: 'refraction_titan',   name: 'Refraction Titan',    rarity: 'rare',   weight: 1,  hp: 165, atk: 29, def: 14, xpBase: 132, goldMin: 70, goldMax: 138, emoji: '🌈', biome: 7 },
  { id: 'meridian_sovereign', name: 'Meridian Sovereign',  rarity: 'rare',   weight: 1,  hp: 158, atk: 31, def: 12, xpBase: 135, goldMin: 72, goldMax: 140, emoji: '👁️', biome: 7 },
  { id: 'null_reflection',    name: 'Null Reflection',     rarity: 'rare',   weight: 1,  hp: 160, atk: 30, def: 13, xpBase: 134, goldMin: 70, goldMax: 138, emoji: '🖤', biome: 7 },
  { id: 'fractured_god',      name: 'Fractured God',       rarity: 'rare',   weight: 1,  hp: 172, atk: 28, def: 15, xpBase: 138, goldMin: 74, goldMax: 142, emoji: '⚡', biome: 7 },

  // --- Biome 8: The Verdant Tomb ---
  { id: 'moss_revenant',     name: 'Moss Revenant',       rarity: 'common', weight: 24, hp: 57, atk: 18, def: 5, xpBase: 27, goldMin: 13, goldMax: 23, emoji: '🌿', biome: 8 },
  { id: 'spore_wraith',      name: 'Spore Wraith',        rarity: 'common', weight: 24, hp: 54, atk: 19, def: 4, xpBase: 27, goldMin: 13, goldMax: 23, emoji: '🍄', biome: 8 },
  { id: 'thornbound_horror', name: 'Thornbound Horror',   rarity: 'common', weight: 24, hp: 60, atk: 17, def: 7, xpBase: 28, goldMin: 14, goldMax: 24, emoji: '🌵', biome: 8 },
  { id: 'burial_bloom',      name: 'Burial Bloom',        rarity: 'common', weight: 24, hp: 58, atk: 18, def: 6, xpBase: 28, goldMin: 14, goldMax: 24, emoji: '🌸', biome: 8 },
  { id: 'root_titan',        name: 'Root Titan',          rarity: 'rare',   weight: 1,  hp: 185, atk: 33, def: 16, xpBase: 145, goldMin: 78, goldMax: 150, emoji: '🌳', biome: 8 },
  { id: 'tomb_empress',      name: 'Tomb Empress',        rarity: 'rare',   weight: 1,  hp: 178, atk: 35, def: 14, xpBase: 148, goldMin: 80, goldMax: 155, emoji: '🦋', biome: 8 },
  { id: 'verdant_lich',      name: 'Verdant Lich',        rarity: 'rare',   weight: 1,  hp: 182, atk: 34, def: 15, xpBase: 147, goldMin: 79, goldMax: 152, emoji: '💀', biome: 8 },
  { id: 'the_overgrowth',    name: 'The Overgrowth',      rarity: 'rare',   weight: 1,  hp: 195, atk: 32, def: 17, xpBase: 150, goldMin: 82, goldMax: 158, emoji: '🌾', biome: 8 },

  // --- Biome 9: The Obsidian Maw ---
  { id: 'obsidian_wretch',    name: 'Obsidian Wretch',    rarity: 'common', weight: 24, hp: 66,  atk: 20, def: 6,  xpBase: 30, goldMin: 14, goldMax: 25, emoji: '🖤', biome: 9 },
  { id: 'glasswrought_husk',  name: 'Glasswrought Husk',  rarity: 'common', weight: 24, hp: 70,  atk: 19, def: 8,  xpBase: 30, goldMin: 14, goldMax: 25, emoji: '🩸', biome: 9 },
  { id: 'maw_crawler',        name: 'Maw Crawler',        rarity: 'common', weight: 24, hp: 64,  atk: 22, def: 5,  xpBase: 31, goldMin: 15, goldMax: 26, emoji: '🕷️', biome: 9 },
  { id: 'starless_stalker',   name: 'Starless Stalker',   rarity: 'common', weight: 24, hp: 68,  atk: 21, def: 7,  xpBase: 31, goldMin: 15, goldMax: 26, emoji: '⚫', biome: 9 },
  { id: 'obsidian_colossus',  name: 'Obsidian Colossus',  rarity: 'rare',   weight: 1,  hp: 210, atk: 36, def: 18, xpBase: 160, goldMin: 88, goldMax: 165, emoji: '⛰️', biome: 9 },
  { id: 'maw_sovereign',      name: 'Maw Sovereign',      rarity: 'rare',   weight: 1,  hp: 220, atk: 38, def: 17, xpBase: 165, goldMin: 90, goldMax: 170, emoji: '🌘', biome: 9 },
  { id: 'voidglass_wyrm',     name: 'Voidglass Wyrm',     rarity: 'rare',   weight: 1,  hp: 225, atk: 37, def: 19, xpBase: 167, goldMin: 90, goldMax: 170, emoji: '🐍', biome: 9 },
  { id: 'the_last_light',     name: 'The Last Light',     rarity: 'rare',   weight: 1,  hp: 230, atk: 39, def: 20, xpBase: 170, goldMin: 92, goldMax: 175, emoji: '💫', biome: 9 },

  // --- Biome 10: The Hollow Choir ---
  { id: 'choir_wraith',      name: 'Choir Wraith',       rarity: 'common', weight: 24, hp: 78,  atk: 23, def: 8,  xpBase: 34, goldMin: 17, goldMax: 29, emoji: '🎭', biome: 10 },
  { id: 'hollow_cantor',     name: 'Hollow Cantor',      rarity: 'common', weight: 24, hp: 75,  atk: 24, def: 7,  xpBase: 34, goldMin: 17, goldMax: 29, emoji: '🕯️', biome: 10 },
  { id: 'dirge_revenant',    name: 'Dirge Revenant',     rarity: 'common', weight: 24, hp: 80,  atk: 22, def: 10, xpBase: 35, goldMin: 18, goldMax: 30, emoji: '⚱️', biome: 10 },
  { id: 'silent_hymnal',     name: 'Silent Hymnal',      rarity: 'common', weight: 24, hp: 77,  atk: 25, def: 8,  xpBase: 35, goldMin: 18, goldMax: 30, emoji: '📜', biome: 10 },
  { id: 'choir_of_bones',    name: 'Choir of Bones',     rarity: 'rare',   weight: 1,  hp: 250, atk: 41, def: 22, xpBase: 180, goldMin: 100, goldMax: 185, emoji: '🦴', biome: 10 },
  { id: 'the_conductor',     name: 'The Conductor',      rarity: 'rare',   weight: 1,  hp: 260, atk: 43, def: 21, xpBase: 185, goldMin: 105, goldMax: 188, emoji: '🎼', biome: 10 },
  { id: 'requiem_titan',     name: 'Requiem Titan',      rarity: 'rare',   weight: 1,  hp: 270, atk: 42, def: 24, xpBase: 188, goldMin: 108, goldMax: 190, emoji: '⚰️', biome: 10 },
  { id: 'the_unsung',        name: 'The Unsung',         rarity: 'rare',   weight: 1,  hp: 255, atk: 44, def: 23, xpBase: 190, goldMin: 110, goldMax: 190, emoji: '🎶', biome: 10 },
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
];

const RARE_WEAPONS = [
  { id: 'flameforged_blade', name: 'Flameforged Blade', type: 'weapon', rarity: 'rare', atk: 9 },
  { id: 'frostbite_edge',    name: 'Frostbite Edge',    type: 'weapon', rarity: 'rare', atk: 7, def: 2 },
  { id: 'voidsteel_cleaver', name: 'Voidsteel Cleaver', type: 'weapon', rarity: 'rare', atk: 11 },
  { id: 'dragonbone_spear',  name: 'Dragonbone Spear',  type: 'weapon', rarity: 'rare', atk: 8, def: 3 },
];

const EPIC_WEAPONS = [
  { id: 'worldsplitter',    name: 'Worldsplitter Greatsword', type: 'weapon', rarity: 'epic', atk: 15 },
  { id: 'stormcaller_lance',name: "Stormcaller's Lance",      type: 'weapon', rarity: 'epic', atk: 13, def: 3 },
  { id: 'nightfall_reaper', name: 'Nightfall Reaper',         type: 'weapon', rarity: 'epic', atk: 17 },
  { id: 'sunforged_hammer', name: 'Sunforged Warhammer',      type: 'weapon', rarity: 'epic', atk: 14, def: 4 },
];

const LEGENDARY_WEAPONS = [
  { id: 'excalibur_dawn', name: 'Excalibur, Blade of Dawn', type: 'weapon', rarity: 'legendary', atk: 20, def: 2 },
  { id: 'worldrender',    name: 'Worldrender',              type: 'weapon', rarity: 'legendary', atk: 23 },
];

const COMMON_ARMORS = [
  { id: 'leather_vest',     name: 'Leather Vest',      type: 'armor', rarity: 'common', def: 2 },
  { id: 'patched_robes',    name: 'Patched Robes',     type: 'armor', rarity: 'common', def: 1, atk: 1 },
  { id: 'bone_strap',       name: 'Bone Shield Strap', type: 'armor', rarity: 'common', def: 3 },
  { id: 'chainmail_scraps', name: 'Chainmail Scraps',  type: 'armor', rarity: 'common', def: 2 },
];

const RARE_ARMORS = [
  { id: 'wraithweave_cloak', name: 'Wraithweave Cloak', type: 'armor', rarity: 'rare', def: 6 },
  { id: 'golem_plate',       name: 'Golem Plate',       type: 'armor', rarity: 'rare', def: 9 },
  { id: 'lichs_aegis',       name: "Lich's Aegis",      type: 'armor', rarity: 'rare', def: 5, atk: 3 },
  { id: 'drakehide_mail',    name: 'Drakehide Mail',    type: 'armor', rarity: 'rare', def: 7, atk: 1 },
];

const EPIC_ARMORS = [
  { id: 'fallen_king_aegis', name: 'Aegis of the Fallen King', type: 'armor', rarity: 'epic', def: 13 },
  { id: 'stormplate',        name: 'Stormplate Harness',       type: 'armor', rarity: 'epic', def: 11, atk: 3 },
  { id: 'voidweave_mantle',  name: 'Voidweave Mantle',         type: 'armor', rarity: 'epic', def: 14 },
  { id: 'drakebone_bulwark', name: 'Drakebone Bulwark',        type: 'armor', rarity: 'epic', def: 12, atk: 2 },
];

const LEGENDARY_ARMORS = [
  { id: 'eternal_guardian',     name: 'Armor of the Eternal Guardian', type: 'armor', rarity: 'legendary', def: 17 },
  { id: 'void_sovereign_crown', name: 'Crown of the Void Sovereign',   type: 'armor', rarity: 'legendary', def: 14, atk: 5 },
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
];

const RARE_RINGS = [
  { id: 'ring_embers',   name: 'Ring of Embers',     type: 'ring', rarity: 'rare', atk: 4 },
  { id: 'ring_wardens',  name: 'Ring of Wardens',    type: 'ring', rarity: 'rare', def: 4 },
  { id: 'ring_vanguard', name: 'Ring of the Vanguard', type: 'ring', rarity: 'rare', atk: 3, def: 2 },
  { id: 'ring_echoes',   name: 'Ring of Echoes',     type: 'ring', rarity: 'rare', atk: 2, def: 3 },
];

const COMMON_EARRINGS = [
  { id: 'plain_stud',   name: 'Plain Stud',        type: 'earring', rarity: 'common', atk: 1 },
  { id: 'simple_hoop',  name: 'Simple Hoop',       type: 'earring', rarity: 'common', def: 1 },
  { id: 'bone_stud',    name: 'Carved Bone Stud',  type: 'earring', rarity: 'common', atk: 2 },
  { id: 'shell_stud',   name: 'Polished Shell',    type: 'earring', rarity: 'common', def: 2 },
];

const RARE_EARRINGS = [
  { id: 'earring_fury',    name: 'Earring of Fury',       type: 'earring', rarity: 'rare', atk: 4 },
  { id: 'earring_resolve', name: 'Earring of Resolve',    type: 'earring', rarity: 'rare', def: 4 },
  { id: 'earring_phoenix', name: 'Earring of the Phoenix', type: 'earring', rarity: 'rare', atk: 3, def: 2 },
  { id: 'earring_tide',    name: 'Earring of the Tide',   type: 'earring', rarity: 'rare', atk: 2, def: 3 },
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
};

// Grand Library exclusive tomes — unique effects not found on any normal skillbook.
const EXCLUSIVE_LIBRARY_BOOKS = [
  { id: 'codex_echo',        name: 'Codex of the Second Strike', type: 'skillbook', rarity: 'epic',      ability: 'echo' },
  { id: 'codex_momentum',    name: 'Codex of Momentum',          type: 'skillbook', rarity: 'epic',      ability: 'momentum' },
  { id: 'codex_thorns',      name: 'Codex of Thorns',            type: 'skillbook', rarity: 'epic',      ability: 'thorns' },
  { id: 'codex_second_wind', name: 'Codex of the Second Wind',   type: 'skillbook', rarity: 'legendary', ability: 'second_wind' },
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
};



const PRESTIGE_TREE = [
  // --- Body Modifications ---
  { id: 'ear',   group: 'body', name: "I've found my ear!",     desc: 'Unlocks a second earring slot.',                cost: 4,  effect: { bodyMod: 'ear' } },
  { id: 'pants', group: 'body', name: 'I can wear pants?',      desc: 'Unlocks the greaves slot and droppable greaves.', cost: 5,  effect: { bodyMod: 'pants' } },
  { id: 'vest',  group: 'body', name: 'See my vest! See my vest!', desc: 'Unlocks the chestpiece slot and droppable chainmail.', cost: 5, effect: { bodyMod: 'vest' } },
  { id: 'feet',  group: 'body', name: 'A thing for feet.',      desc: 'Unlocks the footwear slot and droppable footwear.', cost: 5,  effect: { bodyMod: 'feet' } },
  { id: 'finger',group: 'body', name: 'Finger lickin\' good!',  desc: 'Unlocks a third ring slot.',                     cost: 6,  effect: { bodyMod: 'finger' } },

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
const ATLAS_TIERS = [30, 60, 90];

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
  "Somewhere below, a choir has been singing the same unfinished hymn since before anyone thought to write history down. Newcomers hear it as noise. Give it long enough, and it starts to sound like your own name.",
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
];

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
   HEAVILY ARMED — Figures 5 prestige tree. Two one-time
   unlocks, bought directly with Souls (not tiered/repeatable).
--------------------------------------------------------- */

const HEAVILY_ARMED_TREE = [
  { id: 'headgear', name: 'Headgear', desc: 'Unlocks a Headgear slot and droppable helms/hoods/circlets.', cost: 150 },
  { id: 'dualwield', name: 'Dual Wield', desc: 'Unlocks a second weapon slot — carry and benefit from two weapons at once.', cost: 200 },
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
  return getCollectibleCount(player) + (player.bonusLuck || 0);
}

// 0 - 0.25, scales with luck (caps around 167 effective luck)
function luckBonus(player) {
  return Math.min(0.25, getLuck(player) * 0.0015);
}

const BESTIARY_THRESHOLDS_BASE = [20, 40, 60];
const BESTIARY_THRESHOLDS_EXTENDED = [20, 40, 60, 100, 150, 200];

function bestiaryTierFor(player, baseId) {
  if (!player.bestiaryUnlocked) return 0;
  const thresholds = player.cards2Unlocked ? BESTIARY_THRESHOLDS_EXTENDED : BESTIARY_THRESHOLDS_BASE;
  const kills = (player.kills && player.kills[baseId]) || 0;
  let tier = 0;
  thresholds.forEach(t => { if (kills >= t) tier += 1; });
  return tier; // 0-3 normally, 0-6 with Cards 2
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
  const lb = luckBonus(player);
  let gold = enemy.gold, potions = 0, greaterPotions = 0, items = [], map = false, keyItem = null, throwables = 0, bullets = 0, arrows = 0;
  const mods = player.bodyMods || [];
  const hasChest = mods.includes('vest');
  const hasGreaves = mods.includes('pants');
  const hasFootwear = mods.includes('feet');
  const hasHeadgear = (player.heavilyArmedUnlocked || []).includes('headgear');
  const hasHandcannon = player.keyItems.includes('handcannon');
  const hasBow = player.keyItems.includes('bow');

  const rareGearPool = [...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS];
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
    if (Math.random() < 0.15 + lb * 0.3) items.push(makeScaledItemInstance(pickRandom([...COMMON_RINGS, ...COMMON_EARRINGS]), enemy.depth));
    if (Math.random() < 0.05 + lb * 0.15) items.push(makeItemInstance(pickRandom(COMMON_SKILLBOOKS)));
    if (Math.random() < 0.3 + lb * 0.3) potions += 1;
    if (Math.random() < 0.12 + lb * 0.2) throwables += 1 + Math.floor(Math.random() * 3);
    if (hasHandcannon && Math.random() < 0.15 + lb * 0.2) bullets += 1 + Math.floor(Math.random() * 3);
    if (hasBow && Math.random() < 0.15 + lb * 0.2) arrows += 1 + Math.floor(Math.random() * 3);
  } else {
    // Guaranteed one piece of rare gear (weapon/armor/ring/earring, plus chest/greaves/footwear if unlocked).
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
  return { gold, potions, greaterPotions, items, map, keyItem, throwables, bullets, arrows };
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
  const items = [makeScaledItemInstance(pickRandom([...RARE_WEAPONS, ...RARE_ARMORS, ...RARE_RINGS, ...RARE_EARRINGS]), depth)];
  if (Math.random() < 0.3) items.push(makeItemInstance(pickRandom(RARE_SKILLBOOKS)));
  if (Math.random() < 0.35 + luckBonus(player)) items.push(makeScaledItemInstance(pickRandom([...EPIC_WEAPONS, ...EPIC_ARMORS]), depth));
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
  const exclusiveCount = (player.keyItems && player.keyItems.includes('archivists_key')) ? 3 : 2;
  const exclusiveStock = [...EXCLUSIVE_LIBRARY_BOOKS]
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

function generateRoom(depth, player) {
  if (depth % 6 === 0) {
    return { type: 'merchant', enemies: [], cleared: true, stock: generateMerchantStock(depth, player) };
  }
  if (depth % 9 === 0) {
    return { type: 'healer', enemies: [], cleared: true };
  }
  if (player.figures4TreeUnlocked && Math.random() < 0.01) {
    return { type: 'deluxe_merchant', enemies: [], cleared: true, stock: DELUXE_MERCHANT_STOCK.map(makeItemInstance) };
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
    atlasUnlocked: false,    // bought with 100 Souls directly, no collectible trade-in required
    biomeVisits: {},         // biomeIndex -> lifetime visit count, permanent across every run
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
  p.combatTricks = [...(prestige.combatTricks || [])];
  p.betterMerchantUnlocked = [...(prestige.betterMerchantUnlocked || [])];
  p.atlasUnlocked = !!prestige.atlasUnlocked;
  p.biomeVisits = { ...(prestige.biomeVisits || {}) };
  p.coins4TreeUnlocked = !!prestige.coins4TreeUnlocked;
  p.figures3TreeUnlocked = !!prestige.figures3TreeUnlocked;
  p.figures4TreeUnlocked = !!prestige.figures4TreeUnlocked;
  p.stamps3TreeUnlocked = !!prestige.stamps3TreeUnlocked;
  p.coins5TreeUnlocked = !!prestige.coins5TreeUnlocked;
  p.figures5TreeUnlocked = !!prestige.figures5TreeUnlocked;
  p.stamps4TreeUnlocked = !!prestige.stamps4TreeUnlocked;
  p.heavilyArmedUnlocked = [...(prestige.heavilyArmedUnlocked || [])];

  // Wealth (Coins 5) — bonus gold from selling and from loot sources (kills, Wheel)
  const wealthTiers = (prestige.wealthUnlocked || []).length;
  p.wealthSellBonus = wealthTiers * 0.02;
  p.wealthLootBonus = wealthTiers * 0.02;

  // Health (Stamps 4) — permanent % bonus to starting max HP
  const healthTiers = (prestige.healthUnlocked || []).length;
  if (healthTiers > 0) {
    p.maxHp = Math.round(p.maxHp * (1 + healthTiers * 0.05));
    p.hp = p.maxHp;
  }

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
  p.knifeDmgBonus = knifeDmgBonus;
  p.knifeCritChance = Math.min(50, knifeCritBonus);
  p.knifeSaveChance = Math.min(50, knifeSaveBonus);

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
    chestpiecesBag: [], greavesBag: [], footwearBag: [], headgearBag: [],
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
  };
  return prestige ? applyPrestigeToPlayer(base, prestige) : base;
}

function soulsForRun(maxDepthReached) {
  // 1 Soul per 3 depths reached, minimum 1 if you made it past depth 1.
  return Math.max(0, Math.floor((maxDepthReached - 1) / 3));
}

function freshState(prestige, preserveCollectibles, name) {
  const basePrestige = prestige || freshPrestige();
  const prevVisits = (basePrestige.biomeVisits && basePrestige.biomeVisits[0]) || 0;
  const usedPrestige = recordBiomeVisit(basePrestige, 0);
  const newVisits = usedPrestige.biomeVisits[0];
  const atlasMsgs = usedPrestige.atlasUnlocked ? atlasMilestoneLog(prevVisits, newVisits, 0) : [];
  const player = freshPlayer(usedPrestige, name);
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
      const dodge = baseDodge + bb.dodgeBonus / 100;
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
        const edmg = damageRoll(Math.max(1, e.atk), Math.round(totalDef(p) * bb.defMult));
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
        [20, 40, 60].forEach(threshold => {
          if (prevKills + 1 === threshold) {
            log.push(`📖 Bestiary milestone: ${threshold} kills on the ${e.name}! Combat bonus against them increased.`);
          }
        });
      }

      const loot = rollLoot(e, p);

      let goldGain = loot.gold;
      if (p.keyItems.includes('thief_signet')) goldGain = Math.round(goldGain * 1.15);
      if (p.wealthLootBonus) goldGain = Math.round(goldGain * (1 + p.wealthLootBonus));
      p = { ...p, gold: p.gold + goldGain };

      let xpGain = e.xp;
      if (p.keyItems.includes('sage_monocle')) xpGain = Math.round(xpGain * 1.15);
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
      if (leveled) log.push(`✦ You reached level ${p.level}! HP and stats increased, wounds mended.`);

      const collChance = (e.rarity === 'common' ? 0.12 : 0.3) + luckBonus(p);
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
        weapon2: p.player?.weapon2 || fp.weapon2,
        weaponsBag: p.player?.weaponsBag || [],
        armorsBag: p.player?.armorsBag || [],
        accessoriesBag: p.player?.accessoriesBag || [],
        skillbooksBag: p.player?.skillbooksBag || [],
        chestpiecesBag: p.player?.chestpiecesBag || [],
        greavesBag: p.player?.greavesBag || [],
        footwearBag: p.player?.footwearBag || [],
        headgearBag: p.player?.headgearBag || [],
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
      const earned = soulsForRun(state.player.maxDepthReached || 1);
      const prestige = {
        ...state.prestige,
        souls: state.prestige.souls + earned,
        bestDepthEver: Math.max(state.prestige.bestDepthEver, state.player.maxDepthReached || 1),
        kills: { ...(state.player.kills || {}) },
      };
      const log = [...state.log, `💀 Run ended. You banked ${earned} Soul${earned === 1 ? '' : 's'} for prestige upgrades.`];
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
      let dmg = damageRoll(Math.round(totalAtk(player) * bb.atkMult), target.def);
      let crit = false;
      if (player.abilities.includes('crit') && Math.random() < 0.15 + lb) { dmg *= 2; crit = true; }
      if (player.abilities.includes('momentum')) {
        const woundedFrac = 1 - (target.hp / target.maxHp);
        dmg = Math.round(dmg * (1 + woundedFrac * 0.25));
      }
      target.hp = Math.max(0, target.hp - dmg);
      log.push(`You strike the ${target.name} for ${dmg} damage.${crit ? ' Critical hit!' : ''}`);

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
      if (player.hp <= 0) {
        const sw = applySecondWind(player, log);
        player = sw.player;
        if (!sw.prevented) {
          gameOver = true;
          log.push(`Your vision fades to black. You have fallen at depth ${state.depth}...`);
        }
      }

      return {
        ...state,
        player,
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
          throwBaseAtk = baseAtk + (player.knifeDmgBonus || 0) + (isBoss ? (player.bossDmgBonus || 0) : 0);
          const baseCrit = player.knifeCritChance || 0;
          const bossCrit = isBoss ? (player.bossCritBonus || 0) : 0;
          const critRoll = Math.random() * 100 < (baseCrit + bossCrit);
          const saveRoll = Math.random() * 100 < (player.knifeSaveChance || 0);
          if (critRoll) critMsg = ' Critical throw!';
          if (saveRoll) consumed = false;
          let dmg = damageRoll(Math.round(throwBaseAtk * bb.atkMult), target.def);
          if (critRoll) dmg *= 2;
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
        const dmg = damageRoll(Math.round(baseAtk * bb.atkMult), target.def);
        target.hp = Math.max(0, target.hp - dmg);
        player[ammoKey] -= 1;
        log.push(`You use your ${weaponName}, dealing ${dmg} damage to the ${target.name}. (A free action — no retaliation, -1 ${ammoLabel})`);
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
            return { ...state, player, room, log: log.slice(-50), gameOver: true };
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
        chestpiece: 'chestpiecesBag', greaves: 'greavesBag', footwear: 'footwearBag', headgear: 'headgearBag',
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
      } else if (bag === 'chestpiece' || bag === 'greaves' || bag === 'footwear' || bag === 'headgear') {
        const bagKeyMap = { chestpiece: 'chestpiecesBag', greaves: 'greavesBag', footwear: 'footwearBag', headgear: 'headgearBag' };
        const emptyIdMap = { chestpiece: 'no_chest', greaves: 'no_greaves', footwear: 'no_footwear', headgear: 'no_headgear' };
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
      if (book.rarity === 'common') {
        const eff = book.effect || {};
        if (eff.hp) { player.maxHp += eff.hp; player.hp = Math.min(player.maxHp, player.hp + eff.hp); }
        player.atk += eff.atk || 0;
        player.def += eff.def || 0;
        log.push(`You study the ${book.name}. ${describeEffect(eff)}`);
      } else {
        if (player.abilities.includes(book.ability)) {
          player.gold += 25;
          log.push(`You already know this technique. The ${book.name} crumbles to dust, leaving 25 gold behind.`);
        } else {
          player.abilities = [...player.abilities, book.ability];
          log.push(`✦ You master the ${book.name}! New ability: ${ABILITY_INFO[book.ability].name}.`);
        }
      }
      return { ...state, player, log: log.slice(-50) };
    }

    case 'REST': {
      let player = { ...state.player };
      const missing = player.maxHp - player.hp;
      if (missing <= 0) return state;
      const cost = Math.max(1, Math.ceil(missing / 2));
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
    : (item.type === 'ring' || item.type === 'earring') ? Gem
    : item.type === 'skillbook' ? BookOpen
    : FlaskConical;
  const colorCls = item.rarity === 'mythic' ? 'dc-mythic' : item.rarity === 'legendary' ? 'dc-legendary' : item.rarity === 'epic' ? 'dc-epic' : item.rarity === 'rare' ? 'dc-rare' : 'dc-common';
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${glowClass(item.rarity)}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={14} className={colorCls} />
        <div className="min-w-0">
          <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{item.name}</div>
          <div className="flex gap-2 items-center">
            <RarityTag rarity={item.rarity} />
            {item.atk ? <span className="text-[10px] dc-amber">+{item.atk} ATK</span> : null}
            {item.def ? <span className="text-[10px]" style={{ color: '#7aa8c9' }}>+{item.def} DEF</span> : null}
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
      <div className="text-2xl mb-1">{enemy.emoji}</div>
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
  const biome = BIOMES[currentBiome(depth)];

  return (
    <div className="dc-root px-3 py-4">
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
            <span className="text-[10px] dc-mono" style={{ color: '#5a5d68' }}>v{GAME_VERSION}</span>
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
              onUnlock={(id) => dispatch({ type: 'UNLOCK_PRESTIGE', payload: id })}
              onUnlockTrick={(id) => dispatch({ type: 'UNLOCK_COMBAT_TRICK', payload: id })}
              onUnlockReadyOrNotTier={(id) => dispatch({ type: 'UNLOCK_READY_OR_NOT_TIER', payload: id })}
              onUnlockBetterMerchantTier={(id) => dispatch({ type: 'UNLOCK_BETTER_MERCHANT_TIER', payload: id })}
              onUnlockCoins2Tier={(id) => dispatch({ type: 'UNLOCK_COINS2_TIER', payload: id })}
              onUnlockCoins3Tier={(id) => dispatch({ type: 'UNLOCK_COINS3_TIER', payload: id })}
              onUnlockMadgodTier={(id) => dispatch({ type: 'UNLOCK_MADGOD_TIER', payload: id })}
              onUnlockPhysicianTier={(id) => dispatch({ type: 'UNLOCK_PHYSICIAN_TIER', payload: id })}
              onUnlockAtlas={() => dispatch({ type: 'UNLOCK_ATLAS' })}
              onUnlockWealthTier={(id) => dispatch({ type: 'UNLOCK_WEALTH_TIER', payload: id })}
              onUnlockHealthTier={(id) => dispatch({ type: 'UNLOCK_HEALTH_TIER', payload: id })}
              onUnlockHeavilyArmedTier={(id) => dispatch({ type: 'UNLOCK_HEAVILY_ARMED_TIER', payload: id })}
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
  const cost = missing > 0 ? Math.max(1, Math.ceil(missing / 2)) : 0;
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

function PrestigePanel({ prestige, onUnlock, onUnlockTrick, onUnlockReadyOrNotTier, onUnlockBetterMerchantTier, onUnlockCoins2Tier, onUnlockCoins3Tier, onUnlockMadgodTier, onUnlockPhysicianTier, onUnlockAtlas, onUnlockWealthTier, onUnlockHealthTier, onUnlockHeavilyArmedTier, onNewRun }) {
  const bodyNodes = PRESTIGE_TREE.filter(n => n.group === 'body');
  const statNodes = PRESTIGE_TREE.filter(n => n.group === 'stat');
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

function EmojiSolid3D({ emoji, rarityColor, filter }) {
  const half = EXAMINE_THICKNESS / 2;
  const step = EXAMINE_THICKNESS / (EXAMINE_LAYERS - 1);
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
              transform: `translateZ(${z}px)`,
              filter: isFront
                ? `${filter} brightness(${brightness}) drop-shadow(0 0 14px ${rarityColor}bb)`
                : `${filter} brightness(${brightness})`,
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
          <EmojiSolid3D emoji={emoji} rarityColor={rarityColor} filter={getGearFilter(item.rarity)} />
        </ExamineRotatable>
        <div style={{ textAlign: 'center' }}>
          <div className="dc-display" style={{ fontSize: 15, color: '#e7e2d0' }}>{item.name}</div>
          <div className="dc-mono" style={{ fontSize: 10, color: rarityColor, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 2 }}>
            {item.rarity}
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
};

const BODY_SLOT_LAYOUT = [
  { key: 'headgear',   top: '4%',  left: '50%' },
  { key: 'earring',    top: '11%', left: '37%' },
  { key: 'earring2',   top: '11%', left: '63%' },
  { key: 'armor',      top: '32%', left: '50%' },
  { key: 'chestpiece', top: '47%', left: '50%' },
  { key: 'weapon',     top: '42%', left: '86%' },
  { key: 'weapon2',    top: '42%', left: '14%' },
  { key: 'ring1',      top: '58%', left: '14%' },
  { key: 'ring2',      top: '66%', left: '14%' },
  { key: 'ring3',      top: '74%', left: '14%' },
  { key: 'greaves',    top: '68%', left: '50%' },
  { key: 'footwear',   top: '88%', left: '50%' },
];

function rarityColorFor(rarity) {
  return rarity === 'mythic' ? '#5eead4' : rarity === 'legendary' ? '#ffd76a'
    : rarity === 'epic' ? '#ff9152' : rarity === 'rare' ? '#c9a4f7' : '#8fae6b';
}

function BodySlotBox({ slotKey, item, onExamine }) {
  const empty = isEmptySlotItem(item);
  const emoji = empty ? '·' : getGearEmoji(item);
  const filter = empty ? 'none' : getGearFilter(item.rarity);
  const rarityColor = empty ? '#3a3e4a' : rarityColorFor(item.rarity);
  return (
    <button
      onClick={() => !empty && onExamine(item)}
      disabled={empty}
      title={empty ? `${BODY_SLOT_LABELS[slotKey]}: empty` : item.name}
      style={{
        width: 42, height: 42, borderRadius: 8,
        background: '#1e2029',
        border: `1.5px solid ${empty ? '#33363f' : rarityColor}`,
        boxShadow: empty ? 'none' : `0 0 10px ${rarityColor}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: empty ? 14 : 20,
        filter,
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
    <div style={{ position: 'relative', height: 320, marginBottom: 4 }}>
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
              <div key={item.uid} className={`px-2 py-2 rounded dc-panel-raised ${glowClass(item.rarity)}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Gem size={14} className={colorCls} />
                  <div>
                    <div className="text-xs" style={{ color: '#e7e2d0' }}>{item.name}</div>
                    <div className="flex gap-2 items-center">
                      <RarityTag rarity={item.rarity} />
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
      {branches.map(b => (
        <Section key={b.id} title={b.label}>
          {SKILL_TREE.filter(n => n.branch === b.id).map(node => {
            const isUnlocked = unlocked.includes(node.id);
            const prereqOk = !node.requires || unlocked.includes(node.requires);
            const depthOk = maxDepthReached >= node.reqDepth;
            const coinsOk = !node.requiresCoinsTradedIn || coinsTradedIn;
            const canUnlock = !isUnlocked && prereqOk && depthOk && coinsOk && available > 0;
            const isLocked = node.requiresCoinsTradedIn && !coinsTradedIn;
            return (
              <div key={node.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded dc-panel-raised ${isUnlocked ? 'rare-glow' : ''} ${isLocked ? 'opacity-40' : ''}`}>
                <div className="min-w-0">
                  <div className="text-xs" style={{ color: isUnlocked ? '#c9a4f7' : isLocked ? '#5a5d68' : '#e7e2d0' }}>{node.name}</div>
                  <div className="text-[10px]" style={{ color: '#9a9788' }}>
                    {node.desc}
                    {!isUnlocked && isLocked ? ' · requires coin trade-in' : ''}
                    {!isUnlocked && !isLocked && !depthOk ? ` · requires depth ${node.reqDepth}` : ''}
                    {!isUnlocked && !isLocked && depthOk && !prereqOk ? ' · requires previous tier' : ''}
                  </div>
                </div>
                {isUnlocked ? (
                  <span className="text-[10px] dc-rare shrink-0">LEARNED</span>
                ) : isLocked ? (
                  <span className="text-[10px] shrink-0" style={{ color: '#5a5d68' }}>🔒</span>
                ) : (
                  <SmallBtn variant="primary" disabled={!canUnlock} onClick={() => dispatch({ type: 'UNLOCK_SKILL', payload: node.id })}>Unlock</SmallBtn>
                )}
              </div>
            );
          })}
        </Section>
      ))}
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
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>💰 Wealth unlocked. Keep collecting.</p>
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
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>❤️ Health unlocked. Keep collecting.</p>
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
              ) : (
                <p className="text-[11px]" style={{ color: '#9a9788' }}>⚔️ Heavily Armed unlocked. Keep collecting.</p>
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
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}
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
            return tier > 0 ? (
              <div className="mt-2 text-[11px] dc-rare">
                Combat Bonus (Tier {tier}/3): +{tier * 2}% ATK, +{tier * 2}% DEF, +{tier * 2}% dodge vs this foe
              </div>
            ) : (
              <div className="mt-2 text-[11px]" style={{ color: '#9a9788' }}>
                Kill 20 to earn combat bonuses against this foe.
              </div>
            );
          })()}
          <div className="mt-2 flex gap-3">
            {[20, 40, 60].map(t => {
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
          {known.map(e => {
            const count = kills[e.id] || 0;
            const tier = bestiaryTierFor(player, e.id);
            return (
              <button
                key={e.id}
                onClick={() => setSelected(e.id)}
                className="w-full flex items-center justify-between gap-2 dc-panel-raised rounded px-2 py-1.5 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span>{e.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{e.name}</div>
                    <div className="text-[10px]" style={{ color: '#9a9788' }}>{count} kill{count === 1 ? '' : 's'}</div>
                  </div>
                </div>
                <span className="text-[10px] dc-rare shrink-0">Tier {tier}/3 ›</span>
              </button>
            );
          })}
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
    return (
      <div className="dc-panel-raised rounded p-3">
        <button onClick={() => setSelected(null)} className="text-[10px] dc-amber mb-2 block">← Back to Atlas</button>
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
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {BIOMES.map((biome, i) => {
        const v = visits[i] || 0;
        const tier = ATLAS_TIERS.filter(t => v >= t).length;
        return (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className="w-full flex items-center justify-between gap-2 dc-panel-raised rounded px-2 py-1.5 text-left"
          >
            <div className="min-w-0">
              <div className="text-xs truncate" style={{ color: '#e7e2d0' }}>{biome.name}</div>
              <div className="text-[10px]" style={{ color: '#9a9788' }}>{v} visit{v === 1 ? '' : 's'}</div>
            </div>
            <span className="text-[10px] shrink-0" style={{ color: '#5eead4' }}>Tier {tier}/3 ›</span>
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

      .dc-root { background: #14151b; color: #e7e2d0; font-family: 'JetBrains Mono', monospace; min-height: 100vh; position: relative; }

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
