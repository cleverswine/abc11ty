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

// Mirrors isLocked() in server.js - an Etsy-sourced item is read-only here,
// re-scraped and re-appended by gen.js on every run.
function isLocked(item) {
    return item.source === 'Etsy';
}

function showError(err) {
    console.error(err);
    setSaveStatus('error', "Couldn't save. Try again.");
}

// Only changes (not GETs) touch the header's save status - loading the page
// shouldn't claim anything was just saved.
async function api(method, url, body) {
    let saving = method !== 'GET';
    if (saving) setSaveStatus('busy', 'Saving...');
    try {
        let res = await fetch(url, {
            method,
            headers: body ? {'Content-Type': 'application/json'} : undefined,
            body: body ? JSON.stringify(body) : undefined,
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

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function itemUrl(section, subcategory, itemId) {
    let base = `/api/sections/${encodeURIComponent(section)}`;
    if (subcategory) base += `/subcategories/${encodeURIComponent(subcategory)}`;
    return itemId ? `${base}/items/${encodeURIComponent(itemId)}` : `${base}/items`;
}

function findSectionInBoo(sectionId) {
    return boo.find(s => s.sectionId === sectionId) || null;
}

function findSubcategoryInBoo(sectionId, name) {
    let section = findSectionInBoo(sectionId);
    return (section && (section.subcategories || []).find(g => g.name === name)) || null;
}

function findItemInBoo(sectionId, subcategoryName, itemId) {
    let list = subcategoryName
        ? (findSubcategoryInBoo(sectionId, subcategoryName) || {}).items || []
        : (findSectionInBoo(sectionId) || {}).items || [];
    return list.find(i => i.id === itemId) || null;
}

function findEventInBoo(sectionId, eventId) {
    let section = findSectionInBoo(sectionId);
    return (section && (section.events || []).find(e => e.id === eventId)) || null;
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
                <button type="button" class="btn-arrow" data-move-image="left" title="Move left" ${i === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
                <button type="button" class="btn-icon btn-icon-danger" data-remove-image title="Remove photo"><i class="bi bi-trash"></i></button>
                <button type="button" class="btn-arrow" data-move-image="right" title="Move right" ${i === images.length - 1 ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
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
// Children have pointer-events: none so the click handler always sees the
// button itself (and its data-action) as the target.
function showToggleHtml(show) {
    let shown = show !== false;
    return `<button type="button" class="show-switch" role="switch" aria-checked="${shown}" data-action="toggle-show"
            title="${shown ? 'Shown on the site. Click to hide it.' : 'Hidden from the site. Click to show it.'}">
            <span class="switch-track" aria-hidden="true"></span><span class="switch-label">${shown ? 'On site' : 'Hidden'}</span>
        </button>`;
}

function editDeleteHtml(editAction, deleteAction) {
    return `
        <button type="button" class="btn btn-sm btn-outline-primary" data-action="${editAction}"><i class="bi bi-pencil"></i> Edit</button>
        <button type="button" class="btn btn-sm btn-quiet-danger" data-action="${deleteAction}"><i class="bi bi-trash"></i> Delete</button>`;
}

function reorderHtml(upAction, downAction, canMoveUp, canMoveDown) {
    return `
        <div class="reorder-stack">
            <button type="button" class="btn-icon" data-action="${upAction}" title="Move up" ${canMoveUp ? '' : 'disabled'}><i class="bi bi-chevron-up"></i></button>
            <button type="button" class="btn-icon" data-action="${downAction}" title="Move down" ${canMoveDown ? '' : 'disabled'}><i class="bi bi-chevron-down"></i></button>
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
            ${reorderHtml('move-up', 'move-down', canMoveUp, canMoveDown)}
            <div class="item-main">
                <div class="item-head">
                    <div class="item-text">
                        <div class="item-title">${esc(item.title)}</div>
                        ${item.description ? `<div class="item-desc">${esc(truncate(item.description, 160))}</div>` : ''}
                        ${item.etsyPage ? `<a href="${esc(item.etsyPage)}" target="_blank" rel="noopener" class="item-link">Link <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    </div>
                    <div class="item-actions">
                        ${showToggleHtml(item.show)}
                        ${editDeleteHtml('edit-item', 'delete-item')}
                    </div>
                </div>
                ${imageStripHtml(item.images || [])}
            </div>
        </div>`;
}

function itemsListHtml(items, sectionId, subcategoryName) {
    let freeItems = items.filter(i => !isLocked(i));
    return items.map(item => {
        if (isLocked(item)) return readonlyItemHtml(item);
        let idx = freeItems.indexOf(item);
        return manualItemCardHtml(item, idx > 0, idx < freeItems.length - 1);
    }).join('');
}

function addItemButtonHtml() {
    return `<button type="button" class="btn btn-sm btn-add" data-action="open-add-item"><i class="bi bi-plus-lg"></i> Add product</button>`;
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
                ${reorderHtml('move-subcategory-up', 'move-subcategory-down', groupIdx > 0, groupIdx < totalGroups - 1)}
                <span class="block-title">${esc(group.name)}</span>
                <span class="block-count">${itemsSummary(items)}</span>
                <span class="block-actions">
                    ${showToggleHtml(group.show)}
                    ${editDeleteHtml('edit-subcategory', 'delete-subcategory')}
                </span>
            </summary>
            <div class="block-items">${itemsListHtml(items, section.sectionId, group.name)}</div>
            ${addItemButtonHtml()}
        </details>`;
}

// ---- events (e.g. live-events' in-person event list) ----

function eventHtml(event, canMoveUp, canMoveDown) {
    let meta = [event.date, event.location].filter(Boolean).map(esc).join(', ');
    return `
        <div class="item-row ${event.show === false ? 'is-hidden' : ''}" data-event-row="${esc(event.id)}">
            ${reorderHtml('move-event-up', 'move-event-down', canMoveUp, canMoveDown)}
            <div class="item-main">
                <div class="item-head">
                    <div class="item-text">
                        <div class="item-title">${esc(event.name)}</div>
                        ${meta ? `<div class="item-desc">${meta}</div>` : ''}
                        ${event.link ? `<a href="${esc(event.link)}" target="_blank" rel="noopener" class="item-link">Link <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                    </div>
                    <div class="item-actions">
                        ${showToggleHtml(event.show)}
                        ${editDeleteHtml('edit-event', 'delete-event')}
                    </div>
                </div>
            </div>
        </div>`;
}

function eventsListHtml(events) {
    return events.map((event, idx) => eventHtml(event, idx > 0, idx < events.length - 1)).join('');
}

function addEventButtonHtml() {
    return `<button type="button" class="btn btn-sm btn-add" data-action="open-add-event"><i class="bi bi-plus-lg"></i> Add event</button>`;
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
                    ${editDeleteHtml('edit-section', 'delete-section')}
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
                <button type="button" class="btn btn-sm btn-add" data-action="open-add-subcategory"><i class="bi bi-plus-lg"></i> Add group</button>

                <h3 class="part-heading">${hasSubcategories ? 'Products not in a group' : 'Products'}</h3>
                ${looseItems.length ? '' : '<p class="empty-note">None yet.</p>'}
                ${itemsListHtml(looseItems, section.sectionId, null)}
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

// ---- reorder / delete actions on the page ----

sectionsEl.addEventListener('click', async (e) => {
    let target = e.target;

    // Edit/Delete/show-toggle buttons now live inside <summary>; clicking a
    // button there shouldn't also toggle the <details> open/closed.
    if (target.closest('summary') && target.closest('button')) {
        e.preventDefault();
    }

    let sectionEl = target.closest('[data-section]');
    if (!sectionEl) return;
    let sectionId = sectionEl.dataset.section;
    let subcategoryEl0 = target.closest('[data-subcategory]');
    let subcategoryName0 = subcategoryEl0 ? subcategoryEl0.dataset.subcategory : null;
    let itemCard0 = target.closest('[data-item-card]');
    let eventRow0 = target.closest('[data-event-row]');

    if (target.matches('[data-move-image]')) {
        if (target.disabled || !itemCard0) return;
        let itemId = itemCard0.dataset.itemCard;
        let item = findItemInBoo(sectionId, subcategoryName0, itemId);
        let images = [...(item.images || [])];
        let path = target.closest('.thumb-chip').dataset.path;
        let idx = images.indexOf(path);
        let newIdx = target.dataset.moveImage === 'left' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= images.length) return;
        [images[idx], images[newIdx]] = [images[newIdx], images[idx]];
        await api('PATCH', itemUrl(sectionId, subcategoryName0, itemId), {images});
        await loadAll();
        return;
    }

    if (target.matches('[data-remove-image]')) {
        if (!itemCard0) return;
        let itemId = itemCard0.dataset.itemCard;
        let item = findItemInBoo(sectionId, subcategoryName0, itemId);
        let path = target.closest('.thumb-chip').dataset.path;
        let message = `Remove this photo from "${item.title}"?\n\n` +
            `It will no longer show on the site. You'd need to upload it again if you change your mind.`;
        if (!confirm(message)) return;
        let images = (item.images || []).filter(p => p !== path);
        await api('PATCH', itemUrl(sectionId, subcategoryName0, itemId), {images});
        await loadAll();
        return;
    }

    let action = target.dataset.action;
    if (!action) return;

    if (action === 'toggle-show') {
        if (eventRow0) {
            let eventId = eventRow0.dataset.eventRow;
            let event = findEventInBoo(sectionId, eventId);
            await api('PATCH', `/api/sections/${encodeURIComponent(sectionId)}/events/${encodeURIComponent(eventId)}`, {show: event.show === false});
        } else if (itemCard0) {
            let itemId = itemCard0.dataset.itemCard;
            let item = findItemInBoo(sectionId, subcategoryName0, itemId);
            await api('PATCH', itemUrl(sectionId, subcategoryName0, itemId), {show: item.show === false});
        } else if (subcategoryEl0) {
            let group = findSubcategoryInBoo(sectionId, subcategoryName0);
            await api('PATCH', `/api/sections/${encodeURIComponent(sectionId)}/subcategories/${encodeURIComponent(subcategoryName0)}`, {show: group.show === false});
        } else {
            let section = findSectionInBoo(sectionId);
            await api('PATCH', `/api/sections/${encodeURIComponent(sectionId)}`, {show: section.show === false});
        }
        await loadAll();
        return;
    }

    if (action === 'edit-section') {
        openSectionModal(findSectionInBoo(sectionId));
        return;
    }

    if (action === 'delete-section') {
        let section = findSectionInBoo(sectionId);
        let subcats = section.subcategories || [];
        let subItems = subcats.flatMap(g => g.items || []);
        let totalItems = (section.items || []).length + subItems.length;
        let itemsPhrase = totalItems === 1 ? '1 product' : `${totalItems} products`;
        let groupsPhrase = subcats.length ? ` and ${subcats.length === 1 ? '1 group' : `${subcats.length} groups`}` : '';
        let message = `Delete the section "${section.sectionTitle}"?\n\n` +
            `This removes the section along with ${itemsPhrase}${groupsPhrase} inside it. This can't be undone.`;
        if (!confirm(message)) return;
        await api('DELETE', `/api/sections/${encodeURIComponent(sectionId)}`);
        await loadAll();
        return;
    }

    let subcategoryEl = target.closest('[data-subcategory]');
    let subcategoryName = subcategoryEl ? subcategoryEl.dataset.subcategory : null;

    if (action === 'open-add-item') {
        openItemModal(sectionId, subcategoryName, null);
        return;
    }

    if (action === 'open-add-subcategory') {
        openSubcategoryModal(sectionId, null);
        return;
    }

    if (action === 'edit-subcategory') {
        openSubcategoryModal(sectionId, findSubcategoryInBoo(sectionId, subcategoryName));
        return;
    }

    if (action === 'delete-subcategory') {
        let group = findSubcategoryInBoo(sectionId, subcategoryName);
        let items = group.items || [];
        let itemsPhrase = items.length === 1 ? '1 product' : `${items.length} products`;
        let message = `Delete the group "${group.name}"?\n\n` +
            `This removes the group along with ${itemsPhrase} inside it. This can't be undone.`;
        if (!confirm(message)) return;
        await api('DELETE', `/api/sections/${encodeURIComponent(sectionId)}/subcategories/${encodeURIComponent(subcategoryName)}`);
        await loadAll();
        return;
    }

    if (action === 'move-subcategory-up' || action === 'move-subcategory-down') {
        let names = Array.from(sectionEl.querySelectorAll(':scope > .card-body > [data-subcategory]')).map(el => el.dataset.subcategory);
        let i = names.indexOf(subcategoryName);
        let j = action === 'move-subcategory-up' ? i - 1 : i + 1;
        [names[i], names[j]] = [names[j], names[i]];
        await api('PUT', `/api/sections/${encodeURIComponent(sectionId)}/subcategories/order`, {order: names});
        await loadAll();
        return;
    }

    if (action === 'open-add-event') {
        openEventModal(sectionId, null);
        return;
    }

    if (eventRow0) {
        let eventId = eventRow0.dataset.eventRow;

        if (action === 'edit-event') {
            openEventModal(sectionId, findEventInBoo(sectionId, eventId));
            return;
        }

        if (action === 'delete-event') {
            let event = findEventInBoo(sectionId, eventId);
            let message = `Delete the event "${event.name}"?\n\nThis can't be undone.`;
            if (!confirm(message)) return;
            await api('DELETE', `/api/sections/${encodeURIComponent(sectionId)}/events/${encodeURIComponent(eventId)}`);
            await loadAll();
            return;
        }

        if (action === 'move-event-up' || action === 'move-event-down') {
            let container = sectionEl.querySelector(':scope > .card-body > .events-block');
            let ids = Array.from(container.querySelectorAll(':scope > [data-event-row]')).map(el => el.dataset.eventRow);
            let i = ids.indexOf(eventId);
            let j = action === 'move-event-up' ? i - 1 : i + 1;
            if (j < 0 || j >= ids.length) return;
            [ids[i], ids[j]] = [ids[j], ids[i]];
            await api('PUT', `/api/sections/${encodeURIComponent(sectionId)}/events/order`, {order: ids});
            await loadAll();
            return;
        }
    }

    let itemCard = target.closest('[data-item-card]');
    if (!itemCard) return;
    let itemId = itemCard.dataset.itemCard;

    if (action === 'edit-item') {
        openItemModal(sectionId, subcategoryName, findItemInBoo(sectionId, subcategoryName, itemId));
        return;
    }

    if (action === 'delete-item') {
        let item = findItemInBoo(sectionId, subcategoryName, itemId);
        let message = `Delete "${item.title}"?\n\nThis can't be undone.`;
        if (!confirm(message)) return;
        await api('DELETE', itemUrl(sectionId, subcategoryName, itemId));
        await loadAll();
        return;
    }

    if (action === 'move-up' || action === 'move-down') {
        let container = subcategoryEl || sectionEl.querySelector(':scope > .card-body');
        let ids = Array.from(container.querySelectorAll(':scope > [data-item-card], :scope > div > [data-item-card]'))
            .map(el => el.dataset.itemCard);
        let i = ids.indexOf(itemId);
        let j = action === 'move-up' ? i - 1 : i + 1;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        let url = subcategoryName
            ? `/api/sections/${encodeURIComponent(sectionId)}/subcategories/${encodeURIComponent(subcategoryName)}/items/order`
            : `/api/sections/${encodeURIComponent(sectionId)}/items/order`;
        await api('PUT', url, {order: ids});
        await loadAll();
        return;
    }
});

sectionsEl.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-upload-image-input]')) return;
    let input = e.target;
    let file = input.files[0];
    if (!file) return;
    let sectionEl = input.closest('[data-section]');
    let subcategoryEl = input.closest('[data-subcategory]');
    let itemCard = input.closest('[data-item-card]');
    if (!sectionEl || !itemCard) return;
    let sectionId = sectionEl.dataset.section;
    let subcategoryName = subcategoryEl ? subcategoryEl.dataset.subcategory : null;
    let itemId = itemCard.dataset.itemCard;
    let item = findItemInBoo(sectionId, subcategoryName, itemId);
    try {
        let form = new FormData();
        form.append('image', file);
        setSaveStatus('busy', 'Uploading photo...');
        let res = await fetch('/api/images', {method: 'POST', body: form});
        if (!res.ok) {
            let err = await res.json().catch(() => ({error: res.statusText}));
            throw new Error(err.error || 'upload failed');
        }
        let {path} = await res.json();
        await api('PATCH', itemUrl(sectionId, subcategoryName, itemId), {images: [...(item.images || []), path]});
        await loadAll();
    } catch (err) {
        console.error(err);
        setSaveStatus('error', "Couldn't upload the photo. Try again.");
    }
});

// ---- section modal ----

const sectionModal = document.getElementById('section-modal');
const sectionModalForm = document.getElementById('section-modal-form');
let sectionModalContext = null;
// Tracks whether the person has hand-edited the (hidden-by-default) page
// link name, so typing a title doesn't clobber a deliberate manual edit.
let sectionIdTouched = false;

function openSectionModal(section) {
    sectionModalContext = section
        ? {mode: 'edit', sectionId: section.sectionId}
        : {mode: 'add'};
    sectionIdTouched = false;

    sectionModalForm.querySelector('[data-modal-title]').textContent = section ? 'Edit section' : 'Add section';
    sectionModalForm.sectionTitle.value = section ? section.sectionTitle : '';
    sectionModalForm.sectionId.value = section ? section.sectionId : '';
    sectionModalForm.sectionDescription.value = section ? (section.sectionDescription || '') : '';
    sectionModalForm.show.checked = section ? section.show !== false : true;
    sectionModal.showModal();
}

document.getElementById('add-section-btn').addEventListener('click', () => openSectionModal(null));
sectionModal.querySelector('[data-close-modal]').addEventListener('click', () => sectionModal.close());

sectionModalForm.sectionId.addEventListener('input', () => {
    sectionIdTouched = true;
});

sectionModalForm.sectionTitle.addEventListener('input', () => {
    if (sectionModalContext && sectionModalContext.mode === 'add' && !sectionIdTouched) {
        sectionModalForm.sectionId.value = slugify(sectionModalForm.sectionTitle.value);
    }
});

sectionModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        if (sectionModalContext.mode === 'add') {
            let sectionId = sectionModalForm.sectionId.value.trim() || slugify(sectionModalForm.sectionTitle.value);
            if (!sectionId) return;
            await api('POST', '/api/sections', {
                sectionId,
                sectionTitle: sectionModalForm.sectionTitle.value,
                sectionDescription: sectionModalForm.sectionDescription.value || undefined,
                show: sectionModalForm.show.checked === false ? false : undefined,
            });
        } else {
            let body = {
                sectionTitle: sectionModalForm.sectionTitle.value,
                newSectionId: sectionModalForm.sectionId.value,
                sectionDescription: sectionModalForm.sectionDescription.value || null,
                show: sectionModalForm.show.checked,
            };
            await api('PATCH', `/api/sections/${encodeURIComponent(sectionModalContext.sectionId)}`, body);
        }
        sectionModal.close();
        await loadAll();
    } catch (err) {
        showError(err);
    }
});

