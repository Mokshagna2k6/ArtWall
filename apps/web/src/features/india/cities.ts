/**
 * Art cities of India, positioned by real coordinates, on a national outline.
 *
 * The outline was originally left out on purpose, and the reason still stands
 * and is worth reading before anyone touches `indiaOutline` below: depicting
 * India's boundaries inaccurately is a genuine compliance matter for an Indian
 * company, because Survey of India governs how the national map may be shown.
 *
 * It is drawn now because the founder asked for it, and the risk is handled
 * rather than avoided — the shape includes the whole of Jammu & Kashmir,
 * Ladakh and Arunachal Pradesh as Indian territory, which is what the law
 * requires, and it is flagged in place as approximate geometry to be replaced
 * from an official source before launch. See the note on `indiaOutline`.
 *
 * The cities remain the point. The landmass is a ground for them to sit on,
 * drawn as a hairline rather than a filled shape so it never competes with the
 * lights.
 */
export type Region =
  | "North"
  | "Northeast"
  | "East"
  | "West"
  | "Central"
  | "South";

export const regions: readonly Region[] = [
  "North",
  "Northeast",
  "East",
  "West",
  "Central",
  "South",
] as const;

export interface City {
  name: string;
  state: string;
  lat: number;
  lon: number;
  /** What this place is known for - shown on hover. */
  known: string;
  /**
   * Used by the map's filter chips. Northeast is kept separate from East
   * rather than folded into it: it is a distinct set of traditions, and
   * collapsing it would erase the one city on this map that represents them.
   */
  region: Region;
}

