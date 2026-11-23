/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Strictly Opt-In & Offline-Safe Weekly Weather Forecast Client (`src/storage/weatherForecast.ts`).
 *
 * - Honors Manual App Offline Mode & `navigator.onLine` via `getConnectivitySnapshot()`.
 * - Uses keyless Open-Meteo public endpoints with a bounded 6s `AbortController` timeout.
 * - Caches the latest 7-day forecast in `localStorage` so previously fetched forecasts stay
 *   available offline without any background polling.
 */

import {
  describeWmoWeatherCode,
  isValidYmdIso,
  normalizeWeatherForecastBundle,
  WeatherForecastBundle,
  WeatherForecastDay,
} from '../core/breedingCalendar';
import { sanitizeSingleLineText } from '../core/inputSanitization';
import { nowIsoUtc } from '../core/models';
import { getConnectivitySnapshot } from './storageProtection';

const WEATHER_CACHE_LS_KEY = 'pedigree.weatherForecast.cache.v1';
const WEATHER_REQUEST_TIMEOUT_MS = 6000;
const WEATHER_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface WeatherLocationSearchResult {
  label: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

export interface WeatherForecastFetchResult {
  bundle: WeatherForecastBundle | null;
  source: 'live' | 'cache' | 'offline' | 'error';
  message: string;
}

function getSafeLs(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function coordsMatch(aLat: number, aLon: number, bLat: number, bLon: number): boolean {
  return Math.abs(aLat - bLat) < 0.05 && Math.abs(aLon - bLon) < 0.05;
}

export function readCachedWeatherForecast(
  latitude: number,
  longitude: number
): WeatherForecastBundle | null {
  const ls = getSafeLs();
  if (!ls) return null;
  try {
    const raw = ls.getItem(WEATHER_CACHE_LS_KEY);
    if (!raw) return null;
    const parsed = normalizeWeatherForecastBundle(JSON.parse(raw));
    if (!parsed) return null;
    if (!coordsMatch(parsed.latitude, parsed.longitude, latitude, longitude)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedWeatherForecast(bundle: WeatherForecastBundle): void {
  const ls = getSafeLs();
  if (!ls) return;
  try {
    ls.setItem(WEATHER_CACHE_LS_KEY, JSON.stringify(bundle));
  } catch {
    // Non-fatal in private browsing or tight quota
  }
}

export function clearWeatherForecastCache(): void {
  const ls = getSafeLs();
  if (!ls) return;
  try {
    ls.removeItem(WEATHER_CACHE_LS_KEY);
  } catch {
    // Non-fatal
  }
}

export function isWeatherCacheFresh(bundle: WeatherForecastBundle, nowMs = Date.now()): boolean {
  if (!bundle.fetchedAtIso) return false;
  const fetchedMs = Date.parse(bundle.fetchedAtIso);
  if (!Number.isFinite(fetchedMs)) return false;
  return nowMs - fetchedMs >= 0 && nowMs - fetchedMs <= WEATHER_CACHE_TTL_MS;
}

export async function searchWeatherLocations(
  query: string
): Promise<{ results: WeatherLocationSearchResult[]; offline: boolean; error?: string }> {
  const clean = sanitizeSingleLineText(query, 80);
  if (clean.length < 2) {
    return { results: [], offline: false, error: 'Enter at least 2 characters to search.' };
  }

  const conn = getConnectivitySnapshot();
  if (!conn.isEffectivelyOnline) {
    return {
      results: [],
      offline: true,
      error: conn.manualOffline
        ? 'Manual App Offline Mode is enabled. Disable it in The Techy Stuff to search locations, or enter coordinates manually.'
        : 'Device is offline. You can still enter latitude/longitude manually or use your cached location.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      clean
    )}&count=6&language=en&format=json`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { results: [], offline: false, error: `Location lookup failed (HTTP ${res.status}).` };
    }
    const json = (await res.json()) as {
      results?: Array<{
        name?: string;
        latitude?: number;
        longitude?: number;
        admin1?: string;
        country?: string;
      }>;
    };
    const items = Array.isArray(json.results) ? json.results : [];
    const results: WeatherLocationSearchResult[] = [];
    for (const item of items) {
      const lat = Number(item.latitude);
      const lon = Number(item.longitude);
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const parts = [name, item.admin1, item.country]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.trim());
      results.push({
        label: parts.join(', ').slice(0, 120),
        latitude: Number(lat.toFixed(4)),
        longitude: Number(lon.toFixed(4)),
        admin1: item.admin1,
        country: item.country,
      });
    }
    return { results, offline: false };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      results: [],
      offline: false,
      error: isAbort
        ? 'Location lookup timed out after 6 seconds.'
        : err instanceof Error
        ? err.message
        : 'Could not look up weather location.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWeeklyWeatherForecast(params: {
  latitude: number;
  longitude: number;
  locationLabel: string;
  forceRefresh?: boolean;
}): Promise<WeatherForecastFetchResult> {
  const lat = Number(params.latitude);
  const lon = Number(params.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      bundle: null,
      source: 'error',
      message: 'Valid latitude and longitude coordinates are required.',
    };
  }

  const cached = readCachedWeatherForecast(lat, lon);
  if (!params.forceRefresh && cached && isWeatherCacheFresh(cached)) {
    return {
      bundle: cached,
      source: 'cache',
      message: 'Showing cached 7-day forecast.',
    };
  }

  const conn = getConnectivitySnapshot();
  if (!conn.isEffectivelyOnline) {
    return {
      bundle: cached,
      source: 'offline',
      message: conn.manualOffline
        ? 'Manual App Offline Mode active — weather fetch paused.'
        : 'Offline — showing last cached forecast if available.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_REQUEST_TIMEOUT_MS);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat.toFixed(4))}` +
      `&longitude=${encodeURIComponent(lon.toFixed(4))}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=7`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return {
        bundle: cached,
        source: 'error',
        message: `Weather service returned HTTP ${res.status}.`,
      };
    }
    const json = (await res.json()) as {
      daily?: {
        time?: unknown[];
        weather_code?: unknown[];
        temperature_2m_max?: unknown[];
        temperature_2m_min?: unknown[];
        precipitation_probability_max?: unknown[];
      };
    };

    const daily = json.daily;
    const times = Array.isArray(daily?.time) ? daily!.time : [];
    const codes = Array.isArray(daily?.weather_code) ? daily!.weather_code : [];
    const maxTemps = Array.isArray(daily?.temperature_2m_max) ? daily!.temperature_2m_max : [];
    const minTemps = Array.isArray(daily?.temperature_2m_min) ? daily!.temperature_2m_min : [];
    const precips = Array.isArray(daily?.precipitation_probability_max)
      ? daily!.precipitation_probability_max
      : [];

    const days: WeatherForecastDay[] = [];
    for (let i = 0; i < times.length; i += 1) {
      const dateIso = typeof times[i] === 'string' && isValidYmdIso(times[i] as string) ? (times[i] as string) : '';
      const tempMaxC = Number(maxTemps[i]);
      const tempMinC = Number(minTemps[i]);
      if (!dateIso || !Number.isFinite(tempMaxC) || !Number.isFinite(tempMinC)) continue;
      const code = Number.isFinite(Number(codes[i])) ? Math.round(Number(codes[i])) : 0;
      const precipRaw = precips[i];
      const precip =
        precipRaw === null || precipRaw === undefined || !Number.isFinite(Number(precipRaw))
          ? null
          : Math.max(0, Math.min(100, Math.round(Number(precipRaw))));
      const described = describeWmoWeatherCode(code);
      days.push({
        dateIso,
        tempMaxC: Number(tempMaxC.toFixed(1)),
        tempMinC: Number(tempMinC.toFixed(1)),
        precipitationProbabilityMax: precip,
        weatherCode: code,
        label: described.label,
        iconEmoji: described.iconEmoji,
      });
    }

    if (days.length === 0) {
      return {
        bundle: cached,
        source: 'error',
        message: 'Weather response did not contain daily forecast values.',
      };
    }

    const bundle: WeatherForecastBundle = {
      fetchedAtIso: nowIsoUtc(),
      locationLabel: sanitizeSingleLineText(params.locationLabel, 120) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      latitude: Number(lat.toFixed(4)),
      longitude: Number(lon.toFixed(4)),
      days: days.slice(0, 7),
    };
    writeCachedWeatherForecast(bundle);
    return {
      bundle,
      source: 'live',
      message: '7-day forecast updated.',
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      bundle: cached,
      source: 'error',
      message: isAbort
        ? 'Weather forecast request timed out after 6 seconds.'
        : err instanceof Error
        ? err.message
        : 'Could not reach Open-Meteo weather service.',
    };
  } finally {
    clearTimeout(timer);
  }
}
