// Discourage right-click/long-press "save image" on product photos. Not a
// real barrier (dev tools, screenshots, etc. still work) but stops the
// casual case on both the card thumbnails and the image-viewer modal, since
// both use the same .abc-product-img class.
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.abc-product-img')) {
        e.preventDefault();
    }
});

document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.abc-product-img')) {
        e.preventDefault();
    }
});

// Keep the thumbnail strip below an image-modal carousel in sync with
// whichever slide is currently showing.
document.querySelectorAll('.carousel').forEach((carouselEl) => {
    carouselEl.addEventListener('slide.bs.carousel', (event) => {
        let thumbs = carouselEl.parentElement.querySelectorAll('.abc-carousel-thumb');
        thumbs.forEach((thumb, idx) => {
            thumb.classList.toggle('active', idx === event.to);
        });
    });
});

const navButtons = document.querySelectorAll('button[data-role="nav"]');
const itemDivs = document.querySelectorAll('div[data-role="item"]');

function selectSection(sectionId) {
    navButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === sectionId);
    });

    itemDivs.forEach((content) => {
        content.classList.remove('abc-items-active');
        content.classList.remove('abc-items-hidden');
        if (sectionId === "0" || content.getAttribute('data-section-id') === sectionId) {
            content.classList.add('abc-items-active');
        } else {
            content.classList.add('abc-items-hidden');
        }
    });
}

if (navButtons.length && itemDivs.length) {
    navButtons.forEach((navBtn) => {
        navBtn.addEventListener('click', () => {
            selectSection(navBtn.getAttribute('data-id'));
        });
    });

    // default to the first category instead of dumping every section onto the page at once
    selectSection(itemDivs[0].getAttribute('data-section-id'));
}
