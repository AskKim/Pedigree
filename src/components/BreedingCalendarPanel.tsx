/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive Monthly Breeding Calendar with Offline Moon Phases,
 * Holidays, Seasonal Markers & Opt-In 7-Day Online Weather Strip (`src/components/BreedingCalendarPanel.tsx`).
 */

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BreedingCalendarDayCell,
  BreedingCalendarEvent,
  buildBreedingCalendarMonth,
  formatTemperatureForUnit,
  shiftMonthKey,
  WeatherForecastBundle,
} from '../core/breedingCalendar';
import {
  Animal,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  DEFAULT_WEATHER_FORECAST_SETTINGS,
  formatReadableDate,
  normalizeWeatherForecastSettings,
  ShowEvent,
  SpeciesProfile,
  TemperatureUnit,
  todayDateIso,
  WeatherForecastSettings,
} from '../core/models';
import { useConnectivityStatus } from '../storage/storageProtection';
import {
  fetchWeeklyWeatherForecast,
  isWeatherCacheFresh,
  readCachedWeatherForecast,
  searchWeatherLocations,
  WeatherLocationSearchResult,
} from '../storage/weatherForecast';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

export interface BreedingCalendarPanelProps {
  speciesProfile: SpeciesProfile;
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  shows: ShowEvent[];
  animals: Animal[];
  settings?: BarnSettings;
  onUpdateSettings?: (
    patch: Partial<BarnSettings>,
    options?: { silent?: boolean }
  ) => Promise<void> | void;
}

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function getEventToneClasses(tone: BreedingCalendarEvent['tone'], completed?: boolean): string {
  if (completed) {
    return 'bg-[var(--barn-subtle)] text-[var(--barn-muted)] border-[var(--barn-border)] line-through opacity-75';
  }
  switch (tone) {
    case 'terracotta':
      return 'bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border-[var(--barn-terracotta)]/50';
    case 'sage':
      return 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border-[var(--barn-sage)]/50';
    case 'amber':
      return 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/40';
    case 'sky':
      return 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border-sky-500/40';
    default:
      return 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] border-[var(--barn-border)]';
  }
}