// ---- subcategory modal ----

const subcategoryModal = document.getElementById('subcategory-modal');
const subcategoryModalForm = document.getElementById('subcategory-modal-form');
let subcategoryModalContext = null;

function openSubcategoryModal(sectionId, group) {
    subcategoryModalContext = group
        ? {mode: 'edit', sectionId, name: group.name}
        : {mode: 'add', sectionId};
    subcategoryModalForm.querySelector('[data-modal-title]').textContent = group ? 'Edit group' : 'Add group';
    subcategoryModalForm.name.value = group ? group.name : '';
    subcategoryModalForm.show.checked = group ? group.show !== false : true;
    subcategoryModal.showModal();
}

subcategoryModal.querySelector('[data-close-modal]').addEventListener('click', () => subcategoryModal.close());

subcategoryModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let name = subcategoryModalForm.name.value.trim();
    if (!name) return;
    try {
        let base = `/api/sections/${encodeURIComponent(subcategoryModalContext.sectionId)}/subcategories`;
        if (subcategoryModalContext.mode === 'add') {
            await api('POST', base, {name, show: subcategoryModalForm.show.checked});
        } else {
            await api('PATCH', `${base}/${encodeURIComponent(subcategoryModalContext.name)}`, {
                name,
                show: subcategoryModalForm.show.checked,
            });
        }
        subcategoryModal.close();
        await loadAll();
    } catch (err) {
        showError(err);
    }
});

