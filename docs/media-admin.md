# Administración de contenido y recursos

## Arquitectura

La web pública se genera de forma estática. Durante cada build, Astro lee
`landing_published_manifest` y deja URLs públicas de Supabase Storage en el HTML.
Supabase es el plano de control del panel, no una dependencia de cada visita:

1. El administrador entra en `/admin` con Supabase Auth.
2. Sube una imagen/video directamente a Storage mediante una URL firmada de corta duración, o pega una ruta pública de Storage.
3. Crea o edita experiencias, genera EN/PT y define su prioridad editorial.
4. Guarda borradores. RLS limita las lecturas y escrituras al rol `admin`.
5. `Publicar cambios` promueve contenido, orden y recursos en una misma transacción, guarda una revisión y llama un Deploy Hook de Vercel.
6. El nuevo build genera `srcset`/`sizes` con variantes WebP guardadas en Storage y conserva el fallback local si el servicio remoto no está configurado.

Por eso, si el proyecto gratuito de Supabase se pausa, la landing continúa
sirviendo la última versión. Sólo quedan temporalmente fuera de servicio el
panel y la siguiente publicación.

## Rendimiento de medios

- El panel genera variantes WebP de 480 a 1920 px en el navegador y guarda el original para el modal y futuras exportaciones.
- Los videos se guardan como MP4/WebM sin transcodificación en el plan Free; el panel genera un poster WebP del primer tramo del video.
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
   con `supabase db push` o desde SQL Editor. La migración
   `20260916000000_supabase_storage_media.sql` crea el bucket público
   `patagonik-media`, limita los objetos a 50 MB (límite del plan Free) y aplica RLS de escritura sólo
   a administradores.
2. En Authentication → Users, crear al usuario del cliente.
3. Convertirlo en administrador desde SQL Editor:

```sql
insert into public.profiles (user_id, role)
select id, 'admin' from auth.users where email = 'cliente@ejemplo.com'
on conflict (user_id) do update set role = 'admin', updated_at = now();
```

No hay registro público. `/admin` tiene `noindex`, pero la protección real es
Supabase Auth + RLS; ocultar la ruta no se considera seguridad.

## 2. Preparar Storage

No se necesitan credenciales de otro proveedor. El navegador pide al endpoint
autenticado `/api/admin/storage-sign` rutas firmadas de corta duración; la clave
secreta de Supabase nunca se entrega al cliente. Las subidas grandes usan TUS
directamente contra el host de Storage y no atraviesan una función de Vercel.

El panel admite:

- imágenes JPEG, PNG, WebP y AVIF;
- videos MP4 o WebM de hasta 50 MB;
- rutas o URLs públicas de `patagonik-media` que comiencen por `landing/`;
- alt en español/inglés/portugués y foco X/Y entre 0 y 1.

## 3. Variables de Vercel

Copiar las variables de `.env.example` en Project Settings → Environment
Variables. Aplicarlas a Production y Preview según corresponda:

| Variable | Ámbito | Uso |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | pública | Auth y Data API |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | clave con RLS |
| `PUBLIC_SUPABASE_STORAGE_BUCKET` | pública | nombre del bucket, normalmente `patagonik-media` |
| `SUPABASE_SECRET_KEY` | privada | build, validación de rol y healthcheck |
| `SUPABASE_STORAGE_BUCKET` | privada/opcional | sobreescribe el bucket por defecto |
| `VERCEL_DEPLOY_HOOK_URL` | privada | rebuild al publicar |
| `CRON_SECRET` | privada | autenticar cron/healthcheck |
| `TRANSLATION_PROVIDER` | privada | `opencode-zen`, `opencode-go` u `openai` |
| `TRANSLATION_API_KEY` | privada | key del proveedor usado para generar EN/PT |
| `TRANSLATION_MODEL` | privada/opcional | modelo de traducción; por defecto `gpt-5.6-luna` |
| `TRANSLATION_API_FORMAT` | privada/opcional | `responses` o `chat-completions`; normalmente se infiere por modelo |
| `OPENCODE_API_KEY` | privada/opcional | alias de `TRANSLATION_API_KEY` para OpenCode |
| `OPENAI_API_KEY` | privada/opcional | alias anterior, conservado para OpenAI |
| `OPENAI_TRANSLATION_MODEL` | privada/opcional | alias anterior de `TRANSLATION_MODEL` |
| `MEDIA_REMOTE_REQUIRED` | build | fallback o fallo estricto |
| `EXPERIENCES_REMOTE_REQUIRED` | build | fallback local o fallo estricto del catálogo |

