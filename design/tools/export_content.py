#!/usr/bin/env python3
"""Volcar el contenido del bundle de Design a las content collections de Astro.

Lee design/src/template.html y saca tres cosas que hoy viven repartidas:

  - EXPERIENCE_DATA        -> detalle de cada experiencia, en español
  - EXPERIENCE_I18N.en/.pt -> el mismo detalle en inglés y portugués
  - claves tour.N.*        -> los textos de la tarjeta (el español está en el
                              DOM, como fallback; en/pt están en el dict I18N)

y las junta por experiencia en un JSON por archivo, para que editar una
experiencia sea abrir un archivo en vez de tocar tres bloques distintos.

Uso: python3 design/tools/export_content.py [--out src/content/experiences]
"""
from __future__ import annotations
import argparse, html, json, pathlib, re, sys

LOCALES = ('es', 'en', 'pt')

# EXPERIENCE_SLUGS del bundle viene corrido: desde la 3 y hasta la 5 el slug es
# el de la experiencia anterior, así que #experiencia/excursiones-especiales
# abre "Glaciar Grey en navegación" y navegacion-ruta-fotografica no
# corresponde a ninguna (resto de un catálogo anterior). En Astro el slug es la
# URL, así que se corrige aquí y queda anotado por qué.
SLUG_FIXES = {
    '3': 'glaciar-grey-navegacion',
    '4': 'excursiones-especiales',
    '5': 'avistamiento-de-fauna',
}
DETAIL_FIELDS = ('title', 'lead', 'body', 'facts', 'includes', 'excludes', 'modality', 'note')


def js_object(src: str, name: str) -> dict:
    """EXPERIENCE_DATA y EXPERIENCE_SLUGS son JSON válido; I18N no (comillas simples)."""
    m = re.search(r'const %s = (\{.*?\});\n' % re.escape(name), src, re.S)
    if not m:
        sys.exit(f'no encuentro {name}')
    return json.loads(m.group(1))


def experience_i18n(src: str) -> dict:
    m = re.search(r'const EXPERIENCE_I18N = \{(.*?)\n\};', src, re.S)
    if not m:
        sys.exit('no encuentro EXPERIENCE_I18N')
    out = {}
    for lang in ('en', 'pt'):
        block = re.search(r'\n  %s: \{\n(.*?)\n  \},' % lang, m.group(1) + '\n  },', re.S)
        if not block:
            sys.exit(f'no encuentro EXPERIENCE_I18N.{lang}')
        out[lang] = json.loads('{' + block.group(1).rstrip().rstrip(',') + '}')
    return out


def ui_dict(src: str, lang: str) -> dict:
    """Las secciones en/pt de I18N usan comillas simples: se leen clave a clave."""
    m = re.search(r"const I18N = \{(.*)\n\};\n\nconst WA_MSG", src, re.S)
    if not m:
        sys.exit('no encuentro I18N')
    block = re.search(r"\n  %s: \{\n(.*?)\n  \}" % lang, m.group(1), re.S)
    if not block:
        sys.exit(f'no encuentro I18N.{lang}')
    pairs = re.findall(r"'([^']+)'\s*:\s*'((?:[^'\\]|\\.)*)'", block.group(1))
    return {k: v.replace("\\'", "'").replace('\\\\', '\\') for k, v in pairs}


def mask_non_markup(src: str) -> str:
    """Sustituye por espacios el cuerpo de <style>/<script> y los comentarios.

    Sin esto, buscar 'data-t="clave">texto<' con una expresión regular entra
    dentro del CSS: una regla como

        #resenas div:has(> span[data-t="social.figure"]) { padding: 0 }

    hace que la clave social.figure se "traduzca" al propio bloque de CSS, y
    eso acaba impreso en la página. Las posiciones se conservan para que los
    índices sigan valiendo.
    """
    def blank(m):
        # <script type="text/html"> son las vistas de ruta: eso SÍ es marcado y
        # lleva dentro los textos en español de #esencia, #resenas y #faq.
        if 'text/html' in m.group(1):
            return m.group(0)
        return m.group(1) + ' ' * len(m.group(3)) + m.group(4)

    src = re.sub(r'(<(script|style)\b[^>]*>)([\s\S]*?)(</\2>)', blank, src)
    return re.sub(r'<!--[\s\S]*?-->', lambda m: ' ' * len(m.group(0)), src)


