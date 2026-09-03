# Administración de contenido y recursos

## Arquitectura

La web pública se genera de forma estática. Durante cada build, Astro lee
`landing_published_manifest` y deja URLs de Cloudinary en el HTML. Supabase es
el plano de control del panel, no una dependencia de cada visita:

1. El administrador entra en `/admin` con Supabase Auth.
2. Sube una imagen/video con firma privada o pega una URL/public ID de Cloudinary.
3. Crea o edita experiencias, genera EN/PT y define su prioridad editorial.
4. Guarda borradores. RLS limita las lecturas y escrituras al rol `admin`.
5. `Publicar cambios` promueve contenido, orden y recursos en una misma transacción, guarda una revisión y llama un Deploy Hook de Vercel.
6. El nuevo build genera `srcset`/`sizes` de Cloudinary y conserva el fallback local si el servicio remoto no está configurado.

Por eso, si el proyecto gratuito de Supabase se pausa, la landing continúa
sirviendo la última versión. Sólo quedan temporalmente fuera de servicio el
panel y la siguiente publicación.

## Rendimiento de medios

- Cloudinary entrega anchos de 480 a 1920 px con `f_auto` y `q_auto`.
- Cada contexto tiene su `sizes`: hero, franja, fondo, tarjeta, índice y CTA.
- Sólo el hero-imagen es prioritario. El resto usa un `IntersectionObserver`
  con 480 px de anticipación; esto evita descargar al mismo tiempo los clones
  desktop y móvil creados por el diseño.
- El hero-video usa `preload="none"`, se adjunta al entrar cerca del viewport,
  se pausa fuera de pantalla y no se reproduce con `prefers-reduced-motion` o
  `Save-Data`.
- Los `<image-slot>` originales siguen presentes porque el CSS y las
  animaciones dependen de ellos.

## 1. Crear y preparar Supabase

1. Crear el proyecto y ejecutar en orden las migraciones de `supabase/migrations/`
   con `supabase db push` o desde SQL Editor.
2. En Authentication → Users, crear al usuario del cliente.
3. Convertirlo en administrador desde SQL Editor:

```sql
insert into public.profiles (user_id, role)
select id, 'admin' from auth.users where email = 'cliente@ejemplo.com'
on conflict (user_id) do update set role = 'admin', updated_at = now();
```

No hay registro público. `/admin` tiene `noindex`, pero la protección real es
Supabase Auth + RLS; ocultar la ruta no se considera seguridad.

## 2. Preparar Cloudinary

Crear/usar una carpeta `patagonik/landing` y obtener Cloud name, API key y API
secret. La API secret queda únicamente en Vercel. El navegador pide una firma
de corta duración al endpoint autenticado `/api/admin/cloudinary-sign`; nunca
recibe el secreto.

El panel admite:

- subir imagen, MP4 o WebM;
- pegar una URL de entrega de Cloudinary que contenga `/v123.../`;
- pegar directamente un `public_id`;
- alt en español/inglés/portugués y foco X/Y entre 0 y 1.

## 3. Variables de Vercel

Copiar las variables de `.env.example` en Project Settings → Environment
Variables. Aplicarlas a Production y Preview según corresponda:

| Variable | Ámbito | Uso |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | pública | Auth y Data API |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | clave con RLS |
| `PUBLIC_CLOUDINARY_CLOUD_NAME` | pública | URLs de entrega |
| `SUPABASE_SECRET_KEY` | privada | build, validación de rol y healthcheck |
| `CLOUDINARY_API_KEY` | privada/no sensible por sí sola | upload firmado |
| `CLOUDINARY_API_SECRET` | privada | firma de Cloudinary |
| `CLOUDINARY_ASSET_FOLDER` | privada | carpeta destino |
| `VERCEL_DEPLOY_HOOK_URL` | privada | rebuild al publicar |
| `CRON_SECRET` | privada | autenticar cron/healthcheck |
| `OPENAI_API_KEY` | privada | generar traducciones EN/PT |
| `OPENAI_TRANSLATION_MODEL` | privada/opcional | modelo de traducción; por defecto `gpt-5.6-luna` |
| `MEDIA_REMOTE_REQUIRED` | build | fallback o fallo estricto |
| `EXPERIENCES_REMOTE_REQUIRED` | build | fallback local o fallo estricto del catálogo |

Crear el Deploy Hook en Vercel → Settings → Git → Deploy Hooks y apuntarlo a
la rama de producción. No pegar secretos en issues, PR ni chat.

## 4. Gestionar experiencias

En la pestaña **Experiencias** del admin:

1. Pulsar **Nueva experiencia** y completar la versión española.
2. Pulsar **Generar EN/PT**. Las traducciones se muestran en pestañas y se
   pueden corregir antes de guardar.
3. Guardar el borrador y asignar una portada en la tarjeta de recurso creada
   automáticamente debajo de la lista.
