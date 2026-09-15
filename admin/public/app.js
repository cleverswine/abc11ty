let boo = [];

const sectionsEl = document.getElementById('sections');
const statusEl = document.getElementById('save-status');

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

async function api(method, url, body) {
    statusEl.textContent = 'saving...';
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
        statusEl.textContent = 'saved ' + new Date().toLocaleTimeString();
        return res.status === 204 ? null : res.json();
    } catch (e) {
        statusEl.textContent = 'error: ' + e.message;
        throw e;
    }
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
            <button type="button" class="btn-arrow" data-move-image="left" title="Move left" ${i === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>
            <img src="/${esc(src)}" alt="">
            <button type="button" class="btn-arrow" data-move-image="right" title="Move right" ${i === images.length - 1 ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>
            <button type="button" class="btn-icon btn-icon-danger" data-remove-image title="Remove image"><i class="bi bi-trash"></i></button>
        </span>`).join('');
    return `
        <div class="thumb-strip">
            ${thumbs}
            <label class="thumb-upload-label" title="Add image">
                <i class="bi bi-plus-lg"></i>
                <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" data-upload-image-input>
            </label>
        </div>`;
}

// ---- page rendering (read-only representation + reorder/edit/delete controls) ----

// Passive display only - used for Etsy items, whose "show" can't be edited
// here (the server rejects PATCHes to non-manual items).
function showIndicatorHtml(show) {
    if (show === false) {
        return '<span class="badge text-bg-warning ms-1"><i class="bi bi-eye-slash"></i> hidden</span>';
    }
    return '<span class="show-indicator ms-1" title="visible on site"><i class="bi bi-eye"></i></span>';
}

// Icon-only toggle button, for item-level action rows (next to Edit/Delete).
function showToggleButtonHtml(show) {
    let hidden = show === false;
    return `<button type="button" class="btn-icon ${hidden ? 'btn-icon-warning' : ''}" data-action="toggle-show" title="${hidden ? 'Hidden - click to show' : 'Visible - click to hide'}"><i class="bi ${hidden ? 'bi-eye-slash' : 'bi-eye'}"></i></button>`;
}

// Bordered toggle button, for section/subcategory action rows (next to the
// bordered Edit/Delete buttons there).
function showToggleBadgeHtml(show) {
    let hidden = show === false;
    return `<button type="button" class="btn btn-sm ${hidden ? 'btn-outline-warning' : 'btn-outline-secondary'}" data-action="toggle-show" title="Click to ${hidden ? 'show' : 'hide'}"><i class="bi ${hidden ? 'bi-eye-slash' : 'bi-eye'}"></i> ${hidden ? 'Hidden' : 'Visible'}</button>`;
}

function readonlyItemHtml(item) {
    let img = item.images && item.images[0];
    return `
        <div class="item-row etsy-readonly d-flex gap-2">
            <div class="show-indicator-corner">${showIndicatorHtml(item.show)}</div>
            ${img ? `<img src="/${esc(img)}" alt="">` : ''}
            <div>
                <div class="fw-bold">${esc(item.title)}</div>
                <div class="small text-body-secondary">${esc((item.description || '').slice(0, 120))}</div>
                <a href="${esc(item.etsyPage)}" target="_blank" class="small">View on Etsy</a>
                <span class="badge text-bg-secondary ms-2">Etsy</span>
            </div>
        </div>`;
}

function manualItemCardHtml(item, canMoveUp, canMoveDown) {
    return `
        <div class="item-row" data-item-card="${esc(item.id)}">
            <div class="d-flex gap-2 align-items-start">
                <div class="reorder-stack">
                    <button type="button" class="btn-icon" data-action="move-up" title="Move up" ${canMoveUp ? '' : 'disabled'}><i class="bi bi-chevron-up"></i></button>
                    <button type="button" class="btn-icon" data-action="move-down" title="Move down" ${canMoveDown ? '' : 'disabled'}><i class="bi bi-chevron-down"></i></button>
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${esc(item.title)}</div>
                    <div class="small text-body-secondary">${esc((item.description || '').slice(0, 160))}</div>
                    ${item.etsyPage ? `<a href="${esc(item.etsyPage)}" target="_blank" class="small">Link</a>` : ''}
                    ${imageStripHtml(item.images || [])}
                </div>
            </div>
            <div class="d-flex justify-content-end gap-2 mt-2 item-actions">
                ${showToggleButtonHtml(item.show)}
                <button type="button" class="btn-icon" data-action="edit-item" title="Edit"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn-icon btn-icon-danger" data-action="delete-item" title="Delete"><i class="bi bi-trash"></i></button>
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
    return `<button type="button" class="btn btn-sm btn-outline-primary mt-2" data-action="open-add-item"><i class="bi bi-plus-lg"></i> Add item</button>`;
}

function subcategoryHtml(section, group, groupIdx, totalGroups) {
    return `
        <details class="subcategory-block" data-subcategory="${esc(group.name)}">
            <summary class="d-flex align-items-center gap-2">
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap flex-grow-1">
                    <div class="d-flex align-items-center gap-2">
                        <div class="reorder-stack">
                            <button type="button" class="btn-icon" data-action="move-subcategory-up" title="Move up" ${groupIdx > 0 ? '' : 'disabled'}><i class="bi bi-chevron-up"></i></button>
                            <button type="button" class="btn-icon" data-action="move-subcategory-down" title="Move down" ${groupIdx < totalGroups - 1 ? '' : 'disabled'}><i class="bi bi-chevron-down"></i></button>
                        </div>
                        <strong>${esc(group.name)}</strong>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        ${showToggleBadgeHtml(group.show)}
                        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-subcategory"><i class="bi bi-pencil"></i> Edit</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-subcategory"><i class="bi bi-trash"></i> Delete</button>
                    </div>
                </div>
            </summary>
            <div class="mt-2">${itemsListHtml(group.items || [], section.sectionId, group.name)}</div>
            ${addItemButtonHtml()}
        </details>`;
}

// ---- events (e.g. live-events' in-person event list) ----

function eventHtml(event, canMoveUp, canMoveDown) {
    let meta = [event.date, event.location].filter(Boolean).join(' &middot; ');
    return `
        <div class="item-row" data-event-row="${esc(event.id)}">
            <div class="d-flex gap-2 align-items-start">
                <div class="reorder-stack">
                    <button type="button" class="btn-icon" data-action="move-event-up" title="Move up" ${canMoveUp ? '' : 'disabled'}><i class="bi bi-chevron-up"></i></button>
                    <button type="button" class="btn-icon" data-action="move-event-down" title="Move down" ${canMoveDown ? '' : 'disabled'}><i class="bi bi-chevron-down"></i></button>
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${esc(event.name)}</div>
                    ${meta ? `<div class="small text-body-secondary">${meta}</div>` : ''}
                    ${event.link ? `<a href="${esc(event.link)}" target="_blank" class="small">Link</a>` : ''}
                </div>
            </div>
            <div class="d-flex justify-content-end gap-2 mt-2 item-actions">
                ${showToggleButtonHtml(event.show)}
                <button type="button" class="btn-icon" data-action="edit-event" title="Edit"><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn-icon btn-icon-danger" data-action="delete-event" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
        </div>`;
}

function eventsListHtml(events) {
    return events.map((event, idx) => eventHtml(event, idx > 0, idx < events.length - 1)).join('');
}

function addEventButtonHtml() {
    return `<button type="button" class="btn btn-sm btn-outline-primary mt-2 mb-3" data-action="open-add-event"><i class="bi bi-plus-lg"></i> Add event</button>`;
}

function sectionHtml(section) {
    let hasSubcategories = (section.subcategories || []).length > 0;
    return `
        <details class="card mb-3" data-section="${esc(section.sectionId)}">
            <summary class="card-header d-flex align-items-center gap-2">
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap flex-grow-1">
                    <span>
                        <strong>${esc(section.sectionTitle)}</strong>
                    </span>
                    <div class="d-flex gap-2 flex-shrink-0">
                        ${showToggleBadgeHtml(section.show)}
                        <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-section"><i class="bi bi-pencil"></i> Edit</button>
                        <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-section"><i class="bi bi-trash"></i> Delete</button>
                    </div>
                </div>
            </summary>
            <div class="card-body">
                <div class="mb-3">
                    ${section.sectionDescription ? `<p class="text-body-secondary mb-0">${esc(section.sectionDescription)}</p>` : ''}
                </div>

                ${Array.isArray(section.events) ? `
                <h3 class="h6">Events</h3>
                <div class="events-block">${eventsListHtml(section.events)}</div>
                ${addEventButtonHtml()}
                ` : ''}

                <h3 class="h6">Subcategories</h3>
                ${(section.subcategories || []).map((g, i, arr) => subcategoryHtml(section, g, i, arr.length)).join('')}
                <button type="button" class="btn btn-sm btn-outline-primary mt-2 mb-3" data-action="open-add-subcategory"><i class="bi bi-plus-lg"></i> Add subcategory</button>

                <h3 class="h6">${hasSubcategories ? 'Items in Category' : 'Items'}</h3>
                ${itemsListHtml(section.items || [], section.sectionId, null)}
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
        let message = `Remove this image from "${item.title}"?\n\n` +
            `This will remove it from the item's image list, so it will no longer show on the site or in the image-viewer modal.\n\n` +
            `This cannot be undone from here - the image file itself will remain in img-product/ on disk, but you would need to manually add it back to this item if you change your mind.`;
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
        let message = `Delete the section "${section.sectionTitle}"?\n\n` +
            `This will permanently delete:\n` +
            `- The section itself, including its title, description, and visibility settings\n` +
            `- ${totalItems} item${totalItems === 1 ? '' : 's'} in it` +
            (subcats.length ? `, including ${subItems.length} inside ${subcats.length} subcategor${subcats.length === 1 ? 'y' : 'ies'}\n` : '\n') +
            (subcats.length ? `- ${subcats.length} subcategor${subcats.length === 1 ? 'y' : 'ies'}\n` : '') +
            `\nThis cannot be undone. (Image files in img-product/ are not deleted from disk - only removed from this section's data.)`;
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
        let message = `Delete the subcategory "${group.name}"?\n\n` +
            `This will permanently delete:\n` +
            `- The subcategory itself, including its visibility setting\n` +
            `- ${items.length} item${items.length === 1 ? '' : 's'} inside it\n` +
            `\nThis cannot be undone. (Image files in img-product/ are not deleted from disk - only removed from this subcategory's data.)`;
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
            let message = `Delete the event "${event.name}"?\n\nThis cannot be undone.`;
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
        let images = item.images || [];
        let message = `Delete the item "${item.title}"?\n\n` +
            `This will permanently delete:\n` +
            `- The item itself, including its title, description, and Etsy link\n` +
            `- Its ${images.length} image reference${images.length === 1 ? '' : 's'}\n` +
            `\nThis cannot be undone. (Image files in img-product/ are not deleted from disk - only this item's reference to them.)`;
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
        statusEl.textContent = 'uploading...';
        let res = await fetch('/api/images', {method: 'POST', body: form});
        if (!res.ok) {
            let err = await res.json().catch(() => ({error: res.statusText}));
            throw new Error(err.error || 'upload failed');
        }
        let {path} = await res.json();
        await api('PATCH', itemUrl(sectionId, subcategoryName, itemId), {images: [...(item.images || []), path]});
        await loadAll();
    } catch (err) {
        statusEl.textContent = 'error: ' + err.message;
    }
});

