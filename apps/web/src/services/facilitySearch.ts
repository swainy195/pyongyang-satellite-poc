export type SearchResult = {
  id: number;
  name: string;
  category: string;
  longitude: number;
  latitude: number;
};

let facilityIndexPromise: Promise<SearchResult[]> | null = null;
let facilityIndexLoaded = false;

export function isFacilityIndexLoaded() {
  return facilityIndexLoaded;
}

async function loadFacilityIndex() {
  if (!facilityIndexPromise) {
    facilityIndexPromise = fetch("/data/facilities-search.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Facility search index failed with HTTP ${response.status}`);
        const data = await response.json() as SearchResult[];
        facilityIndexLoaded = true;
        return data;
      })
      .catch((error) => {
        facilityIndexPromise = null;
        throw error;
      });
  }
  return facilityIndexPromise;
}

export async function searchFacilityIndex(query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];
  const facilities = await loadFacilityIndex();
  return facilities
    .filter((facility) => facility.name.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, 20);
}