4. Arrastrar las filas o usar ↑/↓ para definir la prioridad. Es el mismo orden
   de la portada y del catálogo.
5. Para retirar una experiencia, pulsar **Eliminar** y confirmar. Desaparece
   del panel de inmediato y se retira de card, modal y página individual al
   publicar; el archivo original permanece en Cloudinary.
6. Pulsar **Publicar cambios**. El sistema bloquea la publicación si una
   experiencia activa no tiene contenido completo o portada.

Archivar es reversible y sólo afecta la web al publicar. El slug se fija al
crear porque forma parte de las URLs indexables de los tres idiomas.
El panel está optimizado para celular: el orden se cambia con botones grandes,
el editor ocupa la pantalla completa y **Publicar cambios** permanece accesible
en la parte inferior.

## 5. Migrar las fotos existentes

Con las variables privadas cargadas en un `.env` local (no versionado):

```bash
set -a
. ./.env
set +a
npm run media:migrate
```

El script sube las 20 imágenes actuales, crea filas `media_assets` y las deja
como borrador. Revisarlas en `/admin` y pulsar **Publicar cambios**. El hero no
tiene un archivo local y se gestiona directamente desde el panel.

Después de comprobar Production se puede poner `MEDIA_REMOTE_REQUIRED=true` y
`EXPERIENCES_REMOTE_REQUIRED=true`, para que un build falle en vez de publicar
el respaldo local si no logra leer la versión editorial de Supabase.
No se borran automáticamente los fallbacks locales: son el mecanismo de
recuperación y no se descargan cuando un slot publicado tiene `public_id`.
`.vercelignore` evita, además, enviar el pesado archivo fuente `design/` al
despliegue.

## 6. Evitar pausa y mantener backups

Supabase indica que un proyecto Free puede pausarse por baja actividad durante
un período de siete días. No conviene depender de que el administrador entre:

- `vercel.json` consulta una fila una vez al día (máximo práctico del plan
  Hobby) mediante `/api/internal/supabase-health` y `CRON_SECRET`.
- `.github/workflows/supabase-keepalive.yml` añade tres consultas diarias.
  Crear en GitHub → Settings → Secrets and variables → Actions un secret
  llamado `CRON_SECRET`, con exactamente el mismo valor configurado en Vercel.
  La URL pública del endpoint queda definida en el workflow y no es un secreto.
- Para más independencia, un monitor externo puede consultar ese mismo
  endpoint con el header `Authorization: Bearer …`.

El keepalive reduce el riesgo, pero no sustituye una garantía contractual: si
el panel debe estar disponible sin excepción, usar Supabase Pro. GitHub puede
desactivar workflows programados en repositorios públicos tras 60 días sin
actividad; por eso el cron diario de Vercel queda como base estable.

Free no ofrece el mismo historial automático de backups que Pro. Supabase
recomienda exportar periódicamente roles, esquema y datos con su CLI. Como
este repositorio es público, el dump **no** se sube a GitHub Actions ni se
versiona: debe guardarse en un destino privado autorizado.

Con `SUPABASE_DB_URL` apuntando al Session Pooler:

```bash
mkdir -p backups/supabase
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f backups/supabase/roles.sql
supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/supabase/schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  -x "storage.buckets_vectors" -x "storage.vector_indexes" \
  -f backups/supabase/data.sql
```

`backups/` está ignorado por Git. Cifrar y copiar esa carpeta al gestor de
backups privado del cliente. También se puede exportar sólo el manifiesto:

```bash
npm run media:export
```

## Operación y recuperación

- **Guardar borrador** no altera la web pública.
- **Publicar** guarda un batch en `landing_slot_revisions` y dispara Vercel.
- Contenido, orden y portada de experiencias se publican juntos; no puede
  quedar una card nueva apuntando a un modal o página incompletos.
- Si la base se creó con la primera versión del panel y Publicar responde
  `UPDATE requires a WHERE clause`, ejecutar una vez
  `supabase/migrations/20260819210000_fix_publish_safe_update.sql` en SQL Editor.
- Si el deploy hook falla, el panel lo informa y registra `publish_jobs.failed`;
  volver a pulsar Publicar reintenta el despliegue.
- Si Supabase está pausado, restaurarlo desde el dashboard. La web no requiere
  una consulta en runtime y continúa en línea.
- Si Cloudinary tiene una incidencia, el CDN/cache puede seguir respondiendo.
  El dump mensual guarda referencias y configuración, no los binarios nuevos:
  conservar los originales fuera de Cloudinary o contratar su opción de backup.

## Referencias operativas

- Supabase: https://supabase.com/docs/guides/deployment/going-into-prod
- Backups Free: https://supabase.com/docs/guides/platform/backups
- Backup/restore CLI: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Vercel Cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- GitHub workflows inactivos: https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow
- Cloudinary responsive: https://cloudinary.com/documentation/responsive_html
