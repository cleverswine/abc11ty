let boo = [];

const sectionsEl = document.getElementById('sections');
const saveStage = document.getElementById('save-stage');
const statusEl = document.getElementById('save-status');

// The header's "edits saved" step. state is ok / busy / error (the dot color).
function setSaveStatus(state, text) {
    saveStage.dataset.state = state;
    statusEl.textContent = text;
}

function formatClock(date) {
    return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// Mirrors isEtsyItem() in web/lib/boo.js - an Etsy-sourced item is
// read-only here, re-scraped and re-appended by gen.js on every run.
function isLocked(item) {
    return item.source === 'Etsy';
}

function showError(err) {
    console.error(err);
    setSaveStatus('error', "Couldn't save. Try again.");
}

// Only changes (not GETs) touch the header's save status - loading the page
// shouldn't claim anything was just saved. A FormData body (a photo upload)
// is sent as-is, anything else as JSON. Errors are shown in the header and
// rethrown, so callers only need to catch them to stop what they're doing.
async function api(method, url, body, busyText = 'Saving...') {
    let saving = method !== 'GET';
    if (saving) setSaveStatus('busy', busyText);
    try {
        let json = body && !(body instanceof FormData);
        let res = await fetch(url, {
            method,
            headers: json ? {'Content-Type': 'application/json'} : undefined,
            body: json ? JSON.stringify(body) : body,
        });
        if (!res.ok) {
            let err = await res.json().catch(() => ({error: res.statusText}));
            throw new Error(err.error || 'request failed');
        }
        if (saving) setSaveStatus('ok', 'Saved ' + formatClock(new Date()));
        return res.status === 204 ? null : res.json();
    } catch (e) {
        showError(e);
        throw e;
    }
}

// Makes a change, then reloads and redraws the page from the server.
async function change(method, url, body) {
    await api(method, url, body);
    await loadAll();
}

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// API paths, e.g. apiUrl('live-events', 'events', 'order') ->
// /api/sections/live-events/events/order (each part URL-encoded)
function apiUrl(sectionId, ...parts) {
    return ['/api/sections', ...[sectionId, ...parts].map(encodeURIComponent)].join('/');
}

// The items list of a section, or of one of its groups (subcategories)
function itemsUrl(sectionId, groupName) {
    return groupName ? apiUrl(sectionId, 'subcategories', groupName, 'items') : apiUrl(sectionId, 'items');
}

// ---- image thumbnail strip (rendered directly on the page, per manual item) ----
// Every action here (reorder, remove, upload) saves immediately via the API,
// the same way item/subcategory reordering elsewhere on the page already does.

function imageStripHtml(images) {
    let thumbs = images.map((src, i) => `
        <span class="thumb-chip" data-path="${esc(src)}">
            <img src="/${esc(src)}" alt="" loading="lazy">
            ${i === 0 ? '<span class="thumb-main" title="Shown on the product\'s card on the site">Main photo</span>' : ''}
            <span class="thumb-controls">
                <button type="button" class="btn-arrow" data-action="move-image-left" title="Move left" ${i === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
                <button type="button" class="btn-icon btn-icon-danger" data-action="remove-image" title="Remove photo"><i class="bi bi-trash"></i></button>
                <button type="button" class="btn-arrow" data-action="move-image-right" title="Move right" ${i === images.length - 1 ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
            </span>
        </span>`).join('');
    return `
        <div class="thumb-strip">
            ${thumbs}
            <label class="thumb-upload-label" title="Add a photo">
                <i class="bi bi-plus-lg"></i><span>Add photo</span>
                <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" data-upload-image-input>
            </label>
        </div>`;
}

// ---- page rendering (read-only representation + reorder/edit/delete controls) ----

function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
}

function countPhrase(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
}

