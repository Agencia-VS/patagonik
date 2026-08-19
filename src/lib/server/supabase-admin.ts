export interface SupabaseUser {
  id: string;
  email?: string;
}

// Vite sólo reemplaza accesos estáticos como `import.meta.env.MI_VARIABLE`.
// process.env mantiene las variables disponibles en las funciones de Vercel
// y este mapa conserva compatibilidad con .env durante desarrollo/build local.
const BUILD_ENV = {
  SUPABASE_URL: import.meta.env.SUPABASE_URL,
  PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  PUBLIC_SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_ANON_KEY: import.meta.env.SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY: import.meta.env.SUPABASE_SECRET_KEY,
  SUPABASE_SERVICE_ROLE_KEY: import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
  PUBLIC_CLOUDINARY_CLOUD_NAME: import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: import.meta.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: import.meta.env.CLOUDINARY_API_SECRET,
  CLOUDINARY_ASSET_FOLDER: import.meta.env.CLOUDINARY_ASSET_FOLDER,
  VERCEL_DEPLOY_HOOK_URL: import.meta.env.VERCEL_DEPLOY_HOOK_URL,
  CRON_SECRET: import.meta.env.CRON_SECRET,
} as const;

type ServerEnvName = keyof typeof BUILD_ENV;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function env(name: ServerEnvName): string | undefined {
  const value = process.env[name] ?? BUILD_ENV[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function requiredEnv(name: ServerEnvName): string {
  const value = env(name);
  if (!value) throw new ApiError(503, `Configuración incompleta: ${name}`);
  return value;
}

export function supabaseUrl(): string {
  return (env('SUPABASE_URL') ?? requiredEnv('PUBLIC_SUPABASE_URL')).replace(/\/$/, '');
}

export function publicKey(): string {
  return env('PUBLIC_SUPABASE_PUBLISHABLE_KEY')
    ?? env('PUBLIC_SUPABASE_ANON_KEY')
    ?? requiredEnv('SUPABASE_ANON_KEY');
}

export function secretKey(): string {
  return env('SUPABASE_SECRET_KEY') ?? requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function serviceHeaders(): Record<string, string> {
  const key = secretKey();
  const headers: Record<string, string> = { apikey: key };
  // Las service_role antiguas son JWT; las nuevas sb_secret_* sólo se envían
  // como apikey y no son válidas en Authorization.
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(serviceHeaders())) headers.set(key, value);
  headers.set('Accept', 'application/json');
  return fetch(`${supabaseUrl()}${path}`, { ...init, headers });
}

export function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new ApiError(401, 'Sesión requerida.');
  return match[1];
}

export async function assertAdmin(request: Request): Promise<{ token: string; user: SupabaseUser }> {
  const token = bearerToken(request);
  const userResponse = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: publicKey(), Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) throw new ApiError(401, 'La sesión expiró. Vuelve a iniciar sesión.');
  const user = (await userResponse.json()) as SupabaseUser;

  const profileResponse = await serviceFetch(
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=user_id&limit=1`,
  );
  if (!profileResponse.ok) throw new ApiError(502, 'No se pudo verificar el rol de administrador.');
  const profiles = (await profileResponse.json()) as { user_id: string }[];
  if (!profiles.length) throw new ApiError(403, 'Esta cuenta no tiene rol de administrador.');
  return { token, user };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error('[api]', error);
  return json({ error: 'Error interno.' }, 500);
}
