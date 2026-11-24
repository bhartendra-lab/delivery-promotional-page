/**
 * A compact list of Indian cities for the onboarding city field: the big
 * metros, every state capital, and the tier 2 and tier 3 towns studios are
 * most often in. It only SUGGESTS; the field takes any text, because a studio
 * in a town not listed here must not be stuck.
 */
export const INDIAN_CITIES: readonly string[] = [
  "Agartala", "Agra", "Ahmedabad", "Ahmednagar", "Aizawl", "Ajmer", "Akola", "Aligarh", "Allahabad (Prayagraj)", "Alwar",
  "Ambala", "Amravati", "Amritsar", "Anand", "Anantapur", "Asansol", "Aurangabad", "Ayodhya", "Bareilly", "Belagavi",
  "Ballari", "Bengaluru", "Bhagalpur", "Bharatpur", "Bhavnagar", "Bhilai", "Bhilwara", "Bhiwandi", "Bhopal", "Bhubaneswar",
  "Bhuj", "Bikaner", "Bilaspur", "Bokaro", "Chandigarh", "Chennai", "Chhindwara", "Coimbatore", "Cuttack", "Darbhanga",
  "Davanagere", "Dehradun", "Delhi", "Dhanbad", "Dibrugarh", "Dimapur", "Durgapur", "Erode", "Faridabad", "Firozabad",
  "Gandhinagar", "Gangtok", "Gaya", "Ghaziabad", "Gorakhpur", "Gurugram", "Guntur", "Guwahati", "Gwalior", "Haldwani",
  "Hapur", "Haridwar", "Hisar", "Hosur", "Hubballi", "Hyderabad", "Imphal", "Indore", "Itanagar", "Jabalpur",
  "Jaipur", "Jalandhar", "Jalgaon", "Jamnagar", "Jamshedpur", "Jhansi", "Jodhpur", "Junagadh", "Kakinada", "Kanpur",
  "Karnal", "Karur", "Katni", "Khammam", "Kochi", "Kohima", "Kolhapur", "Kolkata", "Kollam", "Korba",
  "Kota", "Kozhikode", "Kurnool", "Latur", "Lucknow", "Ludhiana", "Madurai", "Malappuram", "Mangaluru", "Mathura",
  "Meerut", "Moradabad", "Morbi", "Mumbai", "Muzaffarpur", "Mysuru", "Nagpur", "Nanded", "Nashik", "Navi Mumbai",
  "Nellore", "Noida", "Palakkad", "Panaji", "Panipat", "Patiala", "Patna", "Pimpri-Chinchwad", "Pondicherry", "Pune",
  "Raipur", "Rajahmundry", "Rajkot", "Ranchi", "Ratlam", "Rewa", "Rohtak", "Roorkee", "Rourkela", "Sagar",
  "Saharanpur", "Salem", "Sambalpur", "Sangli", "Satna", "Shillong", "Shimla", "Siliguri", "Solapur", "Sonipat",
  "Srinagar", "Surat", "Thane", "Thanjavur", "Thiruvananthapuram", "Thrissur", "Tiruchirappalli", "Tirunelveli", "Tirupati", "Udaipur",
  "Ujjain", "Vadodara", "Varanasi", "Vasai-Virar", "Vellore", "Vijayawada", "Visakhapatnam", "Warangal",
];

/** Cities that start with what was typed, for a short suggestion list. Case blind; nothing for an empty box. */
export function suggestCities(typed: string, limit = 8): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const starts = INDIAN_CITIES.filter((c) => c.toLowerCase().startsWith(q));
  const contains = INDIAN_CITIES.filter((c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
