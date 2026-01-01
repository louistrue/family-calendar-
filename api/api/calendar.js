/**
 * Calendar Proxy API
 * Fetches ICS calendar data and returns it to ESP32
 *
 * Environment variables required:
 * - CAL_1_URL: ICS URL for calendar 1
 * - CAL_2_URL: ICS URL for calendar 2
 * - CAL_3_URL: ICS URL for calendar 3
 * - CAL_4_URL: ICS URL for calendar 4
 */

export const config = {
  runtime: 'edge',
};

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchWithCache(url, cacheKey) {
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FamilyCalendar/1.0',
        'Accept': 'text/calendar, text/plain, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.text();

    cache.set(cacheKey, {
      data,
      timestamp: now,
    });

    return data;
  } catch (error) {
    // Return cached data if available, even if stale
    if (cached) {
      console.warn(`Using stale cache for ${cacheKey}: ${error.message}`);
      return cached.data;
    }
    throw error;
  }
}

export default async function handler(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(request.url);
  const calId = url.searchParams.get('id');

  if (!calId || !['1', '2', '3', '4'].includes(calId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid calendar ID. Use ?id=1, ?id=2, ?id=3, or ?id=4' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const calUrlEnvVar = `CAL_${calId}_URL`;
  const calUrl = process.env[calUrlEnvVar];

  if (!calUrl) {
    return new Response(
      JSON.stringify({ error: `Environment variable ${calUrlEnvVar} not configured` }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  try {
    const icsData = await fetchWithCache(calUrl, `cal_${calId}`);

    return new Response(icsData, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error(`Error fetching calendar ${calId}:`, error);

    return new Response(
      JSON.stringify({ error: `Failed to fetch calendar: ${error.message}` }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