// Show/hide switch, used on every section, group, event and product. The
// label is the current state ("On site" / "Hidden"); clicking flips it.
function showToggleHtml(show) {
    let shown = show !== false;
    return `<button type="button" class="show-switch" role="switch" aria-checked="${shown}" data-action="toggle-show"
            title="${shown ? 'Shown on the site. Click to hide it.' : 'Hidden from the site. Click to show it.'}">
            <span class="switch-track" aria-hidden="true"></span><span class="switch-label">${shown ? 'On site' : 'Hidden'}</span>
        </button>`;
}

// Controls act on whatever section, group, event or product they sit in -
// see pageContext() and `actions` below.
function editDeleteHtml() {
    return `
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit"><i class="bi bi-pencil"></i> Edit</button>
        <button type="button" class="btn btn-sm btn-quiet-danger" data-action="delete"><i class="bi bi-trash"></i> Delete</button>`;
}

function reorderHtml(canMoveUp, canMoveDown) {
    return `
        <div class="reorder-stack">
            <button type="button" class="btn-icon" data-action="move-up" title="Move up" ${canMoveUp ? '' : 'disabled'}><i class="bi bi-chevron-up"></i></button>
            <button type="button" class="btn-icon" data-action="move-down" title="Move down" ${canMoveDown ? '' : 'disabled'}><i class="bi bi-chevron-down"></i></button>
        </div>`;
}

// Etsy-sourced products can't be changed here (gen.js re-copies them from
// Etsy), so they're a compact read-only row with a link to the listing.
function readonlyItemHtml(item) {
    let img = item.images && item.images[0];
    let hidden = item.show === false;
    return `
        <div class="item-row etsy-readonly ${hidden ? 'is-hidden' : ''}">
            ${img ? `<img src="/${esc(img)}" alt="" loading="lazy">` : '<span class="readonly-noimg"></span>'}
            <div class="item-main">
                <div class="item-title">${esc(item.title)}</div>
                <div class="item-desc">${esc(truncate(item.description, 110))}</div>
            </div>
            <div class="readonly-meta">
                ${hidden ? '<span class="hidden-tag">Hidden</span>' : ''}
                <a href="${esc(item.etsyPage)}" target="_blank" rel="noopener">View on Etsy <i class="bi bi-box-arrow-up-right"></i></a>
            </div>
        </div>`;
}

