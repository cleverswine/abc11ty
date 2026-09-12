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
