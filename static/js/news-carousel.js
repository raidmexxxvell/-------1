// News carousel using the same look-and-feel as ads carousel
// Features: auto-rotate every 3s, swipe, pause on hover, open modal with full text
(function () {
  const A11y = window.AccessibilityManagerInstance || null; // optional
  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }
  function ensureModal() {
    let modal = document.getElementById('news-modal-read');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'news-modal-read';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-backdrop" data-close="true"></div>
      <div class="modal-dialog" role="document" aria-labelledby="news-modal-title">
        <div class="modal-title" id="news-modal-title"></div>
        <div class="modal-desc" id="news-modal-date" style="margin-bottom:10px;"></div>
        <div class="modal-body" id="news-modal-body" style="max-height:55vh; overflow:auto; white-space:pre-wrap; line-height:1.45;"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" id="news-modal-close">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    // close handlers
    const close = () => {
      try {
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      } catch (_) {}
    };
    modal.querySelector('#news-modal-close').addEventListener('click', close);
    modal.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target?.dataset?.close) close();
    });
    document.addEventListener('keydown', e => {
      if (modal.style.display !== 'none' && e.key === 'Escape') close();
    });
    return modal;
  }
  function openModal({ title, dateText, content }) {
    const modal = ensureModal();
    modal.querySelector('#news-modal-title').textContent = title || '';
    modal.querySelector('#news-modal-date').textContent = dateText || '';
    modal.querySelector('#news-modal-body').textContent = content || '';
    modal.style.display = 'block';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
  }

  function toSlides(items) {
    return items.map(n => {
      const dt = n.created_at ? new Date(n.created_at) : null;
      const dateText = dt
        ? dt.toLocaleString(undefined, {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      const content = (n.content || '').trim();
      const preview = content.length > 160 ? content.slice(0, 160) + '…' : content;
      return {
        title: n.title || 'Без заголовка',
        dateText,
        content,
        preview,
      };
    });
  }

  async function fetchNews(limit) {
    // Try preload data if any
    if (window.__NEWS_PRELOADED_DATA__ && Array.isArray(window.__NEWS_PRELOADED_DATA__.news)) {
      return window.__NEWS_PRELOADED_DATA__.news.slice(0, limit || 5);
    }
    try {
      const r = await fetch('/api/news?limit=' + (limit || 5) + '&_=' + Date.now());
      const j = await r.json();
      return Array.isArray(j?.news) ? j.news : [];
    } catch {
      return [];
    }
  }

  function initCarousel() {
    const track = document.getElementById('news-track');
    const dots = document.getElementById('news-dots');
    const box = document.getElementById('news-carousel');
    if (!track || !dots || !box) return;

    fetchNews(8).then(items => {
      const slides = toSlides(items);
      // Fallback to list if no slides
      const list = document.getElementById('news-list');
      if (!slides.length) {
        if (list) {
          list.style.display = '';
          list.innerHTML = '<div class="news-empty">Пока нет новостей</div>';
        }
        try {
          window.dispatchEvent(new CustomEvent('main:news-ready'));
        } catch (_) {}
        try {
          document.dispatchEvent(new CustomEvent('main:news-ready'));
        } catch (_) {}
        return;
      }
      if (list) {
        list.style.display = 'none';
      }

      track.innerHTML = '';
      dots.innerHTML = '';
      slides.forEach((s, idx) => {
        const slide = document.createElement('div');
        slide.className = 'ads-slide';
        slide.innerHTML = `
          <div class="ads-img" style="padding:14px 16px 22px; background: transparent;">
            <div style="display:flex; flex-direction:column; gap:6px; width:100%; align-items:center; text-align:center;">
              <div class="news-slide-title">${escapeHtml(s.title)}</div>
              <div class="news-slide-text">${escapeHtml(s.preview)}</div>
            </div>
          </div>`;
        slide.style.cursor = 'pointer';
        slide.addEventListener('click', () => openModal(s));
        track.appendChild(slide);
        const dot = document.createElement('div');
        dot.className = 'ads-dot' + (idx === 0 ? ' active' : '');
        dots.appendChild(dot);
      });

      let index = 0;
      let timer = null;
      let hovering = false;
      const apply = () => {
        const w = box.clientWidth;
        track.scrollTo({ left: index * w, behavior: 'smooth' });
        Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === index));
      };
      const arm = () => {
        if (slides.length <= 1) return;
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
          if (!hovering) {
            index = (index + 1) % slides.length;
            apply();
          }
        }, 7000);
      };
      arm();

      // Pause on hover (desktop)
      box.addEventListener('mouseenter', () => {
        hovering = true;
      });
      box.addEventListener('mouseleave', () => {
        hovering = false;
      });

      // Swipe support
      let startX = 0,
        scx = 0,
        dragging = false;
      track.addEventListener(
        'touchstart',
        e => {
          if (!e.touches[0]) return;
          startX = e.touches[0].clientX;
          scx = track.scrollLeft;
          dragging = true;
          if (timer) clearInterval(timer);
        },
        { passive: true }
      );
      track.addEventListener(
        'touchmove',
        e => {
          if (!dragging || !e.touches[0]) return;
          const dx = startX - e.touches[0].clientX;
          track.scrollLeft = scx + dx;
        },
        { passive: true }
      );
      track.addEventListener(
        'touchend',
        () => {
          if (!dragging) return;
          dragging = false;
          const w = box.clientWidth;
          const cur = Math.round(track.scrollLeft / Math.max(1, w));
          index = Math.max(0, Math.min(slides.length - 1, cur));
          apply();
          arm();
        },
        { passive: true }
      );

      window.addEventListener('resize', apply);
      apply();
      try {
        window.dispatchEvent(new CustomEvent('main:news-ready'));
      } catch (_) {}
      try {
        document.dispatchEvent(new CustomEvent('main:news-ready'));
      } catch (_) {}
    });
  }

  // Defer until DOM ready
  window.addEventListener('DOMContentLoaded', initCarousel);
})();