function manualItemCardHtml(item, canMoveUp, canMoveDown) {
    return `
        <div class="item-row ${item.show === false ? 'is-hidden' : ''}" data-item-card="${esc(item.id)}">
            ${reorderHtml(canMoveUp, canMoveDown)}
            <div class="item-main">
                <div class="item-head">
                    <div class="item-text">
                        <div class="item-title">${esc(item.title)}</div>
                        ${item.description ? `<div class="item-desc">${esc(truncate(item.description, 160))}</div>` : ''}
                        ${item.etsyPage ? `<a href="${esc(item.etsyPage)}" target="_blank" rel="noopener" class="item-link">Link <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    </div>
                    <div class="item-actions">
                        ${showToggleHtml(item.show)}
                        ${editDeleteHtml()}
                    </div>
                </div>
                ${imageStripHtml(item.images || [])}
            </div>
        </div>`;
}

function itemsListHtml(items) {
    let freeItems = items.filter(i => !isLocked(i));
    return items.map(item => {
        if (isLocked(item)) return readonlyItemHtml(item);
        let idx = freeItems.indexOf(item);
        return manualItemCardHtml(item, idx > 0, idx < freeItems.length - 1);
    }).join('');
}

function addItemButtonHtml() {
    return `<button type="button" class="btn btn-sm btn-add" data-action="add-item"><i class="bi bi-plus-lg"></i> Add product</button>`;
}

function itemsSummary(items) {
    let hidden = items.filter(i => i.show === false).length;
    return countPhrase(items.length, 'product', 'products') + (hidden ? `, ${hidden} hidden` : '');
}

// Which <details> are open survives the full re-render after every change.
// Unless toggled by hand this session, sections start open, and groups start
// open only if they have something editable - a group made only of Etsy
// products starts closed.
const openState = new Map();

function isOpen(key, defaultOpen) {
    return openState.has(key) ? openState.get(key) : defaultOpen;
}

sectionsEl.addEventListener('toggle', e => {
    if (e.target.dataset.openKey) openState.set(e.target.dataset.openKey, e.target.open);
}, true);

function subcategoryHtml(section, group, groupIdx, totalGroups) {
    let items = group.items || [];
    let key = `g:${section.sectionId}/${group.name}`;
    let defaultOpen = items.length === 0 || items.some(i => !isLocked(i));
    return `
        <details class="subcategory-block ${group.show === false ? 'is-hidden' : ''}" data-subcategory="${esc(group.name)}" data-open-key="${esc(key)}" ${isOpen(key, defaultOpen) ? 'open' : ''}>
            <summary>
                ${reorderHtml(groupIdx > 0, groupIdx < totalGroups - 1)}
                <span class="block-title">${esc(group.name)}</span>
                <span class="block-count">${itemsSummary(items)}</span>
                <span class="block-actions">
                    ${showToggleHtml(group.show)}
                    ${editDeleteHtml()}
                </span>
            </summary>
            <div class="block-items">${itemsListHtml(items)}</div>
            ${addItemButtonHtml()}
        </details>`;
}

// ---- events (e.g. live-events' in-person event list) ----

function eventHtml(event, canMoveUp, canMoveDown) {
    let meta = [event.date, event.location].filter(Boolean).map(esc).join(', ');
    return `
        <div class="item-row ${event.show === false ? 'is-hidden' : ''}" data-event-row="${esc(event.id)}">
            ${reorderHtml(canMoveUp, canMoveDown)}
            <div class="item-main">
                <div class="item-head">
                    <div class="item-text">
                        <div class="item-title">${esc(event.name)}</div>
                        ${meta ? `<div class="item-desc">${meta}</div>` : ''}
                        ${event.link ? `<a href="${esc(event.link)}" target="_blank" rel="noopener" class="item-link">Link <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    </div>
                    <div class="item-actions">
                        ${showToggleHtml(event.show)}
                        ${editDeleteHtml()}
                    </div>
                </div>
            </div>
        </div>`;
}

function eventsListHtml(events) {
    return events.map((event, idx) => eventHtml(event, idx > 0, idx < events.length - 1)).join('');
}

function addEventButtonHtml() {
    return `<button type="button" class="btn btn-sm btn-add" data-action="add-event"><i class="bi bi-plus-lg"></i> Add event</button>`;
}

function allItems(section) {
    return [...(section.items || []), ...(section.subcategories || []).flatMap(g => g.items || [])];
}

function sectionSummary(section) {
    let parts = [];
    if (Array.isArray(section.events)) parts.push(countPhrase(section.events.length, 'event', 'events'));
    let groups = (section.subcategories || []).length;
    if (groups) parts.push(countPhrase(groups, 'group', 'groups'));
    parts.push(countPhrase(allItems(section).length, 'product', 'products'));
    return parts.join(', ');
}

function sectionHtml(section) {
    let hasSubcategories = (section.subcategories || []).length > 0;
    let hasEtsyItems = allItems(section).some(isLocked);
    let key = `s:${section.sectionId}`;
    let looseItems = section.items || [];
    return `
        <details class="card section-card ${section.show === false ? 'is-hidden' : ''}" data-section="${esc(section.sectionId)}" data-open-key="${esc(key)}" ${isOpen(key, true) ? 'open' : ''}>
            <summary class="card-header">
                <span class="section-title">${esc(section.sectionTitle)}</span>
                <span class="block-count">${sectionSummary(section)}</span>
                <span class="block-actions">
                    ${showToggleHtml(section.show)}
                    ${editDeleteHtml()}
                </span>
            </summary>
            <div class="card-body">
                ${section.sectionDescription ? `<p class="section-desc">${esc(section.sectionDescription)}</p>` : ''}
                ${hasEtsyItems ? `<p class="etsy-note"><i class="bi bi-info-circle"></i> Products from the Etsy shop are copied from Etsy, so they can't be edited here. To change one, edit it on Etsy.</p>` : ''}

                ${Array.isArray(section.events) ? `
                <h3 class="part-heading">Events</h3>
                <div class="events-block">${eventsListHtml(section.events)}</div>
                ${addEventButtonHtml()}
                ` : ''}

                <h3 class="part-heading">Groups</h3>
                ${(section.subcategories || []).map((g, i, arr) => subcategoryHtml(section, g, i, arr.length)).join('')}
                <button type="button" class="btn btn-sm btn-add" data-action="add-group"><i class="bi bi-plus-lg"></i> Add group</button>

                <h3 class="part-heading">${hasSubcategories ? 'Products not in a group' : 'Products'}</h3>
                ${looseItems.length ? '' : '<p class="empty-note">None yet.</p>'}
                ${itemsListHtml(looseItems)}
                ${addItemButtonHtml()}
            </div>
        </details>`;
}

function render() {
    sectionsEl.innerHTML = boo.map(sectionHtml).join('');
}

async function loadAll() {
    boo = await api('GET', '/api/boo');
    render();
}

// ---- actions on the page ----

// What a control on the page acts on: the innermost section, group, event or
// product around it (as `target`: its kind, its object in `boo`, and its API
// path), plus the section and group it's in.
function pageContext(el) {
    let sectionEl = el.closest('[data-section]');
    let groupEl = el.closest('[data-subcategory]');
    let eventEl = el.closest('[data-event-row]');
    let itemEl = el.closest('[data-item-card]');
    let section = boo.find(s => s.sectionId === sectionEl.dataset.section);
    let group = groupEl && section.subcategories.find(g => g.name === groupEl.dataset.subcategory);
    let id = section.sectionId;
    let target;
    if (itemEl) {
        let item = (group || section).items.find(i => i.id === itemEl.dataset.itemCard);
        target = {kind: 'item', obj: item, url: itemsUrl(id, group?.name) + '/' + encodeURIComponent(item.id)};
    } else if (eventEl) {
        let event = section.events.find(ev => ev.id === eventEl.dataset.eventRow);
        target = {kind: 'event', obj: event, url: apiUrl(id, 'events', event.id)};
    } else if (group) {
        target = {kind: 'group', obj: group, url: apiUrl(id, 'subcategories', group.name)};
    } else {
        target = {kind: 'section', obj: section, url: apiUrl(id)};
    }
    return {section, group, target};
}

// `list` with the entry at index `i` swapped with its neighbour `delta`
// places away, or null if there's no neighbour that way.
function swapped(list, i, delta) {
    let j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return null;
    let copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
}

// Moves a product, event or group one place up (-1) or down (+1) among its
// siblings. Only hand-added products move; Etsy ones keep gen.js's order.
async function moveTarget({section, group, target}, delta) {
    let id = section.sectionId, keys, key, url;
    if (target.kind === 'item') {
        keys = (group || section).items.filter(i => !isLocked(i)).map(i => i.id);
        key = target.obj.id;
        url = itemsUrl(id, group?.name) + '/order';
    } else if (target.kind === 'event') {
        keys = section.events.map(ev => ev.id);
        key = target.obj.id;
        url = apiUrl(id, 'events', 'order');
    } else {
        keys = section.subcategories.map(g => g.name);
        key = target.obj.name;
        url = apiUrl(id, 'subcategories', 'order');
    }
    let order = swapped(keys, keys.indexOf(key), delta);
    if (order) await change('PUT', url, {order});
}

async function moveImage({target}, btn, delta) {
    let images = target.obj.images || [];
    images = swapped(images, images.indexOf(btn.closest('.thumb-chip').dataset.path), delta);
    if (images) await change('PATCH', target.url, {images});
}

function deleteMessage({kind, obj}) {
    if (kind === 'section') {
        let groups = (obj.subcategories || []).length;
        let groupsPhrase = groups ? ` and ${countPhrase(groups, 'group', 'groups')}` : '';
        return `Delete the section "${obj.sectionTitle}"?\n\n` +
            `This removes the section along with ${countPhrase(allItems(obj).length, 'product', 'products')}${groupsPhrase} inside it. This can't be undone.`;
    }
    if (kind === 'group') {
        return `Delete the group "${obj.name}"?\n\n` +
            `This removes the group along with ${countPhrase((obj.items || []).length, 'product', 'products')} inside it. This can't be undone.`;
    }
    return `Delete ${kind === 'event' ? `the event "${obj.name}"` : `"${obj.title}"`}?\n\nThis can't be undone.`;
}

