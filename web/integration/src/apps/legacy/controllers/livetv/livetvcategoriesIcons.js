// Owned SVG paths: no icon font, ligatures or upstream glyph names on TVs.
const PATHS = {
    all: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
    tv: 'M5 6h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zm0 2v12h14V8zM7 1l5 4 5-4 1 1-6 5-6-5z',
    sport: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2 3 2 3-1 2 5-3 2v4l-5 4-5-4v-4l-3-2 2-5 3 1zm0 4-4 3 2 5h4l2-5z',
    kids: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-4 4h2v2H8zm6 0h2v2h-2zm-6 4h8a4 4 0 0 1-8 0z',
    movie: 'M3 5h18v15H3zm2 2v11h14V7zm-2-5h4l2 3H5zm7 0h4l2 3h-4zm7 0h4v3h-2z',
    music: 'M10 3h10v3h-7v11a4 4 0 1 1-3-4z',
    news: 'M3 3h18v18H3zm2 2v14h14V5zm2 2h4v6H7zm6 0h4v2h-4zm0 4h4v2h-4zm-6 4h10v2H7z',
    next: 'm9 4-2 2 6 6-6 6 2 2 8-8z',
    previous: 'm15 4 2 2-6 6 6 6-2 2-8-8z',
    back: 'm12 4 2 2-5 5h12v2H9l5 5-2 2-8-8z'
};

export function categoryIcon(category) {
    if (category.id === 'all-channels') return 'all';
    const name = category.name.toUpperCase();
    if (/SPORT|F1|MOTOGP|FIFA|NFL|NHL|NBA|MLB|MLS|CRICKET|OLYMPIC/.test(name)) return 'sport';
    if (/KIDS|CHILD|FAMILY|FAMIL|ENFANT|COCUK|FEMIJET/.test(name)) return 'kids';
    if (/CINEMA|MOVIE|FILM|SINEMA/.test(name)) return 'movie';
    if (/MUSIC|MUZIK|MUZIKE|RADIO|RADIOFONO/.test(name)) return 'music';
    if (/NEWS|INFORMATION|HABER|LAJME/.test(name)) return 'news';
    return 'tv';
}

export function createIcon(documentRef, name) {
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PATHS[name] || PATHS.tv);
    svg.appendChild(path);
    return svg;
}
