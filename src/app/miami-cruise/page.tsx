"use client";

import { useState, useEffect } from "react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type VesselType = "cruise" | "cargo" | "superyacht";

type Vessel = {
  name: string;
  type: VesselType;
  operator: string;
  arr: string | null;
  dep: string | null;
  // cruise
  capacity?: number;
  // cargo
  origin?: string;
  destination?: string;
  cargoKind?: string;
  // superyacht
  lengthFt?: number;
  flag?: string;
  yachtKind?: "Private" | "Charter";
};

// ─────────────────────────────────────────────
// Operator colors (cruise lines + cargo lines)
// ─────────────────────────────────────────────
const OP_COLORS: Record<string, { fg: string; bg: string }> = {
  // Cruise
  "Royal Caribbean":   { fg: "#1d4ed8", bg: "rgba(29,78,216,0.08)"   },
  "Carnival":          { fg: "#dc2626", bg: "rgba(220,38,38,0.08)"   },
  "Norwegian":         { fg: "#0d9488", bg: "rgba(13,148,136,0.08)"  },
  "MSC Cruises":       { fg: "#059669", bg: "rgba(5,150,105,0.08)"   },
  "Celebrity":         { fg: "#7c3aed", bg: "rgba(124,58,237,0.08)"  },
  "Virgin Voyages":    { fg: "#be185d", bg: "rgba(190,24,93,0.08)"   },
  "Oceania":           { fg: "#c2410c", bg: "rgba(194,65,12,0.08)"   },
  "Cunard":            { fg: "#b91c1c", bg: "rgba(185,28,28,0.08)"   },
  "Explora Journeys":  { fg: "#475569", bg: "rgba(71,85,105,0.08)"   },
  "Holland America":   { fg: "#1e40af", bg: "rgba(30,64,175,0.08)"   },
  "Regent Seven Seas": { fg: "#6d28d9", bg: "rgba(109,40,217,0.08)"  },
  "Azamara":           { fg: "#92400e", bg: "rgba(146,64,14,0.08)"   },
  // Cargo
  "CMA CGM":           { fg: "#0369a1", bg: "rgba(3,105,161,0.08)"   },
  "APL":               { fg: "#0284c7", bg: "rgba(2,132,199,0.08)"   },
  "Maersk":            { fg: "#1d4ed8", bg: "rgba(29,78,216,0.08)"   },
  "Hamburg Sud":       { fg: "#0f766e", bg: "rgba(15,118,110,0.08)"  },
  "Hapag-Lloyd":       { fg: "#c2410c", bg: "rgba(194,65,12,0.08)"   },
  "Seaboard Marine":   { fg: "#7c3aed", bg: "rgba(124,58,237,0.08)"  },
  "Crowley Maritime":  { fg: "#b91c1c", bg: "rgba(185,28,28,0.08)"   },
  "King Ocean":        { fg: "#065f46", bg: "rgba(6,95,70,0.08)"     },
  "ZIM":               { fg: "#1e3a8a", bg: "rgba(30,58,138,0.08)"   },
  "Tropical Shipping": { fg: "#854d0e", bg: "rgba(133,77,14,0.08)"   },
  // Superyacht
  "Private":           { fg: "#6b21a8", bg: "rgba(107,33,168,0.08)"  },
  "Charter":           { fg: "#9d174d", bg: "rgba(157,23,77,0.08)"   },
};

function opColor(name: string) {
  return OP_COLORS[name] ?? { fg: "#475569", bg: "rgba(71,85,105,0.08)" };
}

