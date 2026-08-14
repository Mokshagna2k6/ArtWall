/**
 * Art cities of India, positioned by real coordinates.
 *
 * Deliberately rendered as a constellation of cities rather than as a national
 * outline. Two reasons, one of them serious:
 *
 *  1. Legal - depicting India's boundaries inaccurately is a genuine
 *     compliance risk for an Indian company (Survey of India guidelines govern
 *     how the national map may be shown). A hand-approximated SVG outline would
 *     almost certainly get it wrong at the borders. Cities carry no such risk.
 *  2. Honest - this map is about where artists are, not about territory. Points
 *     of light on darkness say that better than a filled landmass, and it costs
 *     a fraction of the bytes.
 */
export interface City {
  name: string;
  state: string;
  lat: number;
  lon: number;
  /** What this place is known for - shown on hover. */
  known: string;
}

export const cities: readonly City[] = [
  {
    name: "Srinagar",
    state: "J&K",
    lat: 34.08,
    lon: 74.8,
    known: "Papier-mâché, Kashmiri crewel",
  },
  {
    name: "Delhi",
    state: "Delhi",
    lat: 28.61,
    lon: 77.21,
    known: "Contemporary, galleries",
  },
  {
    name: "Jaipur",
    state: "Rajasthan",
    lat: 26.91,
    lon: 75.79,
    known: "Miniature, blue pottery",
  },
  {
    name: "Udaipur",
    state: "Rajasthan",
    lat: 24.58,
    lon: 73.68,
    known: "Pichwai, miniature",
  },
  {
    name: "Lucknow",
    state: "Uttar Pradesh",
    lat: 26.84,
    lon: 80.94,
    known: "Chikankari, zardozi",
  },
  {
    name: "Varanasi",
    state: "Uttar Pradesh",
    lat: 25.32,
    lon: 82.97,
    known: "Banarasi weave",
  },
  {
    name: "Madhubani",
    state: "Bihar",
    lat: 26.35,
    lon: 86.07,
    known: "Mithila painting",
  },
  {
    name: "Guwahati",
    state: "Assam",
    lat: 26.14,
    lon: 91.73,
    known: "Assamese silk, mask-making",
  },
  {
    name: "Santiniketan",
    state: "West Bengal",
    lat: 23.68,
    lon: 87.68,
    known: "Bengal School, batik",
  },
  {
    name: "Kolkata",
    state: "West Bengal",
    lat: 22.57,
    lon: 88.36,
    known: "Kalighat, contemporary",
  },
  {
    name: "Ahmedabad",
    state: "Gujarat",
    lat: 23.02,
    lon: 72.57,
    known: "Textile, block print",
  },
  {
    name: "Bhopal",
    state: "Madhya Pradesh",
    lat: 23.25,
    lon: 77.41,
    known: "Gond, tribal art",
  },
  {
    name: "Bhubaneswar",
    state: "Odisha",
    lat: 20.29,
    lon: 85.82,
    known: "Pattachitra, stone carving",
  },
  {
    name: "Mumbai",
    state: "Maharashtra",
    lat: 19.08,
    lon: 72.88,
    known: "Contemporary, galleries",
  },
  {
    name: "Pune",
    state: "Maharashtra",
    lat: 18.52,
    lon: 73.85,
    known: "Warli, contemporary",
  },
  {
    name: "Hyderabad",
    state: "Telangana",
    lat: 17.38,
    lon: 78.49,
    known: "Kalamkari, Cheriyal",
  },
  {
    name: "Panaji",
    state: "Goa",
    lat: 15.49,
    lon: 73.82,
    known: "Azulejo, contemporary",
  },
  {
    name: "Bengaluru",
    state: "Karnataka",
    lat: 12.97,
    lon: 77.59,
    known: "Contemporary, digital",
  },
  {
    name: "Chennai",
    state: "Tamil Nadu",
    lat: 13.08,
    lon: 80.27,
    known: "Tanjore, bronze",
  },
  {
    name: "Kochi",
    state: "Kerala",
    lat: 9.93,
    lon: 76.26,
    known: "Mural, Biennale",
  },
];

/** Bounding box used to project coordinates into the 0–100 viewBox. */
const BOUNDS = { minLat: 8, maxLat: 36, minLon: 68, maxLon: 93 };

export function project(city: City): { x: number; y: number } {
  return {
    x: ((city.lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * 100,
    // SVG y grows downward, so latitude is inverted.
    y: ((BOUNDS.maxLat - city.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100,
  };
}
