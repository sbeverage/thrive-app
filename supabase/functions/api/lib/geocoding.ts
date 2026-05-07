/** OpenStreetMap Nominatim (rate-limited — consider paid geocoder at scale). */
export async function geocodeAddress(
  location: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  try {
    const encodedLocation = encodeURIComponent(location);
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedLocation}&limit=1`;

    const response = await fetch(geocodeUrl, {
      headers: {
        "User-Agent": "Thrive-Initiative/1.0",
      },
    });

    if (!response.ok) {
      console.warn("Geocoding API error:", response.status);
      return { latitude: null, longitude: null };
    }

    const data = await response.json();

    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }

    return { latitude: null, longitude: null };
  } catch (error) {
    console.error("Geocoding error:", error);
    return { latitude: null, longitude: null };
  }
}
