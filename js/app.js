const navButtons = document.querySelectorAll('button[data-role="nav"]');
const itemDivs = document.querySelectorAll('div[data-role="item"]');

if (navButtons && itemDivs) {
    navButtons.forEach((navBtn) => {
        navBtn.addEventListener('click', () => {
            const sectionId = navBtn.getAttribute('data-id');

            navButtons.forEach((btn) => {
                btn.classList.remove('active');
            });
            navBtn.classList.add('active');

            itemDivs.forEach((content) => {
                content.classList.remove('abc-items-active');
                content.classList.remove('abc-items-hidden');
                if (sectionId === "0" || content.getAttribute('data-section-id') === sectionId) {
                    content.classList.add('abc-items-active');
                } else {
                    content.classList.add('abc-items-hidden');
                }
            });
        });
    });
}