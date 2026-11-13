import React, { useEffect, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Database, FileSearch,
  FileText, LayoutDashboard, MapPin, MessageSquare, Search, Sparkles, TrendingUp,
} from 'lucide-react';

ChartJS.register(
  ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale,
  LineElement, PointElement, Tooltip,
);

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '')
  || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');
const PAGE_SIZE = 20;
const aspectBarOptions = {
  indexAxis: 'y',
  maintainAspectRatio: false,
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: 'rgba(148,163,184,0.12)' },
      ticks: { color: '#94a3b8', precision: 0 },
    },
    y: {
      grid: { display: false },
      ticks: { color: '#cbd5e1', autoSkip: false, font: { size: 11 } },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: context => `${context.dataset.label}: ${context.raw.toLocaleString()} reviews` } },
  },
};

async function apiGet(path, signal) {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not configured for this deployment.');
  }
  const response = await fetch(`${API_BASE}${path}`, { signal });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`API returned a non-JSON response (${response.status}).`);
  }
  if (!response.ok) throw new Error(result.detail || `Request failed (${response.status})`);
  return result;
}

function getOwnerAction(aspectName) {
  const aspect = aspectName.toLowerCase();
  if (/wait|minute|queue|time/.test(aspect)) {
    return 'Review wait-time patterns by daypart, then check staffing, queue communication, and order handoffs during busy periods.';
  }
  if (/staff|service|server|waiter|host|manager|employee/.test(aspect)) {
    return 'Review the cited interactions, identify recurring service breakdowns, and reinforce coaching and escalation practices.';
  }
  if (/food|dish|meal|menu|pizza|burger|sushi|salmon|chicken|drink|coffee|dessert|taste|flavor/.test(aspect)) {
    return 'Check preparation consistency, freshness, and the menu items mentioned; compare feedback with kitchen and supplier procedures.';
  }
  if (/price|cost|value|money|bill|fee/.test(aspect)) {
    return 'Review the value proposition and billing clarity for the cited items; compare price expectations with portion size.';
  }
  if (/clean|dirty|table|bathroom|floor|hygiene|smell/.test(aspect)) {
    return 'Audit the area named in the feedback and verify cleaning frequency, opening checks, and manager sign-off.';
  }
  if (/parking|location|seat|seating|decor|atmosphere|music|noise|lighting|ambiance|vibe/.test(aspect)) {
    return 'Inspect the space or amenity mentioned and prioritize a practical fix for access, comfort, or the guest environment.';
  }
  return 'Read the cited reviews in context, verify whether the issue repeats, and assign an owner to investigate.';
}

