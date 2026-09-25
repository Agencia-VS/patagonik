import type { APIRoute } from 'astro';

export const prerender = false;

interface GoogleReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  publishTime?: string;
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; uri?: string };
}

interface GooglePlaceDetails {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: GoogleReview[];
}

const BUILD_ENV = {
  GOOGLE_PLACES_API_KEY: import.meta.env.GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACE_ID: import.meta.env.GOOGLE_PLACE_ID,
} as const;

function serverEnv(name: keyof typeof BUILD_ENV): string {
  const value = process.env[name] ?? BUILD_ENV[name];
  return typeof value === 'string' ? value.trim() : '';
}

function json(data: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const apiKey = serverEnv('GOOGLE_PLACES_API_KEY');
  const placeId = serverEnv('GOOGLE_PLACE_ID');
  if (!apiKey || !placeId) return json({ error: 'Google Places aún no está configurado.' }, 503);
  if (!/^[A-Za-z0-9_-]+$/.test(placeId)) return json({ error: 'El Place ID configurado no es válido.' }, 500);

  const requestedLanguage = new URL(request.url).searchParams.get('lang') ?? 'es';
  const languageCode = ['es', 'en', 'pt'].includes(requestedLanguage) ? requestedLanguage : 'es';
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${languageCode}`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const details = await response.text();
      console.error('[google-reviews] Places API returned', response.status, details.slice(0, 500));
      return json({ error: 'No se pudieron cargar las reseñas de Google.' }, 502);
    }

    const place = (await response.json()) as GooglePlaceDetails;
    const reviews = (place.reviews ?? []).map((review) => ({
      rating: typeof review.rating === 'number' && Number.isFinite(review.rating) ? review.rating : 0,
      text: review.text?.text ?? review.originalText?.text ?? '',
      author: review.authorAttribution?.displayName ?? 'Usuario de Google',
      authorUrl: review.authorAttribution?.uri ?? '',
      published: review.relativePublishTimeDescription ?? '',
      publishTime: review.publishTime ?? '',
    })).filter((review) => review.text.trim() && review.rating > 0);

    return json({
      rating: Number.isFinite(place.rating) ? place.rating : null,
      userRatingCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
      googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(placeId)}`,
      reviews,
    }, 200, 'public, s-maxage=3600, stale-while-revalidate=86400');
  } catch (error) {
    console.error('[google-reviews] Request failed', error);
    return json({ error: 'No se pudieron cargar las reseñas de Google.' }, 502);
  }
};