export const cities: readonly City[] = [
  {
    name: "Srinagar",
    state: "J&K",
    lat: 34.08,
    lon: 74.8,
    known: "Papier-mâché, Kashmiri crewel",
    region: "North",
  },
  {
    name: "Delhi",
    state: "Delhi",
    lat: 28.61,
    lon: 77.21,
    known: "Contemporary, galleries",
    region: "North",
  },
  {
    name: "Jaipur",
    state: "Rajasthan",
    lat: 26.91,
    lon: 75.79,
    known: "Miniature, blue pottery",
    region: "North",
  },
  {
    name: "Udaipur",
    state: "Rajasthan",
    lat: 24.58,
    lon: 73.68,
    known: "Pichwai, miniature",
    region: "North",
  },
  {
    name: "Sikar",
    state: "Rajasthan",
    lat: 27.61,
    lon: 75.14,
    known: "Shekhawati fresco, haveli painting",
    region: "North",
  },
  {
    name: "Lucknow",
    state: "Uttar Pradesh",
    lat: 26.84,
    lon: 80.94,
    known: "Chikankari, zardozi",
    region: "North",
  },
  {
    name: "Varanasi",
    state: "Uttar Pradesh",
    lat: 25.32,
    lon: 82.97,
    known: "Banarasi weave",
    region: "North",
  },
  {
    name: "Madhubani",
    state: "Bihar",
    lat: 26.35,
    lon: 86.07,
    known: "Mithila painting",
    region: "East",
  },
  {
    name: "Patna",
    state: "Bihar",
    lat: 25.59,
    lon: 85.14,
    known: "Patna Kalam, Madhubani",
    region: "East",
  },
  {
    name: "Guwahati",
    state: "Assam",
    lat: 26.14,
    lon: 91.73,
    known: "Assamese silk, mask-making",
    region: "Northeast",
  },
  {
    name: "Santiniketan",
    state: "West Bengal",
    lat: 23.68,
    lon: 87.68,
    known: "Bengal School, batik",
    region: "East",
  },
  {
    name: "Kolkata",
    state: "West Bengal",
    lat: 22.57,
    lon: 88.36,
    known: "Kalighat, contemporary",
    region: "East",
  },
  {
    name: "Ahmedabad",
    state: "Gujarat",
    lat: 23.02,
    lon: 72.57,
    known: "Textile, block print",
    region: "West",
  },
  {
    name: "Bhopal",
    state: "Madhya Pradesh",
    lat: 23.25,
    lon: 77.41,
    known: "Gond, tribal art",
    region: "Central",
  },
  {
    name: "Bhubaneswar",
    state: "Odisha",
    lat: 20.29,
    lon: 85.82,
    known: "Pattachitra, stone carving",
    region: "East",
  },
  {
    name: "Mumbai",
    state: "Maharashtra",
    lat: 19.08,
    lon: 72.88,
    known: "Contemporary, galleries",
    region: "West",
  },
  {
    name: "Pune",
    state: "Maharashtra",
    lat: 18.52,
    lon: 73.85,
    known: "Warli, contemporary",
    region: "West",
  },
  {
    name: "Hyderabad",
    state: "Telangana",
    lat: 17.38,
    lon: 78.49,
    known: "Kalamkari, Cheriyal",
    region: "South",
  },
  {
    name: "Panaji",
    state: "Goa",
    lat: 15.49,
    lon: 73.82,
    known: "Azulejo, contemporary",
    region: "West",
  },
  {
    name: "Bengaluru",
    state: "Karnataka",
    lat: 12.97,
    lon: 77.59,
    known: "Contemporary, digital",
    region: "South",
  },
  {
    name: "Chennai",
    state: "Tamil Nadu",
    lat: 13.08,
    lon: 80.27,
    known: "Tanjore, bronze",
    region: "South",
  },
  {
    name: "Kochi",
    state: "Kerala",
    lat: 9.93,
    lon: 76.26,
    known: "Mural, Biennale",
    region: "South",
  },
  {
    name: "Bhuj",
    state: "Gujarat",
    lat: 23.24,
    lon: 69.67,
    known: "Ajrakh block print, Rogan art",
    region: "West",
  },
  {
    name: "Jodhpur",
    state: "Rajasthan",
    lat: 26.24,
    lon: 73.02,
    known: "Bandhani, lacquer",
    region: "North",
  },
  {
    name: "Bikaner",
    state: "Rajasthan",
    lat: 28.02,
    lon: 73.31,
    known: "Usta gold work, miniature",
    region: "North",
  },
  {
    name: "Agra",
    state: "Uttar Pradesh",
    lat: 27.18,
    lon: 78.01,
    known: "Marble inlay, pietra dura",
    region: "North",
  },
  {
    name: "Amritsar",
    state: "Punjab",
    lat: 31.63,
    lon: 74.87,
    known: "Phulkari embroidery",
    region: "North",
  },
  {
    name: "Kangra",
    state: "Himachal Pradesh",
    lat: 32.1,
    lon: 76.27,
    known: "Kangra miniature, Pahari",
    region: "North",
  },
  {
    name: "Jammu",
    state: "J&K",
    lat: 32.73,
    lon: 74.86,
    known: "Basohli painting",
    region: "North",
  },
  {
    name: "Surat",
    state: "Gujarat",
    lat: 21.17,
    lon: 72.83,
    known: "Zari, silk weaving",
    region: "West",
  },
  {
    name: "Aurangabad",
    state: "Maharashtra",
    lat: 19.88,
    lon: 75.34,
    known: "Paithani weave, Ajanta",
    region: "West",
  },
  {
    name: "Indore",
    state: "Madhya Pradesh",
    lat: 22.72,
    lon: 75.86,
    known: "Maheshwari weave",
    region: "Central",
  },
  {
    name: "Raipur",
    state: "Chhattisgarh",
    lat: 21.25,
    lon: 81.63,
    known: "Dhokra metal, bell metal",
    region: "Central",
  },
  {
    name: "Nagpur",
    state: "Maharashtra",
    lat: 21.15,
    lon: 79.09,
    known: "Contemporary, Gondi",
    region: "Central",
  },
  {
    name: "Puri",
    state: "Odisha",
    lat: 19.81,
    lon: 85.83,
    known: "Pattachitra, palm-leaf etching",
    region: "East",
  },
  {
    name: "Bhagalpur",
    state: "Bihar",
    lat: 25.24,
    lon: 87.0,
    known: "Tussar silk",
    region: "East",
  },
  {
    name: "Gangtok",
    state: "Sikkim",
    lat: 27.34,
    lon: 88.61,
    known: "Thangka, Lepcha weave",
    region: "Northeast",
  },
  {
    name: "Shillong",
    state: "Meghalaya",
    lat: 25.58,
    lon: 91.89,
    known: "Cane and bamboo, Khasi weave",
    region: "Northeast",
  },
  {
    name: "Imphal",
    state: "Manipur",
    lat: 24.82,
    lon: 93.94,
    known: "Moirang Phee, longpi pottery",
    region: "Northeast",
  },
  {
    name: "Agartala",
    state: "Tripura",
    lat: 23.83,
    lon: 91.28,
    known: "Risa weave, bamboo craft",
    region: "Northeast",
  },
  {
    name: "Itanagar",
    state: "Arunachal Pradesh",
    lat: 27.08,
    lon: 93.61,
    known: "Apatani weave, wood carving",
    region: "Northeast",
  },
  {
    name: "Mysuru",
    state: "Karnataka",
    lat: 12.3,
    lon: 76.64,
    known: "Mysore painting, sandalwood",
    region: "South",
  },
  {
    name: "Thanjavur",
    state: "Tamil Nadu",
    lat: 10.79,
    lon: 79.14,
    known: "Tanjore gold leaf, bronze",
    region: "South",
  },
  {
    name: "Kanchipuram",
    state: "Tamil Nadu",
    lat: 12.84,
    lon: 79.7,
    known: "Kanjivaram silk",
    region: "South",
  },
  {
    name: "Madurai",
    state: "Tamil Nadu",
    lat: 9.92,
    lon: 78.12,
    known: "Sungudi, temple craft",
    region: "South",
  },
  {
    name: "Puducherry",
    state: "Puducherry",
    lat: 11.93,
    lon: 79.83,
    known: "Terracotta, contemporary",
    region: "South",
  },
];

