const axios = require("axios");

/**
 * Converts latitude/longitude into a human readable address using the
 * free OpenStreetMap Nominatim API (no API key required).
 *
 * NOTE: Nominatim has usage limits (~1 request/sec) and requires a valid
 * User-Agent header. This is fine for a small internal attendance app.
 * If you later need higher volume/reliability, swap this out for
 * Google Maps Geocoding API or similar (just change this one file).
 *
 * If the lookup fails for any reason, it fails silently and returns
 * an empty string so punch in/out never gets blocked by a geocoding error.
 */
const reverseGeocode = async (latitude, longitude) => {
  try {
    if (latitude === undefined || longitude === undefined) return "";

    const response = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: {
          lat: latitude,
          lon: longitude,
          format: "json",
        },
        headers: {
          "User-Agent": "AttendEase-Attendance-App/1.0",
        },
        timeout: 5000,
      }
    );

    return response.data?.display_name || "";
  } catch (error) {
    console.error("Reverse geocode failed:", error.message);
    return "";
  }
};

module.exports = reverseGeocode;
