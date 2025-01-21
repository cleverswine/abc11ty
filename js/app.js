const tabButtons = document.querySelectorAll('.section-button-container');
const tabContents = document.querySelectorAll('.tabs__panels > div');

if (tabButtons && tabContents) {
    tabButtons.forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            const tabId = tabBtn.getAttribute('data-id');

            tabButtons.forEach((btn) => btn.classList.remove('active'));
            tabBtn.classList.add('active');

            tabContents.forEach((content) => {
                content.classList.remove('active');
                if (content.classList.contains(tabId)) {
                    content.classList.add('active');
                }
            });
        });
    });
}
