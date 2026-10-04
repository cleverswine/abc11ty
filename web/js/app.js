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

// Keep the thumbnail strip above an image-modal carousel in sync with
// whichever slide is currently showing.
document.querySelectorAll('.carousel').forEach((carouselEl) => {
    carouselEl.addEventListener('slide.bs.carousel', (event) => {
        let thumbs = carouselEl.parentElement.querySelectorAll('.abc-carousel-thumb');
        thumbs.forEach((thumb, idx) => {
            thumb.classList.toggle('active', idx === event.to);
        });
    });
});

// Make each "More ... in the Etsy Shop" card exactly as tall as the photo
// of the last product card before it, so their bottoms line up. Product
// photos vary in height, so CSS alone can't do this. A ResizeObserver
// catches both the (lazy-loaded) photo arriving and window resizes; until
// the photo has loaded, the card falls back to its CSS min-height.
// (Not simply previousElementSibling - each product card is followed by
// its hidden image-viewer modal.)
const moreCardFor = new Map();
const photoObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
        let height = entry.target.offsetHeight;
        if (height > 0) moreCardFor.get(entry.target).style.height = `${height}px`;
    }
});
document.querySelectorAll('.more-card').forEach((card) => {
    let products = card.parentElement.querySelectorAll(':scope > .product-card');
    let photo = products[products.length - 1]?.querySelector('.product-card__image');
    if (photo) {
        moreCardFor.set(photo, card);
        photoObserver.observe(photo);
    }
});