/**
 * Look a city up the way people actually type it.
 *
 * The city column on the roster is free text, so "JAIPUR", "jaipur" and
 * " Jaipur " all occur. Matching on the exact string meant a city with four
 * artists in it lit nothing on the map. This is the one place that mismatch
 * gets reconciled, and everything downstream works in canonical names.
 */
export function findCity(value: string | null | undefined): City | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  return cities.find((city) => city.name.toLowerCase() === key);
}

/** The canonical key for a city name, for matching against roster figures. */
export function cityKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Bounding box used to project coordinates into the 0–100 viewBox.
 *
 * Widened from the original city-only box so the whole landmass fits: India's
 * territory reaches ~37.1°N in the north and ~97.4°E in Arunachal, both well
 * outside a box drawn around the city list alone.
 */
const BOUNDS = { minLat: 6, maxLat: 38, minLon: 67, maxLon: 98 };

/**
 * The viewBox this projection is designed to fill: 100 wide, 112 tall.
 *
 * The ratio is not arbitrary. The box spans 31° of longitude and 32° of
 * latitude, but a degree of longitude is shorter than a degree of latitude at
 * these latitudes — about 111·cos(23°) ≈ 102 km against 111 km. So the box is
 * roughly 3168 km wide and 3552 km tall, a ratio of 1.12, and drawing it 100 ×
 * 112 keeps India the shape it actually is.
 *
 * Both axes must be scaled by their own extent. Scaling y by 100 (as this did
 * originally) squashed the country vertically *and* left it floating in the top
 * 89% of the frame — which is what made the outline read as a squat blob.
 */
export const VIEWBOX = { width: 100, height: 112 } as const;