const actions = {
    'toggle-show': ({target}) => change('PATCH', target.url, {show: target.obj.show === false}),
    'delete': ({target}) => confirm(deleteMessage(target)) && change('DELETE', target.url),
    'move-up': ctx => moveTarget(ctx, -1),
    'move-down': ctx => moveTarget(ctx, 1),
    'edit': ({section, group, target}) => {
        if (target.kind === 'section') openSectionModal(section);
        else if (target.kind === 'group') openSubcategoryModal(section.sectionId, group);
        else if (target.kind === 'event') openEventModal(section.sectionId, target.obj);
        else openItemModal(section.sectionId, group?.name ?? null, target.obj);
    },
    'add-item': ({section, group}) => openItemModal(section.sectionId, group?.name ?? null, null),
    'add-group': ({section}) => openSubcategoryModal(section.sectionId, null),
    'add-event': ({section}) => openEventModal(section.sectionId, null),
    'move-image-left': (ctx, btn) => moveImage(ctx, btn, -1),
    'move-image-right': (ctx, btn) => moveImage(ctx, btn, 1),
    'remove-image': ({target}, btn) => {
        let message = `Remove this photo from "${target.obj.title}"?\n\n` +
            `It will no longer show on the site. You'd need to upload it again if you change your mind.`;
        if (!confirm(message)) return;
        let path = btn.closest('.thumb-chip').dataset.path;
        return change('PATCH', target.url, {images: (target.obj.images || []).filter(p => p !== path)});
    },
};