def spanish_ui(src: str) -> dict:
    """El español no está en I18N: es el textContent que el DOM trae de serie y
    que cacheSpanish() memoriza como fallback. Se recupera de ahí."""
    src = mask_non_markup(src)
    out: dict[str, str] = {}
    for m in re.finditer(r'data-t="([^"]+)"[^>]*>([^<]*)<', src):
        key, text = m.group(1), html.unescape(m.group(2)).strip()
        if text:
            out.setdefault(key, text)
    for m in re.finditer(r'data-t-attr="([^"]+)"[^>]*\s(aria-label|title)="([^"]*)"', src):
        for pair in m.group(1).split(','):
            attr, _, key = pair.partition(':')
            if attr.strip() == m.group(2):
                out.setdefault(key.strip(), html.unescape(m.group(3)).strip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--template', type=pathlib.Path, default=pathlib.Path('design/src/template.html'))
    ap.add_argument('--out', type=pathlib.Path, default=pathlib.Path('src/content/experiences'))
    ap.add_argument('--ui-out', type=pathlib.Path, default=pathlib.Path('src/i18n'))
    args = ap.parse_args()

    src = args.template.read_text(encoding='utf-8')
    data = js_object(src, 'EXPERIENCE_DATA')
    slugs = js_object(src, 'EXPERIENCE_SLUGS')
    overlay = experience_i18n(src)
    ui = {'en': ui_dict(src, 'en'), 'pt': ui_dict(src, 'pt')}
    es_ui = spanish_ui(src)

    args.out.mkdir(parents=True, exist_ok=True)
    for old in args.out.glob('*.json'):
        old.unlink()

    problems = []
    for key in sorted(data, key=int):
        base = data[key]
        content = {}
        for lang in LOCALES:
            detail = base if lang == 'es' else {**base, **overlay[lang].get(key, {})}
            if lang != 'es' and key not in overlay[lang]:
                problems.append(f'experiencia {key}: sin traducción {lang}')
            card = {}
            for suffix, field in (('t', 'cardTitle'), ('s', 'cardSummary'),
                                  ('d', 'cardDetail'), ('c', 'cardCategory')):
                dict_key = f'tour.{key}.{suffix}'
                value = es_ui.get(dict_key) if lang == 'es' else ui[lang].get(dict_key, es_ui.get(dict_key))
                if value:
                    card[field] = value
            content[lang] = {**card, **{f: detail[f] for f in DETAIL_FIELDS}}

        # La paridad de forma entre idiomas es lo que el schema de zod exige;
        # se comprueba aquí también para fallar en la exportación, no en el build.
        for lang in ('en', 'pt'):
            for field in ('facts', 'includes', 'excludes'):
                if len(content[lang][field]) != len(content['es'][field]):
                    problems.append(f'experiencia {key}.{lang}.{field}: '
                                    f'{len(content[lang][field])} vs es {len(content["es"][field])}')

        slug = SLUG_FIXES.get(key, slugs[key])
        payload = {'order': int(key), 'slug': slug, 'image': f'exp-{int(key):02d}', 'content': content}
        path = args.out / f'{int(key):02d}-{slug}.json'
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    args.ui_out.mkdir(parents=True, exist_ok=True)
    # Sólo las claves de UI: las de tarjeta (tour.N.*) ya viajan dentro de
    # cada experiencia, y repetirlas aquí sería una segunda fuente de verdad.
    def ui_only(d):
        return {k: v for k, v in sorted(d.items()) if not k.startswith('tour.')}

    (args.ui_out / 'ui.generated.json').write_text(
        json.dumps({'es': ui_only(es_ui), 'en': ui_only(ui['en']), 'pt': ui_only(ui['pt'])},
                   ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'experiencias escritas: {len(data)} -> {args.out}')
    print(f'claves UI: es={len(ui_only(es_ui))} en={len(ui_only(ui["en"]))} '
          f'pt={len(ui_only(ui["pt"]))} -> {args.ui_out}/ui.generated.json')
    for lang, table in (('es', es_ui), ('en', ui['en']), ('pt', ui['pt'])):
        for key, value in table.items():
            if re.search(r'!important|:has\(|\{\s*\w+\s*:', value):
                problems.append(f'{lang}.{key}: el texto parece CSS, no una traducción')

    if problems:
        print('\nPROBLEMAS:')
        for p in problems:
            print('  -', p)
        sys.exit(1)
    print('paridad de forma es/en/pt: OK')


if __name__ == '__main__':
    main()
