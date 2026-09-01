renderNav('products');

const listEl = document.getElementById('product-list');
const emptyEl = document.getElementById('empty-state');

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function productThumbUrl(product) {
  const main = product.images.find((i) => i.id === product.mainImageId) || product.images[0];
  return main ? main.url : null;
}

function renderProducts(products) {
  if (products.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('d-none');
    return;
  }
  emptyEl.classList.add('d-none');

  listEl.innerHTML = products
    .map((p) => {
      const thumb = productThumbUrl(p);
      const categories = (p.categories || [])
        .map((c) => `<span class="badge text-bg-light border me-1">${escapeHtml(c)}</span>`)
        .join('');
      return `
        <div class="list-group-item product-card d-flex align-items-center gap-3" data-id="${p.id}">
          <i class="bi bi-grip-vertical drag-handle fs-4"></i>
          ${thumb
            ? `<img src="${thumb}" class="product-thumb" alt="">`
            : `<div class="product-thumb d-flex align-items-center justify-content-center text-muted"><i class="bi bi-image"></i></div>`}
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2">
              <a href="/product.html?id=${p.id}" class="fw-semibold text-decoration-none">${escapeHtml(p.title) || '(untitled)'}</a>
              ${p.featured ? '<span class="badge text-bg-warning">Featured</span>' : ''}
            </div>
            <div class="mt-1">${categories}</div>
          </div>
          <a href="/product.html?id=${p.id}" class="btn btn-sm btn-outline-secondary">Edit</a>
          <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${p.id}" data-title="${escapeHtml(p.title)}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
    })
    .join('');
}

async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  renderProducts(products);
  return products;
}

listEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete');
  if (!btn) return;
  const { id, title } = btn.dataset;
  if (!confirm(`Delete "${title || 'this product'}"? This cannot be undone.`)) return;
  await fetch(`/api/products/${id}`, { method: 'DELETE' });
  loadProducts();
});

new Sortable(listEl, {
  handle: '.drag-handle',
  animation: 150,
  onEnd: async () => {
    const order = [...listEl.querySelectorAll('.product-card')].map((el) => el.dataset.id);
    await fetch('/api/products/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  },
});

loadProducts();