// ---- event modal ----

const eventModal = document.getElementById('event-modal');
const eventModalForm = document.getElementById('event-modal-form');
let eventModalContext = null;

function openEventModal(sectionId, event) {
    eventModalContext = event
        ? {mode: 'edit', sectionId, eventId: event.id}
        : {mode: 'add', sectionId};
    eventModalForm.querySelector('[data-modal-title]').textContent = event ? 'Edit event' : 'Add event';
    eventModalForm.name.value = event ? event.name : '';
    eventModalForm.date.value = event ? (event.date || '') : '';
    eventModalForm.location.value = event ? (event.location || '') : '';
    eventModalForm.link.value = event ? (event.link || '') : '';
    eventModalForm.show.checked = event ? event.show !== false : true;
    eventModal.showModal();
}

eventModal.querySelector('[data-close-modal]').addEventListener('click', () => eventModal.close());

eventModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let name = eventModalForm.name.value.trim();
    if (!name) return;
    let body = {
        name,
        date: eventModalForm.date.value,
        location: eventModalForm.location.value,
        link: eventModalForm.link.value,
        show: eventModalForm.show.checked,
    };
    try {
        let base = `/api/sections/${encodeURIComponent(eventModalContext.sectionId)}/events`;
        if (eventModalContext.mode === 'add') {
            await api('POST', base, body);
        } else {
            await api('PATCH', `${base}/${encodeURIComponent(eventModalContext.eventId)}`, body);
        }
        eventModal.close();
        await loadAll();
    } catch (err) {
        showError(err);
    }
});

