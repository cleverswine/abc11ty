renderNav('settings');

let contact = [];
let social = [];
let ogImageUrl = '';

const contactRows = document.getElementById('contact-rows');
const socialRows = document.getElementById('social-rows');
const ogImageInput = document.getElementById('og-image-input');
const ogImagePreview = document.getElementById('og-image-preview');

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

const CONTACT_TYPES = ['email', 'phone', 'address', 'other'];

function renderContactRows() {
  contactRows.innerHTML = contact
    .map(
      (row, i) => `
      <div class="repeatable-row" data-index="${i}">
        <select class="form-select" style="max-width: 140px;" data-field="type">
          ${CONTACT_TYPES.map((t) => `<option value="${t}" ${row.type === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input type="text" class="form-control" style="max-width: 160px;" placeholder="Label (optional)" data-field="label" value="${escapeHtml(row.label)}" />
        <input type="text" class="form-control" placeholder="Value" data-field="value" value="${escapeHtml(row.value)}" />
        <button type="button" class="btn btn-outline-danger remove-row-btn"><i class="bi bi-trash"></i></button>
      </div>
    `
    )
    .join('');
}

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'etsy', 'pinterest', 'tiktok', 'youtube', 'x', 'other'];

function renderSocialRows() {
  socialRows.innerHTML = social
    .map(
      (row, i) => `
      <div class="repeatable-row" data-index="${i}">
        <select class="form-select" style="max-width: 160px;" data-field="platform">
          ${SOCIAL_PLATFORMS.map((p) => `<option value="${p}" ${row.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
        <input type="url" class="form-control" placeholder="https://..." data-field="url" value="${escapeHtml(row.url)}" />
        <button type="button" class="btn btn-outline-danger remove-row-btn"><i class="bi bi-trash"></i></button>
      </div>
    `
    )
    .join('');
}

function bindRepeatable(container, list, render) {
  container.addEventListener('input', (e) => {
    const row = e.target.closest('.repeatable-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    const field = e.target.dataset.field;
    if (field) list[index][field] = e.target.value;
  });
  container.addEventListener('change', (e) => {
    const row = e.target.closest('.repeatable-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    const field = e.target.dataset.field;
    if (field) list[index][field] = e.target.value;
  });
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-row-btn');
    if (!btn) return;
    const row = btn.closest('.repeatable-row');
    list.splice(Number(row.dataset.index), 1);
    render();
  });
}

bindRepeatable(contactRows, contact, renderContactRows);
bindRepeatable(socialRows, social, renderSocialRows);

document.getElementById('add-contact-btn').addEventListener('click', () => {
  contact.push({ type: 'email', label: '', value: '' });
  renderContactRows();
});

document.getElementById('add-social-btn').addEventListener('click', () => {
  social.push({ platform: 'instagram', url: '' });
  renderSocialRows();
});

ogImageInput.addEventListener('change', async () => {
  const file = ogImageInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/settings/image', { method: 'POST', body: formData });
  const data = await res.json();
  ogImageUrl = data.url;
  ogImagePreview.src = ogImageUrl;
  ogImagePreview.classList.remove('d-none');
});

async function loadSettings() {
  const res = await fetch('/api/settings');
  const settings = await res.json();

  document.getElementById('site-title').value = settings.title || '';
  document.getElementById('site-description').value = settings.description || '';
  document.getElementById('seo-title').value = settings.seo?.metaTitle || '';
  document.getElementById('seo-description').value = settings.seo?.metaDescription || '';
  ogImageUrl = settings.seo?.ogImage || '';
  if (ogImageUrl) {
    ogImagePreview.src = ogImageUrl;
    ogImagePreview.classList.remove('d-none');
  }
  contact = settings.contact || [];
  social = settings.social || [];
  renderContactRows();
  renderSocialRows();
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById('site-title').value.trim(),
    description: document.getElementById('site-description').value.trim(),
    seo: {
      metaTitle: document.getElementById('seo-title').value.trim(),
      metaDescription: document.getElementById('seo-description').value.trim(),
      ogImage: ogImageUrl,
    },
    contact,
    social,
  };
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const status = document.getElementById('save-status');
  status.classList.remove('d-none');
  setTimeout(() => status.classList.add('d-none'), 2000);
});

loadSettings();