// ---- section modal ----

const sectionModal = document.getElementById('section-modal');
const sectionModalForm = document.getElementById('section-modal-form');
let sectionModalContext = null;

function openSectionModal(section) {
    sectionModalContext = section
        ? {mode: 'edit', sectionId: section.sectionId}
        : {mode: 'add'};

    sectionModalForm.querySelector('[data-modal-title]').textContent = section ? 'Edit section' : 'Add section';
    sectionModalForm.sectionTitle.value = section ? section.sectionTitle : '';
    sectionModalForm.sectionId.value = section ? section.sectionId : '';
    sectionModalForm.sectionDescription.value = section ? (section.sectionDescription || '') : '';
    sectionModalForm.show.checked = section ? section.show !== false : true;
    sectionModal.showModal();
}

document.getElementById('add-section-btn').addEventListener('click', () => openSectionModal(null));
sectionModal.querySelector('[data-close-modal]').addEventListener('click', () => sectionModal.close());

sectionModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        if (sectionModalContext.mode === 'add') {
            let sectionId = sectionModalForm.sectionId.value.trim();
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
        statusEl.textContent = 'error: ' + err.message;
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
    subcategoryModalForm.querySelector('[data-modal-title]').textContent = group ? 'Edit subcategory' : 'Add subcategory';
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
        statusEl.textContent = 'error: ' + err.message;
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
        statusEl.textContent = 'error: ' + err.message;
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
    modalSubcategorySelect.innerHTML = '<option value="">(none - top-level item)</option>' +
        groups.map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    modalSubcategorySelect.value = selected || '';
}

function openItemModal(sectionId, subcategoryName, item) {
    itemModalContext = item
        ? {mode: 'edit', sectionId, subcategoryName, itemId: item.id}
        : {mode: 'add', sectionId, subcategoryName};

    itemModalForm.querySelector('[data-modal-title]').textContent = item ? 'Edit item' : 'Add item';
    itemModalForm.querySelector('[data-modal-submit]').textContent = item ? 'Save' : 'Add item';

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
        let url = itemUrl(
            itemModalContext.sectionId,
            itemModalContext.subcategoryName,
            itemModalContext.mode === 'edit' ? itemModalContext.itemId : null
        );
        await api(itemModalContext.mode === 'add' ? 'POST' : 'PATCH', url, body);
        itemModal.close();
        await loadAll();
    } catch (err) {
        statusEl.textContent = 'error: ' + err.message;
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

loadAll();
loadConfig();