function AspectExtractionTab({ businessId, info, analysis, pipelinePhase }) {
  const [query, setQuery] = useState('');
  const [sentiment, setSentiment] = useState('negative');
  const [reviewerType, setReviewerType] = useState('all');
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const [reviewState, setReviewState] = useState({
    key: '', result: { reviews: [], total: 0, reviewer_segmentation_available: false }, error: null,
  });

  const filterKey = `${businessId}|${sentiment}|${reviewerType}|${query.trim()}`;
  const page = pagination.key === filterKey ? pagination.page : 1;
  const requestKey = `${filterKey}|${page}`;
  const reviewResult = reviewState.key === requestKey
    ? reviewState.result
    : { reviews: [], total: 0, reviewer_segmentation_available: false };
  const reviewError = reviewState.key === requestKey ? reviewState.error : null;
  const reviewLoading = reviewState.key !== requestKey;

  useEffect(() => {
    if (!businessId) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      business_id: businessId,
      sentiment,
      reviewer_type: reviewerType,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (query.trim()) params.set('q', query.trim());

    apiGet(`/api/reviews?${params}`, controller.signal)
      .then(result => setReviewState({ key: requestKey, result, error: null }))
      .catch(error => {
        if (error.name !== 'AbortError') {
          setReviewState({
            key: requestKey,
            result: { reviews: [], total: 0, reviewer_segmentation_available: false },
            error: error.message,
          });
        }
      });
    return () => controller.abort();
  }, [businessId, page, pipelinePhase, query, requestKey, reviewerType, sentiment]);

  const negativeAspects = analysis?.negative_aspects || [];
  const positiveAspects = analysis?.positive_aspects || [];
  const totalAspectMentions = (analysis?.aspects || []).reduce((total, aspect) => total + aspect.mentions, 0);

  const positiveAspectChart = {
    labels: positiveAspects.slice(0, 8).map(aspect => aspect.aspect),
    datasets: [{
      label: 'Positive reviews',
      data: positiveAspects.slice(0, 8).map(aspect => aspect.positive_mentions),
      backgroundColor: 'rgba(52, 211, 153, 0.82)',
      borderRadius: 5,
      borderSkipped: false,
    }],
  };
  const negativeAspectChart = {
    labels: negativeAspects.slice(0, 8).map(aspect => aspect.aspect),
    datasets: [{
      label: 'Negative reviews',
      data: negativeAspects.slice(0, 8).map(aspect => aspect.negative_mentions),
      backgroundColor: 'rgba(251, 113, 133, 0.82)',
      borderRadius: 5,
      borderSkipped: false,
    }],
  };
  const maxPages = Math.max(1, Math.ceil(reviewResult.total / PAGE_SIZE));

  if (!businessId) {
    return <EmptyState title="Select a restaurant" detail="Choose a restaurant to load its review patterns and source evidence." />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Guest feedback</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Restaurant insights</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {info?.name || 'Selected restaurant'} · {info?.city}{info?.state ? `, ${info.state}` : ''}. Explore what guests praise, what frustrates them, and the review evidence behind each signal.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Selected restaurant review summary">
        {[
          { label: 'Restaurant reviews', value: info?.total_reviews || 0, tone: 'text-white' },
          { label: 'Aspect mentions', value: totalAspectMentions, tone: 'text-cyan-300' },
          { label: 'Positive aspects found', value: positiveAspects.length, tone: 'text-emerald-300' },
          { label: 'Negative aspects found', value: negativeAspects.length, tone: 'text-red-300' },
        ].map(card => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
            <p className={`mt-2 text-3xl font-black ${card.tone}`}>{Number(card.value).toLocaleString()}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="chart-card rounded-2xl border border-emerald-500/15 bg-white/[0.04] p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="font-bold text-emerald-200">What guests praise</h3>
            <p className="mt-1 text-xs text-slate-400">Reviews mentioning positive experiences</p>
          </div>
          {positiveAspectChart.labels.length ? (
            <div className="h-72">
              <Bar data={positiveAspectChart} options={aspectBarOptions} />
            </div>
          ) : <p className="py-12 text-center text-sm text-slate-400">No positive aspect mentions yet.</p>}
          <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
            {positiveAspects[0]
              ? `${positiveAspects[0].aspect} is the most frequently praised aspect in this restaurant's review sample (${positiveAspects[0].positive_mentions.toLocaleString()} positive mentions). A review may mention more than one aspect.`
              : 'There are not enough matched positive mentions to summarize a strength.'}
          </p>
        </div>
        <div className="chart-card rounded-2xl border border-rose-500/15 bg-white/[0.04] p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="font-bold text-rose-200">Where guests encounter friction</h3>
            <p className="mt-1 text-xs text-slate-400">Most frequently mentioned negative aspects</p>
          </div>
          {negativeAspectChart.labels.length ? (
            <div className="h-72">
              <Bar data={negativeAspectChart} options={aspectBarOptions} />
            </div>
          ) : <p className="py-12 text-center text-sm text-slate-400">No negative aspect mentions yet.</p>}
          <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
            {negativeAspects[0]
              ? `${negativeAspects[0].aspect} is the most frequently mentioned source of friction (${negativeAspects[0].negative_mentions.toLocaleString()} negative mentions). Check the review evidence below before deciding what action to take.`
              : 'There are not enough matched negative mentions to identify a recurring concern.'}
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/30 to-slate-900 p-5">
            <h3 className="flex items-center gap-2 font-bold text-red-200"><AlertTriangle size={17} /> Most frequent complaint</h3>
            {negativeAspects[0] ? (
              <>
                <p className="mt-3 text-lg font-bold text-white">{negativeAspects[0].aspect}</p>
                <p className="mt-1 text-sm text-slate-300">
                  Negative in {negativeAspects[0].negative_mentions.toLocaleString()} reviews; mean negative sentiment {negativeAspects[0].negative_sentiment_score.toFixed(2)}.
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{getOwnerAction(negativeAspects[0].aspect)}</p>
              </>
            ) : <p className="mt-3 text-sm text-slate-400">No negative aspect mentions found.</p>}
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/25 to-slate-900 p-5">
            <h3 className="flex items-center gap-2 font-bold text-emerald-200"><CheckCircle2 size={17} /> Most praised aspect</h3>
            {positiveAspects[0] ? (
              <>
                <p className="mt-3 text-lg font-bold text-white">{positiveAspects[0].aspect}</p>
                <p className="mt-1 text-sm text-slate-300">
                  Positive in {positiveAspects[0].positive_mentions.toLocaleString()} reviews; mean positive sentiment {positiveAspects[0].positive_sentiment_score.toFixed(2)}.
                </p>
              </>
            ) : <p className="mt-3 text-sm text-slate-400">No positive aspect mentions found.</p>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="font-bold text-white">Review evidence</h3>
            <p className="mt-1 text-xs text-slate-400">Read the original feedback and the aspect phrases matched in each review.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                aria-label="Search restaurant reviews"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search review text or ID"
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 md:w-60"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0B1120] px-3 text-sm text-slate-400">
              <span className="sr-only">Filter reviews by sentiment</span>
              <select
                value={sentiment}
                onChange={event => setSentiment(event.target.value)}
                className="bg-transparent py-2 text-sm text-white outline-none"
              >
                <option value="negative">Negative reviews</option>
                <option value="positive">Positive reviews</option>
                <option value="neutral">Neutral reviews</option>
                <option value="all">All reviews</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0B1120] px-3 text-sm text-slate-400">
              <span className="sr-only">Filter by reviewer status</span>
              <select
                aria-label="Filter by reviewer status"
                value={reviewerType}
                onChange={event => setReviewerType(event.target.value)}
                className="bg-transparent py-2 text-sm text-white outline-none"
              >
                <option value="all">All reviewers</option>
                <option value="elite">Elite reviewers</option>
                <option value="regular">Regular reviewers</option>
              </select>
            </label>
          </div>
        </div>
        {reviewError && <p role="alert" className="m-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{reviewError}</p>}
        <div className="max-h-[720px] overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#0f172a]">
              <tr className="text-xs uppercase tracking-wider text-slate-400">
                <th scope="col" className="px-4 py-3">Review</th>
                <th scope="col" className="px-4 py-3">Stars / sentiment</th>
                <th scope="col" className="px-4 py-3">Aspect evidence</th>
              </tr>
            </thead>
            <tbody>
              {reviewLoading ? (
                <tr><td colSpan="3" className="px-5 py-12 text-center text-slate-400">Loading reviews for this restaurant…</td></tr>
              ) : reviewResult.reviews.map(review => (
                <tr key={review.review_id} className="border-t border-white/[0.06] align-top hover:bg-white/[0.025]">
                  <td className="max-w-md px-4 py-4">
                    <p className="font-mono text-[11px] text-slate-500">{review.review_id} · {review.date || 'Date unavailable'}</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-300">{review.text}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Useful {review.useful} · Funny {review.funny} · Cool {review.cool}
                      {review.is_elite === true && <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 font-semibold text-amber-300">Elite · {Number(review.reviewer_review_count || 0).toLocaleString()} reviews</span>}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <p className="font-semibold text-amber-300">{review.stars ?? '—'} / 5 stars</p>
                    <p className={`mt-1 text-xs capitalize ${
                      review.sentiment === 'positive' ? 'text-emerald-300' :
                        review.sentiment === 'negative' ? 'text-red-300' : 'text-slate-400'
                    }`}>{review.sentiment} · {review.sentiment_score.toFixed(2)}</p>
                  </td>
                  <td className="max-w-lg px-4 py-4">
                    {review.aspects.length ? (
                      <div className="space-y-2">
                        {review.aspects.map((aspect, index) => (
                          <div key={`${aspect.aspect_name}-${index}`} className={`rounded-lg border px-3 py-2 ${
                            aspect.sentiment_score < -0.05
                              ? 'border-red-500/15 bg-red-500/[0.06]'
                              : aspect.sentiment_score > 0.05
                                ? 'border-emerald-500/15 bg-emerald-500/[0.06]'
                                : 'border-white/10 bg-white/[0.025]'
                          }`}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-200">{aspect.aspect_name}</span>
                              <span className={`font-mono text-[11px] ${aspect.sentiment_score < -0.05 ? 'text-red-300' : 'text-emerald-300'}`}>
                                {aspect.sentiment_score > 0 ? '+' : ''}{aspect.sentiment_score.toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-slate-400">“{aspect.mention_text}”</p>
                          </div>
                        ))}
                      </div>
                    ) : <span className="text-xs text-slate-500">No lexicon aspect matched this review.</span>}
                  </td>
                </tr>
              ))}
              {!reviewLoading && !reviewError && reviewResult.reviews.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-5 py-12 text-center text-sm text-slate-400">
                    {reviewerType !== 'all' && !reviewResult.reviewer_segmentation_available
                      ? 'Reviewer status is not in this dataset yet. Rebuild the curated data with the Yelp user CSV to enable Elite filtering.'
                      : 'No reviews match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{reviewResult.total.toLocaleString()} matching reviews · page {page} of {maxPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || reviewLoading} onClick={() => setPagination({ key: filterKey, page: page - 1 })} className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= maxPages || reviewLoading} onClick={() => setPagination({ key: filterKey, page: page + 1 })} className="rounded-md border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
      </section>

    </div>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
      <Database className="mx-auto text-cyan-400" size={28} />
      <h2 className="mt-3 text-lg font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function distanceKm(first, second) {
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistance(distance) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function RestaurantMapTab({ info, competitors }) {
  const latitude = Number(info?.latitude);
  const longitude = Number(info?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return <EmptyState title="Restaurant location unavailable" detail="Latitude and longitude are required to show nearby restaurants." />;
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Local landscape</p>
        <h2 className="mt-1 text-2xl font-bold text-white">Nearby restaurants</h2>
        <p className="mt-2 text-sm text-slate-400">The five closest restaurants in the curated sample, ordered by straight-line distance.</p>
      </div>
      <div className="h-[480px] overflow-hidden rounded-2xl border border-white/10">
        <MapContainer center={[latitude, longitude]} zoom={15} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker center={[latitude, longitude]} radius={10} pathOptions={{ color: '#22d3ee', fillColor: '#0891b2', fillOpacity: 0.9 }}>
            <Popup><strong>{info.name}</strong><br />Selected restaurant</Popup>
          </CircleMarker>
          {competitors.map((restaurant, index) => (
            <CircleMarker
              key={restaurant.id}
              center={[Number(restaurant.latitude), Number(restaurant.longitude)]}
              radius={8}
              pathOptions={{ color: '#c4b5fd', fillColor: index % 2 ? '#7c3aed' : '#db2777', fillOpacity: 0.85 }}
            >
              <Popup>
                <strong>{restaurant.name}</strong><br />
                {restaurant.primary_category || 'Restaurant'} · {formatDistance(restaurant.distance)} away
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {competitors.map(restaurant => (
          <div key={restaurant.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <p className="font-semibold text-white">{restaurant.name}</p>
            <p className="mt-1 text-xs text-slate-400">{restaurant.primary_category || 'Restaurant'} · {formatDistance(restaurant.distance)}</p>
          </div>
        ))}
        {!competitors.length && <p className="text-sm text-slate-400">No other restaurants with coordinates are available in the sample.</p>}
      </div>
    </section>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState('overview');
  const [restaurants, setRestaurants] = useState([]);
  const [allRestaurants, setAllRestaurants] = useState([]);
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [benchmarkMode, setBenchmarkMode] = useState('cuisine');
  const [selectedId, setSelectedId] = useState('');
  const [analysisState, setAnalysisState] = useState({ businessId: '', data: null, error: null });
  const [backendStatus, setBackendStatus] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const businessCount = backendStatus?.business_count;
  const pipelineReady = backendStatus?.ready;

  useEffect(() => {
    const controller = new AbortController();
    apiGet('/api/status', controller.signal)
      .then(status => {
        setBackendStatus(status);
        if (!status.business_count) return undefined;
        return apiGet('/api/restaurants?limit=200', controller.signal).then(restaurantList => {
          setRestaurants(restaurantList);
          setAllRestaurants(restaurantList);
          if (restaurantList.length) setSelectedId(current => current || restaurantList[0].id);
        });
      })
      .catch(requestError => {
        if (requestError.name !== 'AbortError') {
          setConnectionError(
            `Backend unavailable: ${requestError.message}. Set VITE_API_BASE_URL in your frontend host to the deployed API URL and redeploy.`,
          );
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!backendStatus || backendStatus.ready || connectionError) return undefined;
    const timer = window.setInterval(() => {
      apiGet('/api/status')
        .then(status => {
          setBackendStatus(status);
          if (status.ready) {
            return apiGet('/api/restaurants?limit=200').then(restaurantList => {
              setRestaurants(restaurantList);
              setAllRestaurants(restaurantList);
            });
          }
          return undefined;
        })
        .catch(requestError => setConnectionError(`Backend status unavailable: ${requestError.message}`));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [backendStatus, connectionError]);

  useEffect(() => {
    if (!restaurantQuery.trim() || !businessCount) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiGet(`/api/restaurants?q=${encodeURIComponent(restaurantQuery)}&limit=100`, controller.signal)
        .then(setRestaurants)
        .catch(requestError => {
          if (requestError.name !== 'AbortError') setConnectionError(`Restaurant search failed: ${requestError.message}`);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [restaurantQuery, businessCount]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const controller = new AbortController();
    apiGet(`/api/analyze/${encodeURIComponent(selectedId)}`, controller.signal)
      .then(result => setAnalysisState({ businessId: selectedId, data: result, error: null }))
      .catch(requestError => {
        if (requestError.name !== 'AbortError') {
          setAnalysisState({ businessId: selectedId, data: null, error: `Could not load restaurant analysis: ${requestError.message}` });
        }
      });
    return () => controller.abort();
  }, [selectedId, pipelineReady]);

  const data = analysisState.businessId === selectedId ? analysisState.data : null;
  const loading = Boolean(selectedId && backendStatus?.ready && !data && !analysisState.error);
  const error = connectionError || (analysisState.businessId === selectedId ? analysisState.error || null : null);
  const analysis = data?.analysis;
  const sentiment = analysis?.sentiment || { positive: 0, neutral: 0, negative: 0 };
  const sentimentTotal = Math.max(1, sentiment.positive + sentiment.neutral + sentiment.negative);
  const sentimentData = {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [{
      data: [sentiment.positive, sentiment.neutral, sentiment.negative],
      backgroundColor: ['#10b981', '#64748b', '#ef4444'],
      borderWidth: 0,
    }],
  };
  const positiveAspectData = {
    labels: (analysis?.positive_aspects || []).slice(0, 8).map(aspect => aspect.aspect),
    datasets: [{
      label: 'Positive reviews',
      data: (analysis?.positive_aspects || []).slice(0, 8).map(aspect => aspect.positive_mentions),
      backgroundColor: 'rgba(52, 211, 153, 0.82)',
      borderRadius: 5,
      borderSkipped: false,
    }],
  };
  const negativeAspectData = {
    labels: (analysis?.negative_aspects || []).slice(0, 8).map(aspect => aspect.aspect),
    datasets: [{
      label: 'Negative reviews',
      data: (analysis?.negative_aspects || []).slice(0, 8).map(aspect => aspect.negative_mentions),
      backgroundColor: 'rgba(251, 113, 133, 0.82)',
      borderRadius: 5,
      borderSkipped: false,
    }],
  };
  const benchmarks = {
    cuisine: analysis?.cuisine_benchmark,
    price: analysis?.price_benchmark,
    city: analysis?.sentiment_benchmark,
  };
  const benchmark = benchmarks[benchmarkMode];
  const benchmarkLabel = benchmarkMode === 'cuisine'
    ? benchmark?.category || 'Cuisine peers'
    : benchmarkMode === 'price'
      ? benchmark?.price_range ? `Price level ${'$'.repeat(benchmark.price_range)}` : 'Price peers'
      : 'City sample';
  const sentimentComparison = {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [
      {
        label: 'Selected restaurant',
        data: [
          sentiment.positive / sentimentTotal * 100,
          sentiment.neutral / sentimentTotal * 100,
          sentiment.negative / sentimentTotal * 100,
        ],
        backgroundColor: 'rgba(34, 211, 238, 0.82)',
        borderRadius: 5,
      },
      {
        label: `${benchmark?.restaurant_count || 0} ${benchmarkLabel} peers`,
        data: [
          (benchmark?.positive || 0) * 100,
          (benchmark?.neutral || 0) * 100,
          (benchmark?.negative || 0) * 100,
        ],
        backgroundColor: 'rgba(167, 139, 250, 0.82)',
        borderRadius: 5,
      },
    ],
  };
  const historical = analysis?.historical_monthly || [];
  const summarizeSentiment = rows => {
    const counts = rows.reduce((total, row) => ({
      positive: total.positive + row.positive,
      neutral: total.neutral + row.neutral,
      negative: total.negative + row.negative,
    }), { positive: 0, neutral: 0, negative: 0 });
    const total = counts.positive + counts.neutral + counts.negative;
    return { ...counts, total, positiveShare: total ? counts.positive / total : null };
  };
  const recentTrend = summarizeSentiment(historical.slice(-12));
  const priorTrend = summarizeSentiment(historical.slice(-24, -12));
  const trendDifference = recentTrend.positiveShare == null || priorTrend.positiveShare == null
    ? null
    : (recentTrend.positiveShare - priorTrend.positiveShare) * 100;
  const sentimentTrendInterpretation = trendDifference == null
    ? 'There is not enough dated review history to compare two 12-month periods.'
    : `Positive review share ${Math.abs(trendDifference) < 0.1 ? 'was broadly unchanged' : `${trendDifference > 0 ? 'rose' : 'fell'} by ${Math.abs(trendDifference).toFixed(1)} percentage points`} across ${historical.at(-12)?.month_year || 'the recent period'}–${historical.at(-1)?.month_year || 'the latest month'} versus the preceding 12 months (${recentTrend.total.toLocaleString()} versus ${priorTrend.total.toLocaleString()} reviews). This is the mix of posted reviews, not restaurant traffic.`;
  const dateRange = data?.info?.review_date_range;
  const reportParagraphs = (analysis?.report || 'No report generated yet.').split('\n\n');
  const selectedInResults = restaurants.some(restaurant => restaurant.id === selectedId);
  const selection = data?.info || restaurants.find(restaurant => restaurant.id === selectedId);
  const mapCompetitors = selection?.latitude == null || selection?.longitude == null
    ? []
    : allRestaurants
      .filter(restaurant => restaurant.id !== selectedId
        && restaurant.latitude != null && restaurant.longitude != null)
      .map(restaurant => ({
        ...restaurant,
        distance: distanceKm(
          { latitude: Number(selection.latitude), longitude: Number(selection.longitude) },
          { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) },
        ),
      }))
      .sort((first, second) => first.distance - second.distance)
      .slice(0, 5);

  return (
    <div className="app-shell flex h-screen overflow-hidden font-sans text-slate-200">
      <aside className="app-sidebar z-20 flex w-16 shrink-0 flex-col border-r border-white/5 bg-[#0f172a] md:w-64">
        <div className="p-3 md:p-6">
          <h1 className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-lg font-black tracking-tight text-transparent md:justify-start md:text-2xl">
            <Sparkles className="shrink-0 text-cyan-400" size={24} /> <span className="hidden md:inline">CulinaryPulse</span>
          </h1>
          <p className="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 md:block">Market Intelligence</p>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'trends', icon: TrendingUp, label: 'Feedback Trends' },
            { id: 'report', icon: FileText, label: 'Owner Summary' },
            { id: 'insights', icon: MessageSquare, label: 'Customer Insights' },
            { id: 'aspects', icon: FileSearch, label: 'Review Evidence' },
            { id: 'map', icon: MapPin, label: 'Nearby Map' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              title={tab.label}
              className={`flex w-full min-w-0 items-center justify-center gap-3 rounded-xl px-2 py-3 text-left text-sm font-medium leading-5 transition-all md:justify-start md:px-4 ${
                activeTab === tab.id
                  ? 'bg-cyan-500/10 text-cyan-300 shadow-[inset_2px_0_0_rgba(6,182,212,1)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <tab.icon className="shrink-0" size={18} /> <span className="hidden min-w-0 md:block">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-white/5 p-4 text-xs text-slate-500">
          <p className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${backendStatus?.ready ? 'animate-pulse bg-green-500' : 'bg-amber-400'}`} />
            <span className="hidden md:inline">{backendStatus?.ready ? 'Analysis ready' : backendStatus?.phase || 'Connecting'}</span>
          </p>
          {backendStatus?.review_count != null && <p className="mt-1 hidden md:block">{backendStatus.review_count.toLocaleString()} reviews · {backendStatus.city}</p>}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="dashboard-header z-10 flex flex-col gap-3 border-b border-white/5 bg-[#0f172a]/95 p-3 backdrop-blur-xl sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <label htmlFor="restaurant-search" className="text-sm font-medium text-slate-400">Restaurant</label>
            <div className="relative">
              <input
                id="restaurant-search"
                value={restaurantQuery}
                onChange={event => setRestaurantQuery(event.target.value)}
                placeholder="Search restaurant or city"
                className="w-full rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 sm:w-52"
              />
              <Search className="absolute right-3 top-2.5 text-slate-500" size={15} />
            </div>
            <div className="relative">
              <select
                aria-label="Select restaurant"
                value={selectedId}
                onChange={event => setSelectedId(event.target.value)}
                className="w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-slate-700 bg-[#0B1120] px-4 py-2 pr-10 text-sm text-white outline-none focus:border-cyan-500 sm:min-w-[220px]"
              >
                {selectedId && !selectedInResults && selection && (
                  <option value={selectedId}>{selection.name} ({selection.city})</option>
                )}
                {restaurants.map(restaurant => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name} ({restaurant.city})</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-2.5 text-slate-500" size={16} />
            </div>
          </div>
          {data?.info && (
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-slate-400">Rating: <strong className="text-amber-300">{data.info.stars} ★</strong></span>
              <span className="text-slate-400">Reviews: <strong className="text-white">{data.info.total_reviews.toLocaleString()}</strong></span>
              <span className="text-slate-400">{data.info.city}, {data.info.state}</span>
              {dateRange?.first && dateRange?.last && (
                <span className="text-slate-400">Review dates: <strong className="text-slate-200">{dateRange.first} – {dateRange.last}</strong></span>
              )}
            </div>
          )}
        </header>

        <div className="dashboard-content relative flex-1 overflow-y-auto p-3 custom-scrollbar sm:p-5 lg:p-8">
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0B1120]/80 backdrop-blur-sm">
              <Activity size={40} className="mb-3 animate-spin text-cyan-400" />
              <p className="text-sm text-cyan-300">Loading live restaurant analysis…</p>
            </div>
          )}

          {activeTab === 'aspects' && data && (
            <AspectExtractionTab businessId={selectedId} info={data.info} analysis={analysis} pipelinePhase={backendStatus?.phase} />
          )}
          {activeTab === 'overview' && data && !loading && (
            <div className="space-y-6">
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-sm leading-6 text-amber-100">
                Historical Yelp review snapshot: {dateRange?.first || 'date unavailable'} through {dateRange?.last || 'date unavailable'}. This is not a live feed or a measure of current restaurant traffic.
              </p>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/50 to-slate-900 p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">Reviews analyzed</p>
                  <p className="mt-2 text-4xl font-black text-white">{data.info.total_reviews.toLocaleString()}</p>
                  <p className="mt-2 text-xs text-slate-400">Reviews included in this curated historical sample</p>
                </div>
                <div className="rounded-2xl border border-emerald-500/15 bg-white/[0.04] p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Positive review sentiment</p>
                  <p className="mt-2 text-4xl font-black text-emerald-300">{Math.round(sentiment.positive / sentimentTotal * 100)}%</p>
                </div>
                <div className="rounded-2xl border border-red-500/15 bg-white/[0.04] p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Negative review sentiment</p>
                  <p className="mt-2 text-4xl font-black text-red-300">{Math.round(sentiment.negative / sentimentTotal * 100)}%</p>
                </div>
                <div className="rounded-2xl border border-violet-500/15 bg-white/[0.04] p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Useful-weighted sentiment</p>
                  <p className="mt-2 text-4xl font-black text-violet-300">
                    {analysis?.weighted_sentiment?.score == null ? '—' : `${analysis.weighted_sentiment.score.toFixed(1)}/100`}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {analysis?.weighted_sentiment?.used_unweighted_fallback
                      ? 'No useful votes recorded; showing the unweighted average on a 0–100 scale.'
                      : `VADER sentiment on a 0–100 scale, weighted by ${analysis?.weighted_sentiment?.weight_sum?.toLocaleString() || 0} useful votes.`}
                  </p>
                </div>
              </section>
              <section className="grid gap-5 xl:grid-cols-2">
                <div className="chart-card rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white">Review sentiment</h3>
                      <p className="mt-1 text-xs text-slate-500">Share of {data.info.total_reviews.toLocaleString()} reviews</p>
                    </div>
                    <span className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.07] px-2.5 py-1 text-[11px] font-medium text-cyan-200">Historical snapshot</span>
                  </div>
                  <div className="mx-auto h-64 max-w-xl sm:h-72">
                    <Doughnut data={sentimentData} options={{
                      maintainAspectRatio: false,
                      cutout: '72%',
                      plugins: {
                        legend: { position: 'bottom', labels: { color: '#cbd5e1', usePointStyle: true, pointStyle: 'circle', padding: 18 } },
                      },
                    }} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {Math.round(sentiment.positive / sentimentTotal * 100)}% of sampled reviews are classified as positive and {Math.round(sentiment.negative / sentimentTotal * 100)}% as negative. Sentiment describes review wording; it does not verify a visit or explain its cause.
                  </p>
                </div>
                <div className="chart-card rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-white">Sentiment benchmark</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {benchmarkMode === 'city'
                          ? 'Pooled review shares for the rest of the curated city sample.'
                          : 'Average sentiment mix across matching restaurants, with each restaurant weighted equally.'}
                      </p>
                    </div>
                    <select
                      aria-label="Choose sentiment benchmark"
                      value={benchmarkMode}
                      onChange={event => setBenchmarkMode(event.target.value)}
                      className="rounded-lg border border-slate-700 bg-[#0B1120] px-3 py-2 text-xs text-white"
                    >
                      <option value="cuisine">Cuisine peers</option>
                      <option value="price">Same price range</option>
                      <option value="city">Whole city sample</option>
                    </select>
                  </div>
                  <div className="mt-4 h-64 sm:h-72">
                    <Bar data={sentimentComparison} options={{
                      maintainAspectRatio: false,
                      scales: {
                        x: { grid: { display: false }, ticks: { color: '#cbd5e1' } },
                        y: { beginAtZero: true, max: 100, grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { color: '#94a3b8', callback: value => `${value}%` } },
                      },
                      plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', usePointStyle: true, pointStyle: 'circle', padding: 18 } } },
                    }} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {benchmark?.positive == null
                      ? `No ${benchmarkLabel.toLowerCase()} are available in this curated sample for comparison.`
                      : benchmarkMode === 'city'
                        ? `Positive share is ${Math.abs((sentiment.positive / sentimentTotal - benchmark.positive) * 100).toFixed(1)} percentage points ${(sentiment.positive / sentimentTotal) >= benchmark.positive ? 'above' : 'below'} the pooled shares of the other ${benchmark.restaurant_count} sampled restaurants. This is descriptive context, not a matched-competitor ranking.`
                        : `Positive share is ${Math.abs((sentiment.positive / sentimentTotal - benchmark.positive) * 100).toFixed(1)} percentage points ${(sentiment.positive / sentimentTotal) >= benchmark.positive ? 'above' : 'below'} the average of ${benchmark.restaurant_count} ${benchmarkLabel} peers. Each peer restaurant contributes equally; this is descriptive context, not a causal ranking.`}
                  </p>
                </div>
              </section>
              <section className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/25 to-slate-900 p-5 sm:p-6">
                <h3 className="flex items-center gap-2 font-bold text-rose-200"><AlertTriangle size={17} /> Attribute mismatch alerts</h3>
                <p className="mt-1 text-xs text-slate-400">Listed business attributes compared with negative review evidence; alerts require at least three distinct reviews.</p>
                {analysis?.attribute_mismatches?.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {analysis.attribute_mismatches.map(item => (
                      <div key={item.claim} className="rounded-xl border border-rose-400/15 bg-black/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-white">{item.claim}</p>
                          <span className="whitespace-nowrap rounded-full bg-rose-400/10 px-2.5 py-1 text-xs text-rose-200">{item.negative_mentions} negative mentions</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">{item.message}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="mt-3 text-sm text-slate-300">No repeated attribute contradictions met the evidence threshold in this review sample.</p>}
              </section>
              <section className="grid gap-5 xl:grid-cols-2">
                {[
                  { title: 'What guests praise', tone: 'emerald', chart: positiveAspectData },
                  { title: 'Where guests encounter friction', tone: 'rose', chart: negativeAspectData },
                ].map(item => (
                  <div key={item.title} className={`chart-card rounded-2xl border ${item.tone === 'emerald' ? 'border-emerald-500/15' : 'border-rose-500/15'} bg-white/[0.04] p-4 sm:p-6`}>
                    <h3 className={`font-bold ${item.tone === 'emerald' ? 'text-emerald-200' : 'text-rose-200'}`}>{item.title}</h3>
                    <p className="mb-4 mt-1 text-xs text-slate-400">{item.tone === 'emerald' ? 'Most frequently praised aspects' : 'Most frequently mentioned negative aspects'}</p>
                    <div className="h-64 sm:h-72">
                      {item.chart.labels.length
                        ? <Bar data={item.chart} options={aspectBarOptions} />
                        : <p className="py-12 text-center text-sm text-slate-400">No aspect mentions yet.</p>}
                    </div>
                    <p className="mt-3 border-t border-white/10 pt-3 text-sm leading-6 text-slate-300">
                      {item.tone === 'emerald'
                        ? (analysis?.positive_aspects?.[0]
                          ? `${analysis.positive_aspects[0].aspect} leads with ${analysis.positive_aspects[0].positive_mentions.toLocaleString()} positive mentions. Use the original reviews to understand what guests value.`
                          : 'No recurring positive aspect was identified in the available review sample.')
                        : (analysis?.negative_aspects?.[0]
                          ? `${analysis.negative_aspects[0].aspect} leads with ${analysis.negative_aspects[0].negative_mentions.toLocaleString()} negative mentions. Verify the pattern in the original reviews before acting.`
                          : 'No recurring negative aspect was identified in the available review sample.')}
                    </p>
                  </div>
                ))}
              </section>
            </div>
          )}
          {activeTab === 'trends' && data && !loading && (
            <FeedbackTrends
              info={data.info}
              historical={historical}
              weekdayTrends={analysis?.weekday_trends || []}
              interpretation={sentimentTrendInterpretation}
            />
          )}
          {activeTab === 'report' && data && !loading && (
            <section className="max-w-4xl rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:p-10">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-white"><Sparkles className="text-cyan-400" /> Owner summary</h2>
              <p className="mb-6 mt-2 border-b border-white/10 pb-4 text-sm text-slate-400">
                Actionable patterns from {data.info.total_reviews.toLocaleString()} reviews for {data.info.name}.
              </p>
              <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0B1120] p-6">
                {reportParagraphs.map((paragraph, index) => paragraph.trim()
                  ? <p key={index} className="text-sm leading-7 text-slate-300">{paragraph}</p>
                  : null)}
              </div>
            </section>
          )}
          {activeTab === 'insights' && data && !loading && (
            <div className="space-y-6">
              <section className="grid gap-6 xl:grid-cols-2">
                <AspectList title="What customers praise" items={analysis?.positive_aspects || []} positive />
                <AspectList title="What needs investigation" items={analysis?.negative_aspects || []} />
              </section>
              <section className="rounded-2xl border border-cyan-500/15 bg-white/[0.04] p-6">
                <h2 className="text-xl font-bold text-cyan-200">Pro tips from locals</h2>
                <p className="mt-1 text-xs text-slate-400">Short Yelp tips, ranked by compliments then recency.</p>
                {analysis?.tips?.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {analysis.tips.map((tip, index) => (
                      <article key={`${tip.date}-${index}`} className="rounded-xl border border-white/10 bg-[#0B1120]/70 p-4">
                        <p className="text-sm leading-6 text-slate-200">“{tip.text}”</p>
                        <p className="mt-2 text-xs text-slate-500">{tip.date || 'Date unavailable'} · {tip.compliment_count} compliments</p>
                      </article>
                    ))}
                  </div>
                ) : <p className="mt-4 text-sm text-slate-400">No local tips are included in this dataset. Rebuild the curated data with the Yelp tip CSV to add them.</p>}
              </section>
            </div>
          )}
          {activeTab === 'map' && data && !loading && (
            <RestaurantMapTab info={data.info} competitors={mapCompetitors} />
          )}
          {activeTab !== 'aspects' && !data && !error && !loading && (
            <EmptyState title="Curated review data unavailable" detail="Create data.json by running the city-curated review pipeline, then restart the API." />
          )}
          {activeTab === 'aspects' && !data && !error && !loading && (
            <EmptyState title="Waiting for restaurant analysis" detail="Start the API with the curated city review dataset to open live review evidence." />
          )}
          {activeTab === 'map' && !data && !error && !loading && (
            <EmptyState title="Waiting for restaurant location" detail="Select a restaurant with location coordinates to show the nearby map." />
          )}
        </div>
      </main>
    </div>
  );
}

function AspectList({ title, items, positive = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
      <h3 className={`mb-4 flex items-center gap-2 font-bold ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
        {positive ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}{title}
      </h3>
      <div className="space-y-3">
        {items.length ? items.slice(0, 10).map(item => (
          <div key={item.aspect} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#0B1120]/70 p-3">
            <span className="text-sm text-slate-200">{item.aspect}</span>
            <span className={`whitespace-nowrap text-xs ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
              {positive ? item.positive_mentions : item.negative_mentions} reviews
            </span>
          </div>
        )) : <p className="text-sm text-slate-400">No aspect mentions available.</p>}
      </div>
    </div>
  );
}

function FeedbackTrends({ info, historical, weekdayTrends, interpretation }) {
  const recent = historical.slice(-12).reduce((total, month) => total + month.count, 0);
  const previous = historical.slice(-24, -12).reduce((total, month) => total + month.count, 0);
  const { review_date_range: dateRange } = info;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 lg:p-8">
        <h2 className="text-2xl font-bold text-white">Historical guest feedback</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Monthly sentiment and review-posting patterns for {info.name}. No future review or demand projections are shown.
        </p>
        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-100">
          Data coverage: {dateRange?.first || 'date unavailable'} through {dateRange?.last || 'date unavailable'}. This historical Yelp sample does not measure diners, reservations, orders, or sales.
        </p>
      </section>

      <section className="chart-card rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-white">Day-of-week complaint signals</h3>
          <p className="mt-1 text-xs text-slate-400">Negative share and review volume by the day each review was posted</p>
        </div>
        {weekdayTrends.some(day => day.count) ? (
          <div className="h-72">
            <Bar data={{
              labels: weekdayTrends.map(day => day.day),
              datasets: [{
                label: 'Negative review share',
                data: weekdayTrends.map(day => day.negative_share == null ? null : day.negative_share * 100),
                backgroundColor: 'rgba(251,113,133,0.78)',
                borderRadius: 5,
              }],
            }} options={{
              maintainAspectRatio: false,
              scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { beginAtZero: true, max: 100, title: { display: true, text: 'Negative review share', color: '#94a3b8' }, ticks: { color: '#94a3b8', callback: value => `${value}%` } },
              },
              plugins: {
                tooltip: {
                  callbacks: {
                    label: context => `${context.raw?.toFixed(1) ?? '—'}% negative · ${weekdayTrends[context.dataIndex].count.toLocaleString()} posted reviews`,
                  },
                },
                legend: { display: false },
              },
            }} />
          </div>
        ) : <p className="py-10 text-center text-sm text-slate-400">No valid review dates are available for this restaurant.</p>}
        <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
          Day of week reflects when reviewers posted, not necessarily when they visited; treat weekday differences as a review-pattern signal rather than proof of staffing or service causes.
        </p>
      </section>

      <section className="chart-card rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-white">Monthly sentiment mix</h3>
          <p className="mt-1 text-xs text-slate-400">Share of that month's posted reviews in each sentiment group</p>
        </div>
        {historical.length ? (
          <div role="img" aria-label="Line chart of positive, neutral, and negative review shares by month" className="h-80">
            <Line data={{
              labels: historical.map(month => month.month_year),
              datasets: [
                { label: 'Positive', data: historical.map(month => month.positive_share == null ? null : month.positive_share * 100), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.08)', tension: 0.25, spanGaps: false },
                { label: 'Neutral', data: historical.map(month => month.neutral_share == null ? null : month.neutral_share * 100), borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.06)', tension: 0.25, spanGaps: false },
                { label: 'Negative', data: historical.map(month => month.negative_share == null ? null : month.negative_share * 100), borderColor: '#fb7185', backgroundColor: 'rgba(251,113,133,0.06)', tension: 0.25, spanGaps: false },
              ],
            }} options={{
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index' },
              scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 12, maxRotation: 0 } },
                y: { beginAtZero: true, max: 100, title: { display: true, text: 'Share of reviews', color: '#94a3b8' }, ticks: { color: '#94a3b8', callback: value => `${value}%` } },
              },
              plugins: {
                tooltip: {
                  callbacks: {
                    label: context => `${context.dataset.label}: ${context.raw == null ? 'no reviews' : `${context.raw.toFixed(1)}% (${historical[context.dataIndex].count} reviews)`}`,
                  },
                },
                legend: { position: 'bottom', labels: { color: '#cbd5e1', usePointStyle: true, pointStyle: 'circle', padding: 18 } },
              },
            }} />
          </div>
        ) : <p className="py-10 text-center text-sm text-slate-400">No dated review history is available for this restaurant.</p>}
        <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">{interpretation}</p>
      </section>

      <section className="chart-card rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="font-bold text-white">Monthly Yelp review posts</h3>
          <p className="mt-1 text-xs text-slate-400">Historical post counts only—not restaurant traffic or demand</p>
        </div>
        {historical.length ? (
          <div role="img" aria-label="Bar chart of monthly Yelp review-post counts" className="h-72">
            <Bar data={{
              labels: historical.map(month => month.month_year),
              datasets: [{ label: 'Review posts', data: historical.map(month => month.count), backgroundColor: 'rgba(34, 211, 238, 0.78)', borderRadius: 4 }],
            }} options={{
              maintainAspectRatio: false,
              scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 12, maxRotation: 0 } },
                y: { beginAtZero: true, title: { display: true, text: 'Yelp posts', color: '#94a3b8' }, ticks: { color: '#94a3b8', precision: 0 } },
              },
              plugins: { legend: { display: false } },
            }} />
          </div>
        ) : <p className="py-10 text-center text-sm text-slate-400">No dated review history is available for this restaurant.</p>}
        <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">
          {recent && previous
            ? `The latest 12 available months contain ${recent.toLocaleString()} review posts, compared with ${previous.toLocaleString()} in the preceding 12 months. Changes can reflect review-posting behavior and data coverage, not changes in guest visits.`
            : 'There is not enough dated review history to compare two 12-month periods.'}
        </p>
      </section>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center bg-red-950 p-10 text-white">
          <h1 className="mb-4 text-3xl font-bold">Dashboard error</h1>
          <p className="max-w-2xl overflow-auto rounded bg-black/50 p-4 font-mono text-sm">{this.state.error.toString()}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 rounded bg-white px-4 py-2 font-bold text-black">Refresh</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><MainApp /></ErrorBoundary>;
}