export function project(point: { lat: number; lon: number }): {
  x: number;
  y: number;
} {
  return {
    x:
      ((point.lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) *
      VIEWBOX.width,
    // SVG y grows downward, so latitude is inverted.
    y:
      ((BOUNDS.maxLat - point.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) *
      VIEWBOX.height,
  };
}

/**
 * The national outline, as [lat, lon] pairs traced clockwise from the north-west.
 *
 * ⚠️ APPROXIMATE — VERIFY BEFORE LAUNCH.
 *
 * Depicting India's boundaries inaccurately is a genuine compliance matter for
 * an Indian company: Survey of India governs how the national map may be shown,
 * and the territory shown here deliberately includes the whole of Jammu &
 * Kashmir, Ladakh (including Aksai Chin) and Arunachal Pradesh, which is the
 * position Indian law requires.
 *
 * The geometry itself is a low-resolution trace, accurate enough to read as
 * India and *not* accurate enough to publish as a survey. Replace this array
 * with coordinates from an official source before this page goes to production.
 * Because it is expressed in lat/lon and pushed through the same `project()`
 * as every city, swapping it needs no other change — the cities will land in
 * the right places automatically.
 */
export const indiaOutline: readonly (readonly [number, number])[] = [
  // ── Kashmir and Ladakh: the northern crown, west edge upward ──
  [32.8, 74.3], [33.5, 73.9], [34.3, 73.9], [34.9, 74.0], [35.4, 74.2],
  [36.0, 74.4], [36.6, 74.8], [36.9, 75.5], [36.6, 76.2], [36.0, 77.0],
  [35.6, 77.8], [35.5, 78.5], [35.3, 79.2], [35.0, 79.8], [34.5, 79.6],
  [34.0, 79.3], [33.5, 79.4], [33.0, 79.2], [32.6, 79.1], [32.2, 78.8],
  [31.8, 78.7], [31.4, 79.0], [31.1, 79.4], [30.8, 80.2],
  // ── The Nepal indentation, running south-east then east ──
  [30.4, 80.4], [30.0, 80.8], [29.6, 81.3], [29.3, 82.0], [29.0, 82.7],
  [28.7, 83.5], [28.3, 84.2], [27.9, 85.0], [27.6, 85.8], [27.3, 86.6],
  [27.1, 87.3], [27.0, 88.0],
  // ── Sikkim, then east along the Himalaya to Arunachal.
  //    SIMPLIFICATION: Bhutan is not carved out. Its border sits inside a
  //    ~1.5° notch that, at this scale, severed the whole northeast from the
  //    mainland — the Siliguri corridor is only ~0.2° wide and cannot survive
  //    being drawn at 100 units across. A silhouette that reads as India beats
  //    a more literal one that looks broken. Replace along with the rest of
  //    this outline when official geometry is used.
  [27.5, 88.2], [27.9, 88.5], [27.4, 89.4], [27.2, 90.4], [27.1, 91.3],
  [27.0, 92.0],
  // ── Arunachal Pradesh, along the north to the eastern tip ──
  [27.6, 92.3], [27.9, 93.0], [28.2, 93.8], [28.5, 94.6], [28.9, 95.4],
  [29.0, 96.2], [28.5, 96.9], [28.2, 97.4],
  // ── The Myanmar border, south through Nagaland and Mizoram ──
  [27.6, 97.1], [27.2, 96.9], [26.6, 96.3], [26.0, 95.5], [25.4, 95.0],
  [24.8, 94.6], [24.2, 94.3], [23.7, 93.9], [23.2, 93.4], [22.7, 93.1],
  [22.2, 92.9], [21.9, 92.6],
  // ── Around Bangladesh: Tripura, Meghalaya, the Siliguri corridor ──
  [22.4, 92.3], [23.0, 91.75], [23.4, 91.7], [24.0, 91.8], [24.6, 91.2],
  [25.1, 90.5], [25.3, 90.0], [25.7, 89.6], [26.1, 89.2], [26.3, 88.7],
  [26.1, 88.3], [25.7, 88.2], [25.2, 88.4], [24.7, 88.7], [24.2, 88.75],
  [23.6, 88.7], [23.0, 88.85], [22.5, 89.0], [22.0, 88.9],
  // ── East coast: the Sundarbans down to Kanyakumari ──
  [21.6, 88.2], [21.5, 87.5], [21.4, 87.0], [20.8, 86.9], [20.3, 86.7],
  [19.8, 86.0], [19.3, 85.2], [18.8, 84.5], [18.2, 83.9], [17.7, 83.3],
  [17.0, 82.5], [16.5, 82.0], [16.0, 81.5], [15.8, 80.8], [15.5, 80.2],
  [14.8, 80.1], [14.0, 80.1], [13.4, 80.45], [12.6, 80.4], [11.9, 80.0],
  [11.3, 79.8], [10.7, 79.8], [10.3, 79.5], [9.8, 79.2], [9.3, 79.1],
  [9.0, 78.5], [8.7, 78.2], [8.4, 78.0], [8.08, 77.55],
  // ── West coast: Kerala, Konkan, up to the Gujarat coast ──
  [8.3, 77.0], [8.6, 76.8], [9.2, 76.5], [9.9, 76.2], [10.6, 76.0],
  [11.3, 75.7], [12.0, 75.2], [12.8, 74.8], [13.6, 74.6], [14.4, 74.3],
  [15.0, 74.0], [15.5, 73.7], [16.2, 73.4], [17.0, 73.2], [17.8, 73.1],
  [18.6, 72.9], [19.3, 72.8], [20.0, 72.7], [20.7, 72.8], [21.2, 72.6],
  [21.6, 72.9],
  // ── Gujarat: the Gulf of Khambhat, Saurashtra, the Gulf of Kutch, then
  //    Kutch itself. Traced as one continuous coast — cutting the gulfs too
  //    deep is what severs Saurashtra from the mainland at this scale.
  [22.2, 72.7], [22.3, 72.3], [21.7, 72.2], [21.1, 71.5], [20.9, 70.9],
  [20.75, 70.3], [21.5, 69.6], [22.2, 68.97], [22.6, 69.6], [22.5, 70.4],
  [22.9, 70.9], [23.2, 70.3], [23.0, 69.4], [23.15, 68.6], [23.9, 68.5],
  [24.3, 69.0],
  // ── The Pakistan border, north through Rajasthan and Punjab ──
  [24.7, 70.3], [25.2, 70.7], [25.7, 70.1], [26.2, 70.0], [26.8, 69.9],
  [27.4, 70.3], [27.9, 71.0], [28.2, 71.9], [28.7, 72.5], [29.2, 73.0],
  [29.9, 73.4], [30.4, 73.9], [30.9, 74.5], [31.5, 74.6], [32.0, 74.7],
  [32.5, 74.5],
] as const;

/** The outline as an SVG path, projected identically to the cities. */
export function outlinePath(): string {
  return (
    indiaOutline
      .map(([lat, lon], index) => {
        const { x, y } = project({ lat, lon });
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}
