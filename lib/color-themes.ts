import amberMinimal from '@/assets/color-themes/amber-minimal.json';
import amethystHaze from '@/assets/color-themes/amethyst-haze.json';
import boldTech from '@/assets/color-themes/bold-tech.json';
import bubblegum from '@/assets/color-themes/bubblegum.json';
import caffeine from '@/assets/color-themes/caffeine.json';
import candyland from '@/assets/color-themes/candyland.json';
import catppuccin from '@/assets/color-themes/catppuccin.json';
import claude from '@/assets/color-themes/claude.json';
import claymorphism from '@/assets/color-themes/claymorphism.json';
import cleanSlate from '@/assets/color-themes/clean-slate.json';
import cosmicNight from '@/assets/color-themes/cosmic-night.json';
import cyberpunk from '@/assets/color-themes/cyberpunk.json';
import darkmatter from '@/assets/color-themes/darkmatter.json';
import defaultTheme from '@/assets/color-themes/default.json';
import doom64 from '@/assets/color-themes/doom-64.json';
import elegantLuxury from '@/assets/color-themes/elegant-luxury.json';
import graphite from '@/assets/color-themes/graphite.json';
import kodamaGrove from '@/assets/color-themes/kodama-grove.json';
import midnightBloom from '@/assets/color-themes/midnight-bloom.json';
import mochaMousse from '@/assets/color-themes/mocha-mousse.json';
import modernMinimal from '@/assets/color-themes/modern-minimal.json';
import mono from '@/assets/color-themes/mono.json';
import nature from '@/assets/color-themes/nature.json';
import neoBrutalism from '@/assets/color-themes/neo-brutalism.json';
import northernLights from '@/assets/color-themes/northern-lights.json';
import notebook from '@/assets/color-themes/notebook.json';
import oceanBreeze from '@/assets/color-themes/ocean-breeze.json';
import pastelDreams from '@/assets/color-themes/pastel-dreams.json';
import perpetuity from '@/assets/color-themes/perpetuity.json';
import quantumRose from '@/assets/color-themes/quantum-rose.json';
import retroArcade from '@/assets/color-themes/retro-arcade.json';
import sageGarden from '@/assets/color-themes/sage-garden.json';
import softPop from '@/assets/color-themes/soft-pop.json';
import solarDusk from '@/assets/color-themes/solar-dusk.json';
import starryNight from '@/assets/color-themes/starry-night.json';
import sunsetHorizon from '@/assets/color-themes/sunset-horizon.json';
import supabase from '@/assets/color-themes/supabase.json';
import t3Chat from '@/assets/color-themes/t3-chat.json';
import tangerine from '@/assets/color-themes/tangerine.json';
import twitter from '@/assets/color-themes/twitter.json';
import vintagePaper from '@/assets/color-themes/vintage-paper.json';
import violetBloom from '@/assets/color-themes/violet-bloom.json';

export interface ColorThemeVars {
  [key: string]: string;
}

export interface ColorThemeJson {
  name: string;
  cssVars: {
    theme?: Record<string, string>;
    light: ColorThemeVars;
    dark: ColorThemeVars;
  };
}

export interface ColorTheme {
  id: string;
  name: string;
  json: ColorThemeJson;
}

const RAW_THEMES: ColorThemeJson[] = [
  defaultTheme,
  amberMinimal,
  amethystHaze,
  boldTech,
  bubblegum,
  caffeine,
  candyland,
  catppuccin,
  claude,
  claymorphism,
  cleanSlate,
  cosmicNight,
  cyberpunk,
  darkmatter,
  doom64,
  elegantLuxury,
  graphite,
  kodamaGrove,
  midnightBloom,
  mochaMousse,
  modernMinimal,
  mono,
  nature,
  neoBrutalism,
  northernLights,
  notebook,
  oceanBreeze,
  pastelDreams,
  perpetuity,
  quantumRose,
  retroArcade,
  sageGarden,
  softPop,
  solarDusk,
  starryNight,
  sunsetHorizon,
  supabase,
  t3Chat,
  tangerine,
  twitter,
  vintagePaper,
  violetBloom,
];

function titleCase(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const COLOR_THEMES: ColorTheme[] = RAW_THEMES.map((json) => ({
  id: json.name,
  name: titleCase(json.name),
  json,
}));

export const DEFAULT_COLOR_THEME_ID = 'default';

export function getColorThemeById(id: string): ColorTheme | undefined {
  return COLOR_THEMES.find((t) => t.id === id);
}
