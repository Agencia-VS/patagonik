const root = document.querySelector('[data-google-reviews]');
const grid = root?.querySelector('[data-google-review-grid]');
const ratingSummary = root?.querySelector('[data-google-rating]');
const note = root?.querySelector('[data-t="reviews.googleNote"]');

if (root && grid) {
  const safeHttpsUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const addText = (parent, tag, text, styles = {}) => {
    const node = document.createElement(tag);
    node.textContent = text;
    Object.assign(node.style, styles);
    parent.appendChild(node);
    return node;
  };

  const renderReview = (review) => {
    const card = document.createElement('article');
    Object.assign(card.style, {
      minHeight: '180px', padding: '22px', background: '#FFFDF9',
      border: '1px solid rgba(43,43,43,.08)', display: 'flex',
      flexDirection: 'column', justifyContent: 'space-between',
    });

    const authorPhotoUrl = safeHttpsUrl(review.authorPhotoUrl);
    const top = document.createElement('div');
    Object.assign(top.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' });
    const avatar = addText(top, 'span', authorPhotoUrl ? '' : (review.author || 'G').trim().slice(0, 1).toUpperCase(), {
      width: '34px', height: '34px', borderRadius: '999px', background: 'rgba(107,122,94,.12)',
      color: '#6B7A5E', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: '600', flex: '0 0 34px',
    });
    avatar.setAttribute('aria-hidden', 'true');
    if (authorPhotoUrl) {
      const image = document.createElement('img');
      image.src = authorPhotoUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      Object.assign(image.style, { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' });
      avatar.appendChild(image);
    }

    const authorWrap = document.createElement('div');
    authorWrap.style.flex = '1';
    const authorUrl = safeHttpsUrl(review.authorUrl);
    const author = addText(authorWrap, authorUrl ? 'a' : 'strong', review.author, {
      color: '#2B2B2B', fontSize: '12px', fontWeight: '600', textDecoration: 'none',
    });
    if (authorUrl) {
      author.href = authorUrl;
      author.target = '_blank';
      author.rel = 'noopener noreferrer';
    }
    addText(authorWrap, 'span', review.published || 'Google', {
      display: 'block', marginTop: '4px', color: 'rgba(43,43,43,.48)', fontSize: '10px',
    });
    top.appendChild(authorWrap);
    card.appendChild(top);

    const stars = addText(card, 'div', '★'.repeat(Math.max(0, Math.min(5, Math.round(review.rating)))), {
      letterSpacing: '.12em', fontSize: '13px', color: '#6B7A5E', marginBottom: '12px',
    });
    stars.setAttribute('aria-label', `${review.rating} de 5 estrellas`);
    addText(card, 'p', review.text, {
      margin: '0', color: '#2B2B2B', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-line',
    });
    const reviewUrl = safeHttpsUrl(review.reviewUrl);
    if (reviewUrl) {
      const source = addText(card, 'a', 'Ver reseña en Google Maps', {
        display: 'inline-block', marginTop: '14px', color: '#5E5E5E', fontSize: '12px',
      });
      source.href = reviewUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.setAttribute('translate', 'no');
    }
    return card;
  };

  const showMessage = (message) => {
    grid.replaceChildren();
    addText(grid, 'p', message, { margin: '0', color: 'rgba(43,43,43,.58)', fontSize: '13px' });
    if (ratingSummary) ratingSummary.textContent = '★ — / 5';
  };

  const language = (document.documentElement.lang || 'es').slice(0, 2).toLowerCase();
  fetch(`/api/google-reviews?lang=${encodeURIComponent(language)}`)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las reseñas.');
      return data;
    })
    .then((data) => {
      if (ratingSummary && data.rating != null) {
        const count = Number.isFinite(data.userRatingCount) ? ` · ${data.userRatingCount}` : '';
        ratingSummary.textContent = `★ ${Number(data.rating).toFixed(1)} / 5${count}`;
      }

      if (!Array.isArray(data.reviews) || data.reviews.length === 0) {
        showMessage('Todavía no hay reseñas de Google disponibles para mostrar.');
      } else {
        grid.replaceChildren(...data.reviews.slice(0, 5).map(renderReview));
      }

      if (note) {
        const notices = {
          es: 'Opiniones ordenadas por relevancia según Google. Google revisa y elimina contenido falso que identifica; las reseñas no se verifican individualmente.',
          en: 'Reviews are ordered by Google relevance. Google reviews and removes fake content it identifies; reviews are not individually verified.',
          pt: 'Avaliações ordenadas por relevância segundo o Google. O Google analisa e remove conteúdo falso que identifica; as avaliações não são verificadas individualmente.',
        };
        note.textContent = notices[language] || notices.es;
        const mapsUrl = safeHttpsUrl(data.googleMapsUrl);
        if (mapsUrl) {
          const link = document.createElement('a');
          link.href = mapsUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Google Maps';
          link.setAttribute('translate', 'no');
          Object.assign(link.style, { color: '#6B7A5E', marginLeft: '6px' });
          note.appendChild(link);
        }
      }
    })
    .catch((error) => {
      console.error('[google-reviews]', error);
      showMessage('Las reseñas de Google no están disponibles en este momento.');
      if (note) note.textContent = 'Consulta las opiniones directamente en Google Maps.';
    });
}