sectionsEl.addEventListener('click', async (e) => {
    let btn = e.target.closest('[data-action]');
    if (!btn) return;
    // controls inside a <summary> shouldn't also open/close its <details>
    if (btn.closest('summary')) e.preventDefault();
    try {
        await actions[btn.dataset.action]?.(pageContext(btn), btn);
    } catch {
        // api() has already shown the error
    }
});

sectionsEl.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-upload-image-input]')) return;
    let file = e.target.files[0];
    if (!file) return;
    let {target} = pageContext(e.target);
    let form = new FormData();
    form.append('image', file);
    try {
        let {path} = await api('POST', '/api/images', form, 'Uploading photo...');
        await change('PATCH', target.url, {images: [...(target.obj.images || []), path]});
    } catch {
        setSaveStatus('error', "Couldn't upload the photo. Try again.");
    }
});

// ---- add/edit modals ----

// Any dialog's Cancel button
document.addEventListener('click', e => {
    e.target.closest('[data-close-modal]')?.closest('dialog').close();
});

// Sets each named field of `form` from `values` (checkboxes from booleans).
function fillForm(form, values) {
    for (let [name, value] of Object.entries(values)) {
        let field = form.elements.namedItem(name);
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value ?? '';
    }
}

// Submitting an add/edit dialog: `request()` returns the {method, url, body}
// to send, or null to stay open (e.g. a required field is blank). The dialog
// closes and the page reloads once it's saved; if saving fails it stays open
// (api() has already shown the error).
function onSubmit(dialog, request) {
    dialog.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        let req = request();
        if (!req) return;
        try {
            await api(req.method, req.url, req.body);
        } catch {
            return;
        }
        dialog.close();
        await loadAll();
    });
}

