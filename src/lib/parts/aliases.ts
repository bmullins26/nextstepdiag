// Technician vocabulary -> words OEM parts diagrams actually use, across brands.
// e.g. Whirlpool/Maytag sell the "user interface" as a "Fascia Assembly (HMI)".
export const PART_ALIASES: Array<{ match: RegExp; oem: string[] }> = [
  { match: /\b(user interface|ui\b|ui board|display|hmi|touch ?pad|keypad|control panel|console board)/i, oem: ["fascia", "hmi", "interface", "display", "console", "sub pba", "keypad", "touchpad"] },
  { match: /\b(main (control )?board|control board|mcu|ccu|computer|motherboard|main pcb|main pba)/i, oem: ["control", "mcu", "ccu", "main pcb", "main pba", "pcb", "pba", "electronic"] },
  { match: /\b(lid (lock|switch)|door (lock|latch|switch)|interlock)/i, oem: ["lock", "latch", "interlock", "switch"] },
  { match: /\b(drain pump|pump)/i, oem: ["pump"] },
  { match: /\b(inlet|water) valve/i, oem: ["valve", "inlet"] },
  { match: /\b(igniter|ignitor)/i, oem: ["igniter", "ignitor"] },
  { match: /\b(thermal fuse|thermostat|hi-?limit)/i, oem: ["fuse", "thermostat", "limit"] },
];

// Parts that must never outrank the real component (harnesses, brackets, trim).
export const ACCESSORY = /\b(harness|wire|bracket|screw|clip|label|trim|cover|cap|seal kit|knob)\b/i;

export function aliasWords(name: string): string[] {
  return PART_ALIASES.filter((a) => a.match.test(name)).flatMap((a) => a.oem);
}