Crear el Deploy Hook en Vercel → Settings → Git → Deploy Hooks y apuntarlo a
la rama de producción. No pegar secretos en issues, PR ni chat.

### Traducción con OpenCode

Una key de OpenCode no se puede enviar a `api.openai.com`. Para OpenCode Zen,
usar en Vercel:

```dotenv
TRANSLATION_PROVIDER=opencode-zen
TRANSLATION_API_KEY=REEMPLAZAR_CON_KEY_DE_OPENCODE
TRANSLATION_MODEL=gpt-5.6-luna
```

Para usar `mimo-v2.5-free`, cambiar el modelo y fijar
`TRANSLATION_API_FORMAT=chat-completions`. Los modelos gratuitos de OpenCode
pueden ser temporales y sus condiciones de retención/entrenamiento son
distintas; no enviar contenido confidencial. Para una suscripción Go usar
`TRANSLATION_PROVIDER=opencode-go`. Después de cambiar variables en Vercel hay
que volver a desplegar.

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
   publicar; el archivo original permanece en Supabase Storage.
6. Pulsar **Publicar cambios**. El sistema bloquea la publicación si una
   experiencia activa no tiene contenido completo o portada.

Archivar es reversible y sólo afecta la web al publicar. El slug se fija al
crear porque forma parte de las URLs indexables de los tres idiomas.
El panel está optimizado para celular: el orden se cambia con botones grandes,
el editor ocupa la pantalla completa y **Publicar cambios** permanece accesible
en la parte inferior.

## 5. Migrar los medios existentes

Con las variables privadas cargadas en un `.env` local (no versionado):

```bash
set -a
. ./.env
set +a
npm run media:migrate
```

El script lee los assets que aún estén marcados como `provider=cloudinary`,
descarga su `secure_url` existente, sube el original a Storage, genera las
variantes WebP de las imágenes y actualiza la misma fila `media_assets`. Las
asignaciones, encuadres y publicaciones se conservan. No elimina ninguna
fuente antigua. Revisar el resultado en `/admin` y pulsar **Publicar cambios**.

Los nuevos uploads del panel ya quedan directamente en Supabase Storage; este
script sólo sirve para la migración única de los registros históricos.

Después de comprobar Production se puede poner `MEDIA_REMOTE_REQUIRED=true` y
`EXPERIENCES_REMOTE_REQUIRED=true`, para que un build falle en vez de publicar
el respaldo local si no logra leer la versión editorial de Supabase.
No se borran automáticamente los fallbacks locales: son el mecanismo de
recuperación y no se descargan cuando un slot publicado tiene `storage_path`.
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
- El dump mensual guarda referencias y configuración, no los binarios nuevos:
  conservar también los originales de Storage en un destino privado si se
  necesita una copia independiente.

## Referencias operativas

- Supabase: https://supabase.com/docs/guides/deployment/going-into-prod
- Backups Free: https://supabase.com/docs/guides/platform/backups
- Backup/restore CLI: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Vercel Cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- GitHub workflows inactivos: https://docs.github.com/actions/managing-workflow-runs/disabling-and-enabling-a-workflow
- Supabase Storage uploads: https://supabase.com/docs/guides/storage/uploads/standard-uploads
- Supabase Storage resumable uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