// ---- section modal ----

const sectionModal = document.getElementById('section-modal');
const sectionFields = document.getElementById('section-modal-form').elements;
let sectionModalContext = null;
// Tracks whether the person has hand-edited the (hidden-by-default) page
// link name, so typing a title doesn't clobber a deliberate manual edit.
let sectionIdTouched = false;

function openSectionModal(section) {
    sectionModalContext = section ? {mode: 'edit', sectionId: section.sectionId} : {mode: 'add'};
    sectionIdTouched = false;
    sectionModal.querySelector('[data-modal-title]').textContent = section ? 'Edit section' : 'Add section';
    fillForm(sectionModal.querySelector('form'), {
        sectionTitle: section?.sectionTitle,
        sectionId: section?.sectionId,
        sectionDescription: section?.sectionDescription,
        show: section ? section.show !== false : true,
    });
    sectionModal.showModal();
}

document.getElementById('add-section-btn').addEventListener('click', () => openSectionModal(null));

sectionFields.sectionId.addEventListener('input', () => {
    sectionIdTouched = true;
});

sectionFields.sectionTitle.addEventListener('input', () => {
    if (sectionModalContext?.mode === 'add' && !sectionIdTouched) {
        sectionFields.sectionId.value = slugify(sectionFields.sectionTitle.value);
    }
});

onSubmit(sectionModal, () => {
    if (sectionModalContext.mode === 'add') {
        let sectionId = sectionFields.sectionId.value.trim() || slugify(sectionFields.sectionTitle.value);
        if (!sectionId) return null;
        return {method: 'POST', url: '/api/sections', body: {
            sectionId,
            sectionTitle: sectionFields.sectionTitle.value,
            sectionDescription: sectionFields.sectionDescription.value || undefined,
            show: sectionFields.show.checked === false ? false : undefined,
        }};
    }
    return {method: 'PATCH', url: apiUrl(sectionModalContext.sectionId), body: {
        sectionTitle: sectionFields.sectionTitle.value,
        newSectionId: sectionFields.sectionId.value,
        sectionDescription: sectionFields.sectionDescription.value || null,
        show: sectionFields.show.checked,
    }};
});

// ---- subcategory ("group") modal ----

const subcategoryModal = document.getElementById('subcategory-modal');
const subcategoryFields = document.getElementById('subcategory-modal-form').elements;
let subcategoryModalContext = null;

function openSubcategoryModal(sectionId, group) {
    subcategoryModalContext = group ? {mode: 'edit', sectionId, name: group.name} : {mode: 'add', sectionId};
    subcategoryModal.querySelector('[data-modal-title]').textContent = group ? 'Edit group' : 'Add group';
    fillForm(subcategoryModal.querySelector('form'), {name: group?.name, show: group ? group.show !== false : true});
    subcategoryModal.showModal();
}

onSubmit(subcategoryModal, () => {
    let name = subcategoryFields.namedItem('name').value.trim();
    if (!name) return null;
    let {mode, sectionId} = subcategoryModalContext;
    let body = {name, show: subcategoryFields.show.checked};
    return mode === 'add'
        ? {method: 'POST', url: apiUrl(sectionId, 'subcategories'), body}
        : {method: 'PATCH', url: apiUrl(sectionId, 'subcategories', subcategoryModalContext.name), body};
});

// ---- event modal ----

const eventModal = document.getElementById('event-modal');
const eventFields = document.getElementById('event-modal-form').elements;
let eventModalContext = null;

function openEventModal(sectionId, event) {
    eventModalContext = event ? {mode: 'edit', sectionId, eventId: event.id} : {mode: 'add', sectionId};
    eventModal.querySelector('[data-modal-title]').textContent = event ? 'Edit event' : 'Add event';
    fillForm(eventModal.querySelector('form'), {
        name: event?.name,
        date: event?.date,
        location: event?.location,
        link: event?.link,
        show: event ? event.show !== false : true,
    });
    eventModal.showModal();
}

