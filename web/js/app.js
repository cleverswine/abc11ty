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