export function BreedingCalendarPanel({
  speciesProfile,
  breedings,
  tasks,
  shows,
  animals,
  settings,
  onUpdateSettings,
}: BreedingCalendarPanelProps) {
  const todayIso = todayDateIso();
  const baseId = useId();
  const connectivity = useConnectivityStatus();
  const isOnline = connectivity.isEffectivelyOnline;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const weatherConfig = useMemo(
    () => normalizeWeatherForecastSettings(settings?.weatherForecast),
    [settings?.weatherForecast]
  );

  const [monthKey, setMonthKey] = useState<string>(() => todayIso.slice(0, 7));
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => todayIso);
  const [showMoonPhases, setShowMoonPhases] = useState<boolean>(true);
  const [showHolidays, setShowHolidays] = useState<boolean>(true);
  const [weatherDrawerOpen, setWeatherDrawerOpen] = useState<boolean>(
    () => weatherConfig.enabled
  );

  const [weatherBundle, setWeatherBundle] = useState<WeatherForecastBundle | null>(() =>
    weatherConfig.latitude !== null && weatherConfig.longitude !== null
      ? readCachedWeatherForecast(weatherConfig.latitude, weatherConfig.longitude)
      : null
  );
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState<string>('');
  const [locationResults, setLocationResults] = useState<WeatherLocationSearchResult[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState<string>(() =>
    weatherConfig.latitude !== null ? String(weatherConfig.latitude) : ''
  );
  const [manualLon, setManualLon] = useState<string>(() =>
    weatherConfig.longitude !== null ? String(weatherConfig.longitude) : ''
  );
  const [manualLabel, setManualLabel] = useState<string>(() => weatherConfig.locationLabel);

  const locationSearchLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const forecastFetchLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  useEffect(() => {
    setManualLat(weatherConfig.latitude !== null ? String(weatherConfig.latitude) : '');
    setManualLon(weatherConfig.longitude !== null ? String(weatherConfig.longitude) : '');
    setManualLabel(weatherConfig.locationLabel);
  }, [weatherConfig.latitude, weatherConfig.longitude, weatherConfig.locationLabel]);

  // Synchronize cached or fresh forecast when weather is explicitly enabled
  useEffect(() => {
    const lat = weatherConfig.latitude;
    const lon = weatherConfig.longitude;
    if (!weatherConfig.enabled || lat === null || lon === null) {
      return;
    }
    const cached = readCachedWeatherForecast(lat, lon);
    if (cached) {
      setWeatherBundle(cached);
    }
    if (!isOnline || (cached && isWeatherCacheFresh(cached))) {
      return;
    }
    let cancelled = false;
    void fetchWeeklyWeatherForecast({
      latitude: lat,
      longitude: lon,
      locationLabel: weatherConfig.locationLabel,
    }).then((res) => {
      if (cancelled || !mountedRef.current) return;
      if (res.bundle) setWeatherBundle(res.bundle);
      if (res.source !== 'live' || res.message) {
        setWeatherMessage(res.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    weatherConfig.enabled,
    weatherConfig.latitude,
    weatherConfig.longitude,
    weatherConfig.locationLabel,
    isOnline,
  ]);

  const calendarModel = useMemo(
    () =>
      buildBreedingCalendarMonth({
        monthKey,
        speciesProfile,
        breedings,
        tasks,
        shows,
        animals,
        weatherDays: weatherConfig.enabled ? weatherBundle?.days ?? [] : [],
        showMoonPhases,
        showHolidays,
        todayIso,
      }),
    [
      monthKey,
      speciesProfile,
      breedings,
      tasks,
      shows,
      animals,
      weatherConfig.enabled,
      weatherBundle?.days,
      showMoonPhases,
      showHolidays,
      todayIso,
    ]
  );

  const selectedCell: BreedingCalendarDayCell | null = useMemo(() => {
    for (const week of calendarModel.weeks) {
      for (const cell of week) {
        if (cell.dateIso === selectedDateIso) return cell;
      }
    }
    for (const week of calendarModel.weeks) {
      const current = week.find((c) => c.inCurrentMonth);
      if (current) return current;
    }
    return calendarModel.weeks[0]?.[0] ?? null;
  }, [calendarModel.weeks, selectedDateIso]);

  const persistWeatherConfig = async (
    nextPatch: Partial<WeatherForecastSettings>,
    silent = true
  ) => {
    const merged: WeatherForecastSettings = {
      ...DEFAULT_WEATHER_FORECAST_SETTINGS,
      ...weatherConfig,
      ...nextPatch,
    };
    await onUpdateSettings?.({ weatherForecast: merged }, { silent });
  };

  const handleToggleWeatherEnabled = async () => {
    const nextEnabled = !weatherConfig.enabled;
    setWeatherDrawerOpen(nextEnabled || weatherDrawerOpen);
    setWeatherMessage(null);
    await persistWeatherConfig({ enabled: nextEnabled }, false);
  };

  const handleTemperatureUnitChange = async (temperatureUnit: TemperatureUnit) => {
    await persistWeatherConfig({ temperatureUnit }, true);
  };

  const handleLocationSearch = async (e: FormEvent) => {
    e.preventDefault();
    setLocationError(null);
    const res = await locationSearchLock.runLocked(() => searchWeatherLocations(locationQuery));
    if (res.skipped || !res.value || !mountedRef.current) return;
    if (res.value.error) {
      setLocationError(res.value.error);
    }
    setLocationResults(res.value.results);
  };

  const handleSelectLocation = async (item: WeatherLocationSearchResult) => {
    setLocationResults([]);
    setLocationError(null);
    setWeatherMessage(null);
    await persistWeatherConfig(
      {
        enabled: true,
        locationLabel: item.label,
        latitude: item.latitude,
        longitude: item.longitude,
      },
      false
    );
    const fetchRes = await forecastFetchLock.runLocked(() =>
      fetchWeeklyWeatherForecast({
        latitude: item.latitude,
        longitude: item.longitude,
        locationLabel: item.label,
        forceRefresh: true,
      })
    );
    if (!fetchRes.skipped && fetchRes.value && mountedRef.current) {
      if (fetchRes.value.bundle) setWeatherBundle(fetchRes.value.bundle);
      setWeatherMessage(fetchRes.value.message);
    }
  };

  const handleSaveManualCoordinates = async (e: FormEvent) => {
    e.preventDefault();
    const lat = Number.parseFloat(manualLat);
    const lon = Number.parseFloat(manualLon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setLocationError('Enter a valid latitude between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setLocationError('Enter a valid longitude between -180 and 180.');
      return;
    }
    setLocationError(null);
    const label = manualLabel.trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    await persistWeatherConfig(
      {
        enabled: true,
        locationLabel: label,
        latitude: Number(lat.toFixed(4)),
        longitude: Number(lon.toFixed(4)),
      },
      false
    );
    if (isOnline) {
      const fetchRes = await forecastFetchLock.runLocked(() =>
        fetchWeeklyWeatherForecast({
          latitude: lat,
          longitude: lon,
          locationLabel: label,
          forceRefresh: true,
        })
      );
      if (!fetchRes.skipped && fetchRes.value && mountedRef.current) {
        if (fetchRes.value.bundle) setWeatherBundle(fetchRes.value.bundle);
        setWeatherMessage(fetchRes.value.message);
      }
    }
  };

  const handleRefreshForecast = async () => {
    if (weatherConfig.latitude === null || weatherConfig.longitude === null) {
      setWeatherMessage('Set a forecast location first.');
      return;
    }
    const res = await forecastFetchLock.runLocked(() =>
      fetchWeeklyWeatherForecast({
        latitude: weatherConfig.latitude!,
        longitude: weatherConfig.longitude!,
        locationLabel: weatherConfig.locationLabel,
        forceRefresh: true,
      })
    );
    if (!res.skipped && res.value && mountedRef.current) {
      if (res.value.bundle) setWeatherBundle(res.value.bundle);
      setWeatherMessage(res.value.message);
    }
  };

  return (
    <section
      aria-label={`${speciesProfile.name} Breeding Calendar`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-6 space-y-5"
    >
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
            <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--barn-ink)]">
              {speciesProfile.name} Breeding &amp; Moon Calendar
            </h2>
          </div>
          <p className="text-xs text-[var(--barn-muted)]">
            Track bred dates, due dates, {speciesProfile.birthEventLabel.toLowerCase()}s, weaning
            targets, barn chores, shows, offline moon phases &amp; seasonal holidays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month Navigation */}
          <div
            role="group"
            aria-label="Calendar month navigation"
            className="inline-flex items-center rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5"
          >
            <button
              type="button"
              onClick={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}
              aria-label="Previous month"
              className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="px-3 text-xs font-semibold font-display min-w-[122px] text-center">
              {calendarModel.monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}
              aria-label="Next month"
              className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setMonthKey(todayIso.slice(0, 7));
              setSelectedDateIso(todayIso);
            }}
            className="min-h-[36px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
          >
            Today
          </button>

          <button
            type="button"
            aria-pressed={showMoonPhases}
            onClick={() => setShowMoonPhases((v) => !v)}
            className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              showMoonPhases
                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)]'
            }`}
          >
            <Moon className="w-3.5 h-3.5" aria-hidden="true" />
            Moon Phases
          </button>

          <button
            type="button"
            aria-pressed={showHolidays}
            onClick={() => setShowHolidays((v) => !v)}
            className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              showHolidays
                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Holidays
          </button>

          <button
            type="button"
            aria-expanded={weatherDrawerOpen}
            onClick={() => setWeatherDrawerOpen((v) => !v)}
            className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              weatherConfig.enabled
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <CloudSun className="w-3.5 h-3.5" aria-hidden="true" />
            Weather {weatherConfig.enabled ? 'On' : 'Opt-In'}
          </button>
        </div>
      </div>

      {/* Month KPI Strip */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
        <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          Month Events: <strong>{calendarModel.eventCount}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/40 text-[var(--barn-terracotta)]">
          Due: <strong>{calendarModel.dueCount}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[var(--barn-sage)]">
          {speciesProfile.birthEventLabel}s: <strong>{calendarModel.birthCount}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          Chores: <strong>{calendarModel.taskCount}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          Shows: <strong>{calendarModel.showCount}</strong>
        </span>
      </div>

      {/* Optional Online 7-Day Weather Forecast Drawer */}
      {weatherDrawerOpen && (
        <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--barn-ink)]">
                <CloudSun className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Optional Online 7-Day Weather Strip (Open-Meteo)</span>
                {!isOnline && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[10px] text-[var(--barn-sage)]">
                    <WifiOff className="w-3 h-3" aria-hidden="true" />
                    Offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Strictly opt-in. Moon phases and holidays always work offline; enabling weather
                fetches your 7-day forecast from Open-Meteo only when online and caches locally.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Weather temperature unit"
                className="inline-flex rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] p-0.5"
              >
                {(['F', 'C'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    aria-pressed={weatherConfig.temperatureUnit === unit}
                    onClick={() => void handleTemperatureUnitChange(unit)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                      weatherConfig.temperatureUnit === unit
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                        : 'text-[var(--barn-muted)]'
                    }`}
                  >
                    °{unit}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleToggleWeatherEnabled()}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold ${
                  weatherConfig.enabled
                    ? 'border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                    : 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                }`}
              >
                {weatherConfig.enabled ? 'Disable Weather' : 'Enable Weather'}
              </button>

              {weatherConfig.enabled && weatherConfig.latitude !== null && (
                <button
                  type="button"
                  disabled={!isOnline || forecastFetchLock.isSubmitting}
                  onClick={() => void handleRefreshForecast()}
                  className="min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      forecastFetchLock.isSubmitting ? 'animate-spin' : ''
                    }`}
                    aria-hidden="true"
                  />
                  Refresh
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Search City / Town */}
            <form onSubmit={(e) => void handleLocationSearch(e)} className="space-y-2">
              <label
                htmlFor={`${baseId}-weather-search`}
                className="block text-[11px] font-medium text-[var(--barn-muted)]"
              >
                Look Up Barn City / Town (Online)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id={`${baseId}-weather-search`}
                    type="text"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    placeholder="e.g. Madison, WI or Columbus, OH"
                    className="w-full min-h-[36px] pl-8 pr-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!isOnline || locationSearchLock.isSubmitting}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-50"
                >
                  {locationSearchLock.isSubmitting ? 'Searching...' : 'Search'}
                </button>
              </div>
              {locationResults.length > 0 && (
                <div className="divide-y divide-[var(--barn-border)] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] max-h-40 overflow-y-auto">
                  {locationResults.map((item, idx) => (
                    <button
                      key={`${item.latitude}-${item.longitude}-${idx}`}
                      type="button"
                      onClick={() => void handleSelectLocation(item)}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2"
                    >
                      <span className="font-medium truncate">{item.label}</span>
                      <span className="font-mono text-[10px] text-[var(--barn-muted)] shrink-0">
                        {item.latitude.toFixed(2)}, {item.longitude.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            {/* Manual Coordinates Fallback */}
            <form onSubmit={(e) => void handleSaveManualCoordinates(e)} className="space-y-2">
              <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                Or Set Coordinates Directly (Works Anytime)
              </div>
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  type="text"
                  aria-label="Location label"
                  placeholder="Label"
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value)}
                  className="col-span-5 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="number"
                  step="0.0001"
                  aria-label="Latitude"
                  placeholder="Lat"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="col-span-3 min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
                />
                <input
                  type="number"
                  step="0.0001"
                  aria-label="Longitude"
                  placeholder="Lon"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  className="col-span-2 min-h-[36px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
                />
                <button
                  type="submit"
                  className="col-span-2 min-h-[36px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>

          {locationError && (
            <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium">
              {locationError}
            </p>
          )}
          {weatherMessage && (
            <p className="text-[11px] text-[var(--barn-muted)]">{weatherMessage}</p>
          )}

          {/* 7-Day Weather Strip */}
          {weatherConfig.enabled && weatherBundle && weatherBundle.days.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-[var(--barn-border)]/70">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)]">
                <span className="inline-flex items-center gap-1 font-medium text-[var(--barn-ink)]">
                  <MapPin className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  {weatherBundle.locationLabel}
                </span>
                {weatherBundle.fetchedAtIso && (
                  <span className="font-mono text-[10px]">
                    Updated {weatherBundle.fetchedAtIso.slice(0, 16).replace('T', ' ')} UTC
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {weatherBundle.days.map((day) => {
                  const selected = day.dateIso === selectedDateIso;
                  return (
                    <button
                      key={day.dateIso}
                      type="button"
                      onClick={() => {
                        setMonthKey(day.dateIso.slice(0, 7));
                        setSelectedDateIso(day.dateIso);
                      }}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]'
                          : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
                        <span>{day.dateIso.slice(5)}</span>
                        <span aria-hidden="true">{day.iconEmoji}</span>
                      </div>
                      <div className="text-xs font-bold font-mono tabular-nums mt-0.5">
                        {formatTemperatureForUnit(day.tempMaxC, weatherConfig.temperatureUnit)} /{' '}
                        <span className="font-normal text-[var(--barn-muted)]">
                          {formatTemperatureForUnit(day.tempMinC, weatherConfig.temperatureUnit)}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--barn-muted)] truncate">
                        {day.label}
                        {day.precipitationProbabilityMax !== null
                          ? ` · ${day.precipitationProbabilityMax}%`
                          : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calendar Month Grid + Selected Day Details */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 overflow-x-auto">
          <div className="min-w-[560px] border border-[var(--barn-border)] rounded-xl overflow-hidden bg-[var(--barn-canvas)]">
            <div className="grid grid-cols-7 border-b border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
              {WEEKDAY_HEADERS.map((d) => (
                <div key={d} className="px-2 py-2 text-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="divide-y divide-[var(--barn-border)]">
              {calendarModel.weeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-cols-7 divide-x divide-[var(--barn-border)]">
                  {week.map((cell) => {
                    const isSelected = cell.dateIso === selectedDateIso;
                    return (
                      <button
                        key={cell.dateIso}
                        type="button"
                        onClick={() => setSelectedDateIso(cell.dateIso)}
                        className={`min-h-[92px] p-1.5 text-left flex flex-col justify-between gap-1 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--barn-sage)] ${
                          isSelected
                            ? 'bg-[var(--barn-sage-tint)]/75 ring-1 ring-inset ring-[var(--barn-sage)]'
                            : cell.inCurrentMonth
                            ? 'bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]/50'
                            : 'bg-[var(--barn-canvas)]/70 opacity-60 hover:opacity-85'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono tabular-nums ${
                              cell.isToday
                                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-bold'
                                : 'font-semibold text-[var(--barn-ink)]'
                            }`}
                          >
                            {cell.dayOfMonth}
                          </span>
                          <div className="flex items-center gap-1 text-[11px]">
                            {cell.weather && (
                              <span
                                title={`${cell.weather.label}: ${formatTemperatureForUnit(
                                  cell.weather.tempMaxC,
                                  weatherConfig.temperatureUnit
                                )}`}
                                className="font-mono text-[10px] text-[var(--barn-muted)]"
                              >
                                {cell.weather.iconEmoji}
                              </span>
                            )}
                            {showMoonPhases && (
                              <span
                                title={`${cell.moonPhase.label} (${cell.moonPhase.illuminationPercent}%)`}
                                className={
                                  cell.moonPhase.isPrimaryQuarterDay
                                    ? 'px-1 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)]'
                                    : ''
                                }
                              >
                                {cell.moonPhase.emoji}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-0.5 min-w-0">
                          {cell.holidays.slice(0, 1).map((h) => (
                            <div
                              key={h.id}
                              title={h.name}
                              className="px-1 py-0.5 rounded text-[9px] font-medium truncate bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-muted)]"
                            >
                              {h.shortLabel}
                            </div>
                          ))}
                          {cell.events.slice(0, 2).map((ev) => (
                            <div
                              key={ev.id}
                              title={`${ev.title} — ${ev.subtitle}`}
                              className={`px-1 py-0.5 rounded border text-[9px] font-medium truncate ${getEventToneClasses(
                                ev.tone,
                                ev.completed
                              )}`}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {cell.events.length > 2 && (
                            <div className="text-[9px] font-mono text-[var(--barn-muted)] pl-0.5">
                              +{cell.events.length - 2} more
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Day Details Inspector */}
        <aside
          aria-label="Selected day details"
          className="xl:col-span-4 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3"
        >
          {selectedCell ? (
            <>
              <div className="flex items-start justify-between gap-2 border-b border-[var(--barn-border)] pb-2.5">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--barn-muted)] font-semibold">
                    Selected Date
                  </div>
                  <h3 className="font-display text-base font-semibold text-[var(--barn-ink)]">
                    {formatReadableDate(selectedCell.dateIso)}
                  </h3>
                </div>
                {selectedCell.isToday && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[10px] font-semibold">
                    Today
                  </span>
                )}
              </div>

              {showMoonPhases && (
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg leading-none" aria-hidden="true">
                      {selectedCell.moonPhase.emoji}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {selectedCell.moonPhase.label}
                        {selectedCell.moonPhase.isPrimaryQuarterDay && ' ★'}
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                        {selectedCell.moonPhase.illuminationPercent}% lit · Day{' '}
                        {selectedCell.moonPhase.ageDays}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedCell.weather && (
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none" aria-hidden="true">
                      {selectedCell.weather.iconEmoji}
                    </span>
                    <div>
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {selectedCell.weather.label}
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                        High {formatTemperatureForUnit(selectedCell.weather.tempMaxC, weatherConfig.temperatureUnit)} · Low{' '}
                        {formatTemperatureForUnit(selectedCell.weather.tempMinC, weatherConfig.temperatureUnit)}
                        {selectedCell.weather.precipitationProbabilityMax !== null
                          ? ` · ${selectedCell.weather.precipitationProbabilityMax}% precip`
                          : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedCell.holidays.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--barn-muted)] uppercase">
                    Calendar Markers
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCell.holidays.map((h) => (
                      <span
                        key={h.id}
                        className="px-2 py-1 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-ink)]"
                      >
                        {h.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[var(--barn-muted)] uppercase">
                  Barn Schedule ({selectedCell.events.length})
                </div>
                {selectedCell.events.length === 0 ? (
                  <p className="text-xs text-[var(--barn-muted)] italic">
                    No {speciesProfile.name.toLowerCase()} breeding events, tasks, or shows scheduled
                    on this date.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {selectedCell.events.map((ev) => (
                      <div
                        key={ev.id}
                        className={`p-2.5 rounded-lg border text-xs space-y-0.5 ${getEventToneClasses(
                          ev.tone,
                          ev.completed
                        )}`}
                      >
                        <div className="font-semibold">{ev.title}</div>
                        <div className="text-[11px] opacity-85">{ev.subtitle}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--barn-muted)]">Select a calendar day to inspect.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