// ---- item modal ----

const itemModal = document.getElementById('item-modal');
const itemModalForm = document.getElementById('item-modal-form');
const modalSectionSelect = itemModalForm.querySelector('[name="sectionId"]');
const modalSubcategorySelect = itemModalForm.querySelector('[name="subcategory"]');
let itemModalContext = null;

function populateModalSubcategories(sectionId, selected) {
    let section = findSectionInBoo(sectionId);
    let groups = (section && section.subcategories) || [];
    modalSubcategorySelect.innerHTML = '<option value="">(no group)</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    modalSubcategorySelect.value = selected || '';
}

function openItemModal(sectionId, subcategoryName, item) {
    itemModalContext = item
        ? {mode: 'edit', sectionId, subcategoryName, itemId: item.id}
        : {mode: 'add', sectionId, subcategoryName};

    itemModalForm.querySelector('[data-modal-title]').textContent = item ? 'Edit product' : 'Add product';
    itemModalForm.querySelector('[data-modal-submit]').textContent = item ? 'Save' : 'Add product';

    modalSectionSelect.innerHTML = boo
        .map(s => `<option value="${esc(s.sectionId)}">${esc(s.sectionTitle)}</option>`).join('');
    modalSectionSelect.value = sectionId;
    populateModalSubcategories(sectionId, subcategoryName);
    // moving an item across sections/subcategories isn't supported server-side,
    // so lock the location fields while editing an existing item.
    modalSectionSelect.disabled = !!item;
    modalSubcategorySelect.disabled = !!item;

    itemModalForm.title.value = item ? item.title : '';
    itemModalForm.description.value = item ? (item.description || '') : '';
    itemModalForm.etsyPage.value = item ? (item.etsyPage || '') : '';
    itemModalForm.show.checked = item ? item.show !== false : true;

    itemModal.showModal();
    itemModalForm.title.focus();
}

