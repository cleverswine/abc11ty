function renderNav(active) {
  const links = [
    { href: '/index.html', label: 'Products', key: 'products' },
    { href: '/settings.html', label: 'Site Settings', key: 'settings' },
  ];

  const items = links
    .map(
      (l) => `<li class="nav-item">
        <a class="nav-link${l.key === active ? ' active' : ''}" href="${l.href}">${l.label}</a>
      </li>`
    )
    .join('');

  document.getElementById('admin-nav').innerHTML = `
    <nav class="navbar navbar-expand navbar-light bg-white border-bottom mb-4">
      <div class="container">
        <a class="navbar-brand" href="/index.html">Product Admin</a>
        <ul class="navbar-nav">${items}</ul>
      </div>
    </nav>
  `;
}
