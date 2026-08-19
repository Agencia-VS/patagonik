/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_CLOUDINARY_CLOUD_NAME?: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SECRET_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly CLOUDINARY_API_KEY?: string;
  readonly CLOUDINARY_API_SECRET?: string;
  readonly CLOUDINARY_ASSET_FOLDER?: string;
  readonly VERCEL_DEPLOY_HOOK_URL?: string;
  readonly CRON_SECRET?: string;
  readonly MEDIA_REMOTE_REQUIRED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