modalSectionSelect.addEventListener('change', () => {
    populateModalSubcategories(modalSectionSelect.value, null);
});

itemModal.querySelector('[data-close-modal]').addEventListener('click', () => itemModal.close());

itemModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let title = itemModalForm.title.value.trim();
    if (!title) return;
    let body = {
        title,
        description: itemModalForm.description.value,
        etsyPage: itemModalForm.etsyPage.value,
        show: itemModalForm.show.checked,
    };
    try {
        // a new product goes wherever the Section/Group dropdowns say; an
        // existing one stays put (the dropdowns are locked while editing)
        let url = itemModalContext.mode === 'add'
            ? itemUrl(modalSectionSelect.value, modalSubcategorySelect.value || null, null)
            : itemUrl(itemModalContext.sectionId, itemModalContext.subcategoryName, itemModalContext.itemId);
        await api(itemModalContext.mode === 'add' ? 'POST' : 'PATCH', url, body);
        itemModal.close();
        await loadAll();
    } catch (err) {
        showError(err);
    }
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
const NETLIFY_DEPLOYS_URL = 'https://app.netlify.com/projects/auntieboocrafts/deploys';
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

const deploysLinkHtml = `<p class="small text-body-secondary mb-0">To follow along, check the `
    + `<a href="${NETLIFY_DEPLOYS_URL}" target="_blank" rel="noopener">deploys page on Netlify <i class="bi bi-box-arrow-up-right"></i></a>.</p>`;

// Nothing is requested until OK is clicked in the confirmation modal.
publishBtn.addEventListener('click', () => publishModal.showModal());
publishModal.querySelector('[data-close-modal]').addEventListener('click', () => publishModal.close());

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