onSubmit(eventModal, () => {
    let name = eventFields.namedItem('name').value.trim();
    if (!name) return null;
    let {mode, sectionId} = eventModalContext;
    let body = {
        name,
        date: eventFields.date.value,
        location: eventFields.location.value,
        link: eventFields.link.value,
        show: eventFields.show.checked,
    };
    return mode === 'add'
        ? {method: 'POST', url: apiUrl(sectionId, 'events'), body}
        : {method: 'PATCH', url: apiUrl(sectionId, 'events', eventModalContext.eventId), body};
});

// ---- item (product) modal ----

const itemModal = document.getElementById('item-modal');
const itemFields = document.getElementById('item-modal-form').elements;
const modalSectionSelect = itemFields.sectionId;
const modalSubcategorySelect = itemFields.subcategory;
let itemModalContext = null;

function populateModalSubcategories(sectionId, selected) {
    let groups = boo.find(s => s.sectionId === sectionId)?.subcategories || [];
    modalSubcategorySelect.innerHTML = '<option value="">(no group)</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    modalSubcategorySelect.value = selected || '';
}

function openItemModal(sectionId, subcategoryName, item) {
    itemModalContext = item
        ? {mode: 'edit', sectionId, subcategoryName, itemId: item.id}
        : {mode: 'add'};

    itemModal.querySelector('[data-modal-title]').textContent = item ? 'Edit product' : 'Add product';
    itemModal.querySelector('[data-modal-submit]').textContent = item ? 'Save' : 'Add product';

    modalSectionSelect.innerHTML = boo
        .map(s => `<option value="${esc(s.sectionId)}">${esc(s.sectionTitle)}</option>`).join('');
    modalSectionSelect.value = sectionId;
    populateModalSubcategories(sectionId, subcategoryName);
    // moving an item across sections/subcategories isn't supported server-side,
    // so lock the location fields while editing an existing item.
    modalSectionSelect.disabled = !!item;
    modalSubcategorySelect.disabled = !!item;

    fillForm(itemModal.querySelector('form'), {
        title: item?.title,
        description: item?.description,
        etsyPage: item?.etsyPage,
        show: item ? item.show !== false : true,
    });
    itemModal.showModal();
    itemFields.title.focus();
}

modalSectionSelect.addEventListener('change', () => {
    populateModalSubcategories(modalSectionSelect.value, null);
});

onSubmit(itemModal, () => {
    let title = itemFields.title.value.trim();
    if (!title) return null;
    let body = {
        title,
        description: itemFields.description.value,
        etsyPage: itemFields.etsyPage.value,
        show: itemFields.show.checked,
    };
    // a new product goes wherever the Section/Group dropdowns say; an
    // existing one stays put (the dropdowns are locked while editing)
    if (itemModalContext.mode === 'add') {
        return {method: 'POST', url: itemsUrl(modalSectionSelect.value, modalSubcategorySelect.value || null), body};
    }
    let {sectionId, subcategoryName, itemId} = itemModalContext;
    return {method: 'PATCH', url: itemsUrl(sectionId, subcategoryName) + '/' + encodeURIComponent(itemId), body};
});

async function loadConfig() {
    let config = await api('GET', '/api/config');
    if (config.siteUrl) {
        let link = document.getElementById('preview-link');
        link.href = config.siteUrl;
        link.hidden = false;
    }
}

// ---- publishing (the actual push happens in scripts/git-sync.sh, from cron) ----

const publishStage = document.getElementById('publish-stage');
const publishStatusEl = document.getElementById('publish-status');
const publishBtn = document.getElementById('publish-btn');
const cancelPublishBtn = document.getElementById('cancel-publish-btn');
const publishModal = document.getElementById('publish-modal');
const publishInfoModal = document.getElementById('publish-info-modal');
let publishPollTimer = null;
let lastPublishStatus = null;

function formatTime(iso) {
    let d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
}

