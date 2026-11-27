/**
 * The GST state of a studio's onboarding city, so checkout can fill in the
 * place of supply for it (the studio sees it beside the taxes and can change
 * it). Covers every city in lib/indian-cities.ts and the common other names
 * for them. A name shared by towns in two states (Aurangabad, Bilaspur) maps
 * to the bigger one. Anything else falls back to a state named in the text.
 */
import { GST_STATE_CODES, findGstStateInAddress } from "./gst-state-codes.ts";

const CITY_STATE_CODE: Record<string, string> = {
  agartala: "16", agra: "09", ahmedabad: "24", ahmednagar: "27", aizawl: "15", ajmer: "08", akola: "27", aligarh: "09",
  allahabad: "09", prayagraj: "09", alwar: "08", ambala: "06", amravati: "27", amritsar: "03", anand: "24", anantapur: "37",
  asansol: "19", aurangabad: "27", "chhatrapati sambhajinagar": "27", ayodhya: "09", bareilly: "09", belagavi: "29", belgaum: "29",
  ballari: "29", bellary: "29", bengaluru: "29", bangalore: "29", bhagalpur: "10", bharatpur: "08", bhavnagar: "24", bhilai: "22",
  bhilwara: "08", bhiwandi: "27", bhopal: "23", bhubaneswar: "21", bhuj: "24", bikaner: "08", bilaspur: "22", bokaro: "20",
  chandigarh: "04", chennai: "33", madras: "33", chhindwara: "23", coimbatore: "33", cuttack: "21", darbhanga: "10",
  davanagere: "29", dehradun: "05", delhi: "07", "new delhi": "07", dhanbad: "20", dibrugarh: "18", dimapur: "13",
  durgapur: "19", erode: "33", faridabad: "06", firozabad: "09", gandhinagar: "24", gangtok: "11", gaya: "10",
  ghaziabad: "09", gorakhpur: "09", gurugram: "06", gurgaon: "06", guntur: "37", guwahati: "18", gwalior: "23",
  haldwani: "05", hapur: "09", haridwar: "05", hisar: "06", hosur: "33", hubballi: "29", hubli: "29", "hubli dharwad": "29",
  hyderabad: "36", secunderabad: "36", imphal: "14", indore: "23", itanagar: "12", jabalpur: "23", jaipur: "08",
  jalandhar: "03", jalgaon: "27", jamnagar: "24", jamshedpur: "20", jhansi: "09", jodhpur: "08", junagadh: "24",
  kakinada: "37", kanpur: "09", karnal: "06", karur: "33", katni: "23", khammam: "36", kochi: "32", cochin: "32",
  ernakulam: "32", kohima: "13", kolhapur: "27", kolkata: "19", calcutta: "19", howrah: "19", kollam: "32", korba: "22",
  kota: "08", kozhikode: "32", calicut: "32", kurnool: "37", latur: "27", lucknow: "09", ludhiana: "03", madurai: "33",
  malappuram: "32", mangaluru: "29", mangalore: "29", mathura: "09", meerut: "09", moradabad: "09", morbi: "24",
  mumbai: "27", bombay: "27", muzaffarpur: "10", mysuru: "29", mysore: "29", nagpur: "27", nanded: "27", nashik: "27",
  "navi mumbai": "27", nellore: "37", noida: "09", "greater noida": "09", palakkad: "32", panaji: "30", panjim: "30",
  panipat: "06", patiala: "03", patna: "10", "pimpri chinchwad": "27", pondicherry: "34", puducherry: "34", pune: "27",
  poona: "27", raipur: "22", rajahmundry: "37", rajamahendravaram: "37", rajkot: "24", ranchi: "20", ratlam: "23",
  rewa: "23", rohtak: "06", roorkee: "05", rourkela: "21", sagar: "23", saharanpur: "09", salem: "33", sambalpur: "21",
  sangli: "27", satna: "23", shillong: "17", shimla: "02", siliguri: "19", solapur: "27", sonipat: "06", srinagar: "01",
  surat: "24", thane: "27", thanjavur: "33", thiruvananthapuram: "32", trivandrum: "32", thrissur: "32", trichur: "32",
  tiruchirappalli: "33", trichy: "33", tirunelveli: "33", tirupati: "37", udaipur: "08", ujjain: "23", vadodara: "24",
  baroda: "24", varanasi: "09", banaras: "09", benares: "09", "vasai virar": "27", vellore: "33", vijayawada: "37",
  visakhapatnam: "37", vizag: "37", warangal: "36",
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const KEYS_LONGEST_FIRST = Object.keys(CITY_STATE_CODE).sort((a, b) => b.length - a.length);

/** The GST state for a city typed at onboarding: "Bhopal", "bangalore", "Bhopal, MP", "Allahabad (Prayagraj)". Null when unknown. */
export function stateForCity(city: string | null | undefined): { code: string; name: string } | null {
  if (!city) return null;
  const text = normalize(city);
  if (!text) return null;
  const words = ` ${text} `;
  // The whole text, else the longest listed city it starts with or names as a word ("navi mumbai" before "mumbai").
  const key =
    (CITY_STATE_CODE[text] ? text : null) ??
    KEYS_LONGEST_FIRST.find((k) => text.startsWith(`${k} `)) ??
    KEYS_LONGEST_FIRST.find((k) => words.includes(` ${k} `)) ??
    null;
  if (key) return GST_STATE_CODES.find((s) => s.code === CITY_STATE_CODE[key]) ?? null;
  return findGstStateInAddress(city);
}