// ─────────────────────────────────────────────
// Schedule — March 2026
// Cruise: CruiseTimetables.com
// Cargo: Port Miami published services + AIS data (myshiptracking.com)
// Superyacht: Public AIS records (vessels >100 ft)
// ─────────────────────────────────────────────
const SCHEDULE: Record<string, Vessel[]> = {

  // ════════════════════════════════
  // Week 1 — Mar 2–8
  // ════════════════════════════════

  "2026-03-02": [
    // Cruise
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    // Cargo
    { name: "Crowley Commander",   type: "cargo",  operator: "Crowley Maritime", arr: "05:00", dep: "19:00", origin: "San Juan, PR",         destination: "Miami, FL",     cargoKind: "RoRo / Container" },
    { name: "King Ocean Infinity", type: "cargo",  operator: "King Ocean",       arr: "09:00", dep: null,    origin: "Cartagena, Colombia",  destination: "Miami, FL",     cargoKind: "Container" },
    // Superyacht
    { name: "KISMET",              type: "superyacht", operator: "Private", arr: null, dep: null, origin: "Nassau, Bahamas",   lengthFt: 309, flag: "Cayman Islands", yachtKind: "Private" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth",   lengthFt: 196, flag: "United States",   yachtKind: "Charter" },
  ],

  "2026-03-03": [
    // Cruise
    { name: "Queen Elizabeth",     type: "cruise", operator: "Cunard",           arr: "23:59", dep: null,    capacity: 2092 },
    // Cargo (AIS-confirmed)
    { name: "APL Antwerp",         type: "cargo",  operator: "APL",             arr: "12:29", dep: null,    origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Loncomilla",          type: "cargo",  operator: "Hamburg Sud",      arr: null,    dep: "01:30", origin: "Miami, FL",            destination: "Montevideo, UY", cargoKind: "Container / Reefer" },
    // Superyacht
    { name: "KISMET",              type: "superyacht", operator: "Private", arr: null, dep: null, origin: "Nassau, Bahamas",   lengthFt: 309, flag: "Cayman Islands", yachtKind: "Private" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth",   lengthFt: 196, flag: "United States",   yachtKind: "Charter" },
    { name: "LAUREN L",            type: "superyacht", operator: "Private", arr: "10:00", dep: null, origin: "Fort Lauderdale, FL", lengthFt: 245, flag: "Cayman Islands", yachtKind: "Private" },
  ],

  "2026-03-04": [
    // Cruise
    { name: "Scarlet Lady",        type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Norwegian Jewel",     type: "cruise", operator: "Norwegian",       arr: null,    dep: "16:00", capacity: 2368 },
    { name: "Norwegian Pearl",     type: "cruise", operator: "Norwegian",       arr: null,    dep: null,    capacity: 2394 },
    // Cargo
    { name: "Tropical Mist",       type: "cargo",  operator: "Tropical Shipping", arr: "07:00", dep: "17:00", origin: "Nassau, Bahamas",     destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "Crowley Navigator",   type: "cargo",  operator: "Crowley Maritime", arr: null,    dep: "18:00", origin: "Miami, FL",            destination: "San Juan, PR",  cargoKind: "RoRo / Container" },
    // Superyacht
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
    { name: "LAUREN L",            type: "superyacht", operator: "Private", arr: null, dep: null, origin: "Fort Lauderdale, FL", lengthFt: 245, flag: "Cayman Islands", yachtKind: "Private" },
  ],

  "2026-03-05": [
    // (No cruise ships scheduled)
    // Cargo (AIS-confirmed)
    { name: "CMA CGM Blue Whale",  type: "cargo",  operator: "CMA CGM",         arr: "06:35", dep: null,    origin: "Freeport, Bahamas",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Maersk Miami",        type: "cargo",  operator: "Maersk",           arr: "14:00", dep: null,    origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    // Superyacht
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
    { name: "LAUREN L",            type: "superyacht", operator: "Private", arr: null, dep: null, origin: "Fort Lauderdale, FL", lengthFt: 245, flag: "Cayman Islands", yachtKind: "Private" },
    { name: "EXCELLENCE V",        type: "superyacht", operator: "Charter", arr: "09:00", dep: null, origin: "Key West, FL",       lengthFt: 244, flag: "Marshall Islands", yachtKind: "Charter" },
  ],

  "2026-03-06": [
    // Cruise
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    // Cargo
    { name: "ZIM Miami",           type: "cargo",  operator: "ZIM",             arr: "08:00", dep: null,    origin: "Santo Domingo, DR",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Seaboard Ranger",     type: "cargo",  operator: "Seaboard Marine", arr: null,    dep: "22:00", origin: "Miami, FL",            destination: "Puerto Cortés, HN", cargoKind: "Container / Reefer" },
    // Superyacht
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
    { name: "EXCELLENCE V",        type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Key West, FL",       lengthFt: 244, flag: "Marshall Islands", yachtKind: "Charter" },
  ],

  "2026-03-07": [
    // Cruise
    { name: "Icon of the Seas",    type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5610 },
    { name: "MSC World America",   type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "18:00", capacity: 5252 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "Norwegian Encore",    type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "Carnival Magic",      type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3690 },
    { name: "Resilient Lady",      type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    // Cargo
    { name: "King Ocean Spirit",   type: "cargo",  operator: "King Ocean",      arr: null,    dep: "08:00", origin: "Miami, FL",            destination: "Barranquilla, CO", cargoKind: "Container" },
    // Superyacht
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],

  "2026-03-08": [
    // Cruise
    { name: "Symphony of the Seas",    type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 5518 },
    { name: "Carnival Celebration",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 5374 },
    { name: "Carnival Horizon",        type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3960 },
    { name: "Independence of the Seas",type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 3869 },
    { name: "Norwegian Aqua",          type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3571 },
    { name: "Celebrity Beyond",        type: "cruise", operator: "Celebrity",       arr: "07:00", dep: "16:00", capacity: 3260 },
    { name: "Scarlet Lady",            type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    // Cargo
    { name: "Crowley Commander",       type: "cargo",  operator: "Crowley Maritime", arr: null, dep: "16:00", origin: "Miami, FL", destination: "San Juan, PR", cargoKind: "RoRo / Container" },
    // Superyacht
    { name: "SEAFAIR",                 type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],

  // ════════════════════════════════
  // Week 2 — Mar 9–15
  // ════════════════════════════════

  "2026-03-09": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean",  arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",      arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",        arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Norwegian Pearl",     type: "cruise", operator: "Norwegian",        arr: null,    dep: null,    capacity: 2394 },
    { name: "Oceania Allura",      type: "cruise", operator: "Oceania",          arr: "08:00", dep: "17:00", capacity: 1200 },
    { name: "Explora I",           type: "cruise", operator: "Explora Journeys", arr: "07:00", dep: "17:00", capacity:  920 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",         arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Crowley Navigator",   type: "cargo",  operator: "Crowley Maritime", arr: "06:00", dep: "18:00", origin: "San Juan, PR",      destination: "Miami, FL",     cargoKind: "RoRo / Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-10": [
    { name: "Oceania Nautica",     type: "cruise", operator: "Oceania",   arr: "08:00", dep: "17:00", capacity: 684 },
    { name: "APL Antwerp",         type: "cargo",  operator: "APL",       arr: "08:00", dep: "20:00", origin: "Kingston, Jamaica",  destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Tropical Isle",       type: "cargo",  operator: "Tropical Shipping", arr: "07:00", dep: "16:00", origin: "Nassau, Bahamas",   destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-11": [
    // No cruise ships scheduled
    { name: "Maersk Miami",        type: "cargo",  operator: "Maersk",          arr: "09:00", dep: null,    origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Seaboard Glory",      type: "cargo",  operator: "Seaboard Marine", arr: null,    dep: "21:00", origin: "Miami, FL",            destination: "Barranquilla, CO", cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-12": [
    { name: "Brilliant Lady",      type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "MSC Divina",          type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 3502 },
    { name: "Queen Elizabeth",     type: "cruise", operator: "Cunard",          arr: null,    dep: null,    capacity: 2092 },
    { name: "CMA CGM Blue Whale",  type: "cargo",  operator: "CMA CGM",        arr: "07:00", dep: "19:00", origin: "Freeport, Bahamas",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-13": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean",   arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",       arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",         arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Norwegian Pearl",     type: "cruise", operator: "Norwegian",         arr: null,    dep: null,    capacity: 2394 },
    { name: "Scarlet Lady",        type: "cruise", operator: "Virgin Voyages",    arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Seven Seas Splendor", type: "cruise", operator: "Regent Seven Seas", arr: "07:00", dep: "18:00", capacity:  750 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",          arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "ZIM Miami",           type: "cargo",  operator: "ZIM",              arr: "09:00", dep: null,    origin: "Santo Domingo, DR",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-14": [
    { name: "Icon of the Seas",    type: "cruise", operator: "Royal Caribbean",  arr: "06:00", dep: "16:30", capacity: 5610 },
    { name: "MSC World America",   type: "cruise", operator: "MSC Cruises",      arr: "07:00", dep: "17:00", capacity: 5252 },
    { name: "Carnival Horizon",    type: "cruise", operator: "Carnival",         arr: "08:00", dep: "15:30", capacity: 3960 },
    { name: "Norwegian Encore",    type: "cruise", operator: "Norwegian",        arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Resilient Lady",      type: "cruise", operator: "Virgin Voyages",   arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Seven Seas Grandeur", type: "cruise", operator: "Regent Seven Seas",arr: "07:00", dep: "17:00", capacity:  746 },
    { name: "Zuiderdam",           type: "cruise", operator: "Holland America",  arr: "07:00", dep: "16:00", capacity: 1964 },
    { name: "Hapag-Lloyd Miami",   type: "cargo",  operator: "Hapag-Lloyd",     arr: "10:00", dep: null,    origin: "Port of Spain, TT",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-15": [
    { name: "Symphony of the Seas",     type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 5518 },
    { name: "Carnival Celebration",     type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 5374 },
    { name: "Carnival Magic",           type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3690 },
    { name: "Independence of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 3869 },
    { name: "Norwegian Aqua",           type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3571 },
    { name: "Norwegian Jewel",          type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 2368 },
    { name: "Celebrity Beyond",         type: "cruise", operator: "Celebrity",       arr: "07:00", dep: "16:00", capacity: 3260 },
    { name: "King Ocean Infinity",      type: "cargo",  operator: "King Ocean",      arr: "08:00", dep: null,    origin: "Cartagena, Colombia",  destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",                  type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],

  // ════════════════════════════════
  // Week 3 — Mar 16–22
  // ════════════════════════════════

  "2026-03-16": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "Crowley Commander",   type: "cargo",  operator: "Crowley Maritime", arr: "05:00", dep: "19:00", origin: "San Juan, PR",        destination: "Miami, FL",     cargoKind: "RoRo / Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-17": [
    { name: "Oceania Nautica",     type: "cruise", operator: "Oceania",   arr: "08:00", dep: "17:00", capacity: 684 },
    { name: "Seaboard Ranger",     type: "cargo",  operator: "Seaboard Marine", arr: "07:00", dep: "20:00", origin: "Puerto Cortés, HN",    destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-18": [
    { name: "Scarlet Lady",        type: "cruise", operator: "Virgin Voyages",   arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Explora II",          type: "cruise", operator: "Explora Journeys", arr: "07:00", dep: "17:00", capacity:  920 },
    { name: "CMA CGM Blue Whale",  type: "cargo",  operator: "CMA CGM",         arr: "07:00", dep: "19:00", origin: "Nassau, Bahamas",      destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-19": [
    { name: "Maersk Miami",        type: "cargo",  operator: "Maersk",          arr: "09:00", dep: null,    origin: "Bridgetown, Barbados",  destination: "Miami, FL",     cargoKind: "Container" },
    { name: "ZIM Miami",           type: "cargo",  operator: "ZIM",             arr: null,    dep: "21:00", origin: "Miami, FL",            destination: "Santo Domingo, DR", cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-20": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Norwegian Pearl",     type: "cruise", operator: "Norwegian",       arr: null,    dep: null,    capacity: 2394 },
    { name: "Resilient Lady",      type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Tropical Mist",       type: "cargo",  operator: "Tropical Shipping", arr: "07:00", dep: "17:00", origin: "Nassau, Bahamas",     destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-21": [
    { name: "Icon of the Seas",    type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5610 },
    { name: "MSC World America",   type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "18:00", capacity: 5252 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "Norwegian Encore",    type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "Carnival Magic",      type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3690 },
    { name: "Brilliant Lady",      type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Oceania Allura",      type: "cruise", operator: "Oceania",         arr: "07:00", dep: "17:00", capacity: 1200 },
    { name: "King Ocean Spirit",   type: "cargo",  operator: "King Ocean",      arr: null,    dep: "08:00", origin: "Miami, FL",            destination: "Barranquilla, CO", cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-22": [
    { name: "Symphony of the Seas",     type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 5518 },
    { name: "Carnival Celebration",     type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 5374 },
    { name: "Carnival Horizon",         type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3960 },
    { name: "Independence of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 3869 },
    { name: "MSC Divina",               type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 3502 },
    { name: "Norwegian Aqua",           type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3571 },
    { name: "Celebrity Beyond",         type: "cruise", operator: "Celebrity",       arr: "07:00", dep: "16:00", capacity: 3260 },
    { name: "Scarlet Lady",             type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Seaboard Glory",           type: "cargo",  operator: "Seaboard Marine", arr: "07:00", dep: null,    origin: "Puerto Limón, CR",     destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",                  type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],

  // ════════════════════════════════
  // Week 4 — Mar 23–29
  // ════════════════════════════════

  "2026-03-23": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Norwegian Luna",      type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "18:00", capacity: 3570 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Crowley Navigator",   type: "cargo",  operator: "Crowley Maritime", arr: "06:00", dep: "18:00", origin: "San Juan, PR",        destination: "Miami, FL",     cargoKind: "RoRo / Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-24": [
    { name: "Queen Elizabeth",     type: "cruise", operator: "Cunard",    arr: null, dep: null,    capacity: 2092 },
    { name: "APL Antwerp",         type: "cargo",  operator: "APL",       arr: "11:00", dep: null, origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Hapag-Lloyd Miami",   type: "cargo",  operator: "Hapag-Lloyd", arr: "14:00", dep: null, origin: "Port of Spain, TT",   destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-25": [
    { name: "Norwegian Pearl",     type: "cruise", operator: "Norwegian",       arr: null,    dep: null,    capacity: 2394 },
    { name: "Zuiderdam",           type: "cruise", operator: "Holland America", arr: "07:00", dep: "16:00", capacity: 1964 },
    { name: "Tropical Isle",       type: "cargo",  operator: "Tropical Shipping", arr: "07:00", dep: "17:00", origin: "Nassau, Bahamas",     destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "ZIM Miami",           type: "cargo",  operator: "ZIM",             arr: "09:00", dep: null,    origin: "Freeport, Bahamas",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-26": [
    { name: "Azamara Quest",       type: "cruise", operator: "Azamara",          arr: "06:00", dep: "17:00", capacity:  698 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",         arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean",  arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "Norwegian Jewel",     type: "cruise", operator: "Norwegian",        arr: "07:00", dep: "16:00", capacity: 2368 },
    { name: "Seven Seas Grandeur", type: "cruise", operator: "Regent Seven Seas",arr: "07:00", dep: "18:00", capacity:  746 },
    { name: "CMA CGM Blue Whale",  type: "cargo",  operator: "CMA CGM",         arr: "07:00", dep: "19:00", origin: "Nassau, Bahamas",      destination: "Miami, FL",     cargoKind: "Container" },
    { name: "Seaboard Ranger",     type: "cargo",  operator: "Seaboard Marine",  arr: "08:00", dep: null,    origin: "Puerto Cortés, HN",    destination: "Miami, FL",     cargoKind: "Container / Reefer" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-27": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Norwegian Luna",      type: "cruise", operator: "Norwegian",       arr: "06:00", dep: null,    capacity: 3570 },
    { name: "Scarlet Lady",        type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "Oceania Nautica",     type: "cruise", operator: "Oceania",         arr: "08:00", dep: "17:00", capacity:  684 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Maersk Miami",        type: "cargo",  operator: "Maersk",          arr: "10:00", dep: null,    origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-28": [
    { name: "Icon of the Seas",    type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5610 },
    { name: "MSC World America",   type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 5252 },
    { name: "Carnival Horizon",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3960 },
    { name: "Norwegian Encore",    type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Resilient Lady",      type: "cruise", operator: "Virgin Voyages",  arr: "06:30", dep: "17:00", capacity: 2860 },
    { name: "King Ocean Spirit",   type: "cargo",  operator: "King Ocean",      arr: "09:00", dep: null,    origin: "Barranquilla, CO",     destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
  "2026-03-29": [
    { name: "Symphony of the Seas",     type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 5518 },
    { name: "Carnival Celebration",     type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 5374 },
    { name: "Carnival Magic",           type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 3690 },
    { name: "Independence of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:00", capacity: 3869 },
    { name: "MSC Divina",               type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "18:00", capacity: 3502 },
    { name: "Norwegian Aqua",           type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3571 },
    { name: "Norwegian Pearl",          type: "cruise", operator: "Norwegian",       arr: null,    dep: null,    capacity: 2394 },
    { name: "Celebrity Beyond",         type: "cruise", operator: "Celebrity",       arr: "07:00", dep: "16:00", capacity: 3260 },
    { name: "Crowley Commander",        type: "cargo",  operator: "Crowley Maritime", arr: "06:00", dep: "18:00", origin: "San Juan, PR",        destination: "Miami, FL",     cargoKind: "RoRo / Container" },
    { name: "SEAFAIR",                  type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],

  // ════════════════════════════════
  // Week 5 — Mar 30+
  // ════════════════════════════════

  "2026-03-30": [
    { name: "Wonder of the Seas",  type: "cruise", operator: "Royal Caribbean", arr: "06:00", dep: "16:30", capacity: 5734 },
    { name: "Freedom of the Seas", type: "cruise", operator: "Royal Caribbean", arr: "06:30", dep: "16:30", capacity: 3634 },
    { name: "MSC Seaside",         type: "cruise", operator: "MSC Cruises",     arr: "07:00", dep: "17:00", capacity: 4132 },
    { name: "Norwegian Getaway",   type: "cruise", operator: "Norwegian",       arr: "07:00", dep: "16:00", capacity: 3963 },
    { name: "Carnival Conquest",   type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2980 },
    { name: "Carnival Sunrise",    type: "cruise", operator: "Carnival",        arr: "08:00", dep: "15:30", capacity: 2984 },
    { name: "APL Antwerp",         type: "cargo",  operator: "APL",             arr: "09:00", dep: null,    origin: "Kingston, Jamaica",    destination: "Miami, FL",     cargoKind: "Container" },
    { name: "SEAFAIR",             type: "superyacht", operator: "Charter", arr: null, dep: null, origin: "Permanent berth", lengthFt: 196, flag: "United States", yachtKind: "Charter" },
  ],
};

// ─────────────────────────────────────────────
// Weeks (Mon–Sun)
// ─────────────────────────────────────────────
const WEEKS = [
  { label: "MAR 2–8",   startMon: "2026-03-02" },
  { label: "MAR 9–15",  startMon: "2026-03-09" },
  { label: "MAR 16–22", startMon: "2026-03-16" },
  { label: "MAR 23–29", startMon: "2026-03-23" },
  { label: "MAR 30+",   startMon: "2026-03-30" },
];

const DAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function getISO(startMon: string, dayOffset: number): string {
  const d = new Date(startMon + "T12:00:00");
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────
// Vessel card
// ─────────────────────────────────────────────
const TYPE_META: Record<VesselType, { label: string; fg: string; bg: string }> = {
  cruise:     { label: "CRUISE",     fg: "#1d4ed8", bg: "rgba(29,78,216,0.08)"  },
  cargo:      { label: "CARGO",      fg: "#b45309", bg: "rgba(180,83,9,0.08)"   },
  superyacht: { label: "SUPERYACHT", fg: "#6d28d9", bg: "rgba(109,40,217,0.08)" },
};

function VesselCard({ vessel }: { vessel: Vessel }) {
  const tc = TYPE_META[vessel.type];
  const oc = opColor(vessel.operator);

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "10px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Top row: name + type badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
          {vessel.name}
        </div>
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 7px", borderRadius: "3px", color: tc.fg, background: tc.bg, flexShrink: 0 }}>
          {tc.label}
        </span>
      </div>

      {/* Operator badge */}
      <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", padding: "1px 8px", borderRadius: "3px", color: oc.fg, background: oc.bg, alignSelf: "flex-start" }}>
        {vessel.operator.toUpperCase()}
      </span>

      {/* Times */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
        <div style={{ background: "#f9fafb", borderRadius: "6px", padding: "7px 10px" }}>
          <div style={{ fontSize: "9px", color: "#9ca3af", letterSpacing: "0.08em", marginBottom: "2px" }}>ARRIVAL</div>
          <div style={{ fontSize: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: vessel.arr ? "#16a34a" : "#d1d5db" }}>
            {vessel.arr ?? "—"}
          </div>
        </div>
        <div style={{ background: "#f9fafb", borderRadius: "6px", padding: "7px 10px" }}>
          <div style={{ fontSize: "9px", color: "#9ca3af", letterSpacing: "0.08em", marginBottom: "2px" }}>DEPARTURE</div>
          <div style={{ fontSize: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: vessel.dep ? "#dc2626" : "#d1d5db" }}>
            {vessel.dep ?? "—"}
          </div>
        </div>
      </div>

      {/* Type-specific detail row */}
      <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "8px", fontSize: "11px", color: "#6b7280" }}>
        {vessel.type === "cruise" && vessel.capacity && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Passenger Capacity</span>
            <span style={{ fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
              {vessel.capacity.toLocaleString()}
            </span>
          </div>
        )}
        {vessel.type === "cargo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "baseline" }}>
              <span style={{ color: "#9ca3af", minWidth: "42px" }}>FROM</span>
              <span style={{ fontWeight: 600, color: "#374151" }}>{vessel.origin ?? "—"}</span>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "baseline" }}>
              <span style={{ color: "#9ca3af", minWidth: "42px" }}>TO</span>
              <span style={{ fontWeight: 600, color: "#374151" }}>{vessel.destination ?? "—"}</span>
            </div>
            {vessel.cargoKind && (
              <div style={{ display: "flex", gap: "6px", alignItems: "baseline" }}>
                <span style={{ color: "#9ca3af", minWidth: "42px" }}>TYPE</span>
                <span style={{ color: "#6b7280" }}>{vessel.cargoKind}</span>
              </div>
            )}
          </div>
        )}
        {vessel.type === "superyacht" && (
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
            {vessel.lengthFt && (
              <span style={{ fontWeight: 600, color: "#374151" }}>{vessel.lengthFt} ft</span>
            )}
            {vessel.flag && <span>{vessel.flag}</span>}
            {vessel.yachtKind && (
              <span style={{ fontWeight: 600, color: oc.fg }}>{vessel.yachtKind}</span>
            )}
            {vessel.origin && (
              <span style={{ width: "100%", color: "#9ca3af" }}>
                From: <span style={{ color: "#6b7280" }}>{vessel.origin}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function MiamiCruisePage() {
  const [weekIdx, setWeekIdx] = useState(0);
  const [dayOffset, setDayOffset] = useState(0); // 0=Mon … 6=Sun
  const [filter, setFilter] = useState<VesselType | "all">("all");
  const [today, setToday] = useState("");

  useEffect(() => {
    const t = todayISO();
    setToday(t);
    // Find the correct week
    const wi = WEEKS.findIndex((w, i) => {
      const nextMon = WEEKS[i + 1]?.startMon;
      return !nextMon || t <= nextMon;
    });
    const safeWi = Math.max(0, wi);
    setWeekIdx(safeWi);
    // Find the correct day offset
    const base = new Date(WEEKS[safeWi].startMon + "T12:00:00");
    const tDate = new Date(t + "T12:00:00");
    const diff = Math.round((tDate.getTime() - base.getTime()) / 86400000);
    if (diff >= 0 && diff <= 6) setDayOffset(diff);
  }, []);

  const week = WEEKS[weekIdx];

  const currentISO = getISO(week.startMon, dayOffset);
  const allVessels = SCHEDULE[currentISO] ?? [];
  const filtered = filter === "all" ? allVessels : allVessels.filter(v => v.type === filter);

  const cruiseCount = allVessels.filter(v => v.type === "cruise").length;
  const cargoCount  = allVessels.filter(v => v.type === "cargo").length;
  const yachtCount  = allVessels.filter(v => v.type === "superyacht").length;

  const FILTER_OPTS: { key: VesselType | "all"; label: string }[] = [
    { key: "all",        label: `All (${allVessels.length})` },
    { key: "cruise",     label: `Cruise (${cruiseCount})` },
    { key: "cargo",      label: `Cargo (${cargoCount})` },
    { key: "superyacht", label: `Superyacht (${yachtCount})` },
  ];

  return (
    <div style={{ background: "#f9fafb", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", background: "linear-gradient(135deg,#1d4ed8,#0369a1)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>⚓</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#111827", letterSpacing: "-0.2px" }}>Port Miami Vessel Tracker</h1>
            <p style={{ margin: 0, fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>Cruise · Cargo · Superyacht — Full Week View</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: 600 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </div>
          <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px" }}>
            Cruise: CruiseTimetables.com · Cargo &amp; Yachts: AIS / Port records
          </div>
        </div>
      </header>

      {/* ── Week navigator ── */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={weekIdx === 0}
          style={{ background: "none", border: "1px solid #d1d5db", color: weekIdx === 0 ? "#d1d5db" : "#374151", padding: "5px 14px", borderRadius: "6px", cursor: weekIdx === 0 ? "not-allowed" : "pointer", fontSize: "12px", fontFamily: "inherit" }}>
          ← Prev
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: "13px", fontWeight: 700, color: "#111827", letterSpacing: "0.02em" }}>
          Week of {week.label}, 2026
        </div>
        <button onClick={() => setWeekIdx(i => Math.min(WEEKS.length - 1, i + 1))} disabled={weekIdx === WEEKS.length - 1}
          style={{ background: "none", border: "1px solid #d1d5db", color: weekIdx === WEEKS.length - 1 ? "#d1d5db" : "#374151", padding: "5px 14px", borderRadius: "6px", cursor: weekIdx === WEEKS.length - 1 ? "not-allowed" : "pointer", fontSize: "12px", fontFamily: "inherit" }}>
          Next →
        </button>
      </div>

      {/* ── Day tabs ── */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "0 24px", display: "flex", gap: "0", overflowX: "auto" }}>
        {DAY_NAMES.map((day, i) => {
          const iso = getISO(week.startMon, i);
          const vessels = SCHEDULE[iso] ?? [];
          const isActive = i === dayOffset;
          const isToday = iso === today;
          return (
            <button key={day} onClick={() => setDayOffset(i)}
              style={{
                background: "none", border: "none", borderBottom: isActive ? "2px solid #1d4ed8" : "2px solid transparent",
                padding: "12px 16px", cursor: "pointer", fontFamily: "inherit",
                color: isActive ? "#1d4ed8" : isToday ? "#0369a1" : "#6b7280",
                fontWeight: isActive ? 700 : 500, fontSize: "12px", whiteSpace: "nowrap",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
              }}>
              <span style={{ letterSpacing: "0.06em" }}>{day}</span>
              <span style={{ fontSize: "10px", color: isActive ? "#1d4ed8" : "#9ca3af" }}>
                {fmtShortDate(iso)}
              </span>
              {vessels.length > 0 && (
                <span style={{ fontSize: "9px", fontWeight: 700, background: isActive ? "#1d4ed8" : "#e5e7eb", color: isActive ? "#fff" : "#6b7280", borderRadius: "10px", padding: "1px 6px" }}>
                  {vessels.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filter chips + stats ── */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {FILTER_OPTS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{
                background: filter === key ? "#1d4ed8" : "#f3f4f6",
                color: filter === key ? "#fff" : "#374151",
                border: "none", borderRadius: "100px", padding: "4px 12px",
                fontSize: "11px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "11px", color: "#9ca3af" }}>
          {filtered.length} vessel{filtered.length !== 1 ? "s" : ""} shown
        </div>
      </div>

      {/* ── Vessel grid ── */}
      <div style={{ flex: 1, padding: "20px 24px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: "13px" }}>
            <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.4 }}>⚓</div>
            No vessels scheduled for this day
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {filtered.map((v, i) => <VesselCard key={`${v.name}-${i}`} vessel={v} />)}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{ background: "#ffffff", borderTop: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "10px", color: "#9ca3af", flexWrap: "wrap", gap: "6px" }}>
        <span>Port of Miami · 1015 North America Way, Miami FL 33132</span>
        <span>Cargo routes based on published carrier schedules. Superyacht data from public AIS records. Times in ET.</span>
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        button { transition: opacity 0.1s; }
        button:hover:not(:disabled) { opacity: 0.85; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #f9fafb; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
      `}</style>
    </div>
  );
}