// The header's "public site" step: what the public site has, plus either
// Publish site or (while a publish is waiting to be picked up) Cancel publish.
function renderPublishStatus(status) {
    lastPublishStatus = status;
    publishStage.hidden = false;
    publishBtn.hidden = status.requested;
    publishBtn.disabled = status.inProgress;
    cancelPublishBtn.hidden = !status.requested;

    let state = 'ok', html;
    if (status.requested) {
        state = 'busy';
        html = 'Publishing in 10-15 min';
    } else if (status.inProgress) {
        state = 'busy';
        html = 'Publishing now...';
    } else if (status.last && !status.last.ok) {
        state = 'error';
        html = '<button type="button" class="btn btn-link p-0 align-baseline stage-error-link" data-show-failure>Publish failed</button>';
    } else if (status.last) {
        html = `Published ${esc(formatTime(status.last.time))}`;
    } else {
        html = 'Not published yet';
    }
    publishStage.dataset.state = state;
    publishStatusEl.innerHTML = html;

    clearTimeout(publishPollTimer);
    if (status.requested || status.inProgress) {
        publishPollTimer = setTimeout(loadPublishStatus, 30000);
    }
}

// Plain fetch rather than api(), so background polling doesn't touch the
// header's save status.
async function loadPublishStatus() {
    try {
        let res = await fetch('/api/publish');
        if (res.ok) renderPublishStatus(await res.json());
    } catch (err) {
        console.error(err);
    }
}

function showPublishInfo(title, body) {
    publishInfoModal.querySelector('[data-modal-title]').innerHTML = title;
    publishInfoModal.querySelector('[data-modal-body]').innerHTML = body;
    publishInfoModal.showModal();
}

// the "To follow along, check the deploys page on Netlify" line, written once
// in the publish confirmation dialog and reused in the "too late" popup
const deploysLinkHtml = publishModal.querySelector('[data-deploys-link]').outerHTML;

// Nothing is requested until OK is clicked in the confirmation modal.
publishBtn.addEventListener('click', () => publishModal.showModal());

document.getElementById('publish-modal-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
        renderPublishStatus(await api('POST', '/api/publish'));
        publishModal.close();
    } catch (err) {
        // api() already reported it
    }
});

cancelPublishBtn.addEventListener('click', async () => {
    let status;
    try {
        status = await api('DELETE', '/api/publish');
    } catch (err) {
        return; // api() already reported it
    }
    renderPublishStatus(status);
    if (status.cancelled) {
        showPublishInfo('<i class="bi bi-x-circle"></i> Publish cancelled',
            '<p class="mb-0">Nothing was sent to the public site. Your changes are still saved here, '
            + 'and you can press Publish site again whenever you\'re ready.</p>');
        return;
    }
    let what;
    if (status.inProgress) {
        what = 'Publishing had already started. The public site will update within 10-15 minutes.';
    } else if (status.last && !status.last.ok) {
        what = 'Publishing had already been tried, but it failed, so the public site didn\'t change. '
            + 'Click "Publish failed" at the top of the page for details.';
    } else {
        what = 'Your changes had already been published. The public site will update within 10-15 minutes.';
    }
    showPublishInfo('<i class="bi bi-exclamation-circle"></i> Too late to cancel',
        `<p class="mb-2">${what}</p>` + deploysLinkHtml);
});

publishStatusEl.addEventListener('click', e => {
    if (!e.target.closest('[data-show-failure]')) return;
    let last = lastPublishStatus.last;
    showPublishInfo('<i class="bi bi-exclamation-triangle"></i> Publish failed',
        `<p class="mb-2">The publish on ${esc(formatTime(last.time))} didn't go through, so the public site wasn't changed. `
        + 'Press Publish site to try again. If it fails again, send the details below to whoever looks after the site.</p>'
        + `<details><summary class="small">Details</summary><pre class="small mb-0 mt-1">${esc(last.detail)}</pre></details>`);
});

loadAll();
loadConfig();
loadPublishStatus();
