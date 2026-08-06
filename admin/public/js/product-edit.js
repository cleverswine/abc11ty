renderNav('products');

const params = new URLSearchParams(location.search);
const existingId = params.get('id');
const productId = existingId || crypto.randomUUID();
const isNew = !existingId;

const quill = new Quill('#description-editor', {
  theme: 'snow',
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ header: [2, 3, false] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'clean'],
    ],
  },
});

let images = [];
let categories = [];
let allCategories = [];

const imageGrid = document.getElementById('image-grid');
const imageInput = document.getElementById('image-input');
const categoryChips = document.getElementById('category-chips');
const categoryInput = document.getElementById('category-input');
const categoryOptions = document.getElementById('category-options');
const deleteBtn = document.getElementById('delete-btn');

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

let mainImageId = null;

function renderImages() {
  imageGrid.innerHTML = images
    .map(
      (img) => `
      <div class="image-tile${img.id === mainImageId ? ' is-main' : ''}" data-id="${img.id}">
        <img src="${img.url}" alt="">
        ${img.id === mainImageId ? '<span class="badge text-bg-primary main-badge">Main</span>' : ''}
        <div class="image-actions">
          <button type="button" class="btn btn-sm btn-light set-main-btn" title="Set as main image"><i class="bi bi-star${img.id === mainImageId ? '-fill' : ''}"></i></button>
          <button type="button" class="btn btn-sm btn-light text-danger remove-image-btn" title="Remove image"><i class="bi bi-x-lg"></i></button>
        </div>
      </div>
    `
    )
    .join('');
}

function renderCategoryChips() {
  categoryChips.innerHTML = categories
    .map(
      (c) => `
      <span class="badge text-bg-light border category-chip" data-name="${escapeHtml(c)}">
        ${escapeHtml(c)}
        <button type="button" class="btn-close btn-close-sm remove-category-btn" aria-label="Remove"></button>
      </span>
    `
    )
    .join('');
}

function renderCategoryOptions() {
  categoryOptions.innerHTML = allCategories.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
}

imageGrid.addEventListener('click', async (e) => {
  const tile = e.target.closest('.image-tile');
  if (!tile) return;
  const id = tile.dataset.id;

  if (e.target.closest('.set-main-btn')) {
    mainImageId = id;
    renderImages();
  }

  if (e.target.closest('.remove-image-btn')) {
    await fetch(`/api/products/${productId}/images/${id}`, { method: 'DELETE' });
    images = images.filter((img) => img.id !== id);
    if (mainImageId === id) mainImageId = images[0]?.id || null;
    renderImages();
  }
});

imageInput.addEventListener('change', async () => {
  const files = [...imageInput.files];
  for (const file of files) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`/api/products/${productId}/images`, { method: 'POST', body: formData });
    const image = await res.json();
    images.push(image);
    if (!mainImageId) mainImageId = image.id;
  }
  imageInput.value = '';
  renderImages();
});

categoryChips.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove-category-btn');
  if (!btn) return;
  const name = btn.closest('.category-chip').dataset.name;
  categories = categories.filter((c) => c !== name);
  renderCategoryChips();
});

async function addCategory(name) {
  name = name.trim();
  if (!name || categories.includes(name)) return;
  categories.push(name);
  renderCategoryChips();
  if (!allCategories.includes(name)) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    allCategories = await res.json();
    renderCategoryOptions();
  }
}

document.getElementById('add-category-btn').addEventListener('click', () => {
  addCategory(categoryInput.value);
  categoryInput.value = '';
});

categoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCategory(categoryInput.value);
    categoryInput.value = '';
  }
});

async function loadCategories() {
  const res = await fetch('/api/categories');
  allCategories = await res.json();
  renderCategoryOptions();
}

async function loadProduct() {
  if (isNew) return;
  const res = await fetch(`/api/products/${productId}`);
  if (!res.ok) return;
  const product = await res.json();

  document.getElementById('page-title').textContent = 'Edit Product';
  document.getElementById('title').value = product.title || '';
  quill.root.innerHTML = product.description || '';
  images = product.images || [];
  mainImageId = product.mainImageId || images[0]?.id || null;
  renderImages();
  categories = product.categories || [];
  renderCategoryChips();
  document.getElementById('featured').checked = !!product.featured;
  document.getElementById('link-label').value = product.externalLink?.label || '';
  document.getElementById('link-url').value = product.externalLink?.url || '';
  deleteBtn.classList.remove('d-none');
}

deleteBtn.addEventListener('click', async () => {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await fetch(`/api/products/${productId}`, { method: 'DELETE' });
  location.href = '/index.html';
});

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('title').value.trim(),
    description: quill.root.innerHTML,
    images,
    mainImageId,
    featured: document.getElementById('featured').checked,
    categories,
    externalLink: {
      label: document.getElementById('link-label').value.trim(),
      url: document.getElementById('link-url').value.trim(),
    },
  };
  await fetch(`/api/products/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  location.href = '/index.html';
});

loadCategories();
loadProduct();
