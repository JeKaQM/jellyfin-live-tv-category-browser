function createChevron(documentRef) {
    const chevron = documentRef.createElement('span');
    chevron.className = 'material-icons chevron_right';
    chevron.setAttribute('aria-hidden', 'true');
    return chevron;
}

function createEntry(documentRef, entry, onSelect) {
    const row = documentRef.createElement('div');
    row.className = 'sectionTitleContainer sectionTitleContainer-cards padded-left padded-right';

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'button-flat button-flat-mini sectionTitleTextButton';
    button.dataset.categoryId = entry.id;

    const heading = documentRef.createElement('h2');
    heading.className = 'sectionTitle sectionTitle-cards';
    heading.textContent = entry.channelCount == null
        ? entry.name
        : `${entry.name} (${entry.channelCount})`;

    button.append(heading, createChevron(documentRef));
    button.addEventListener('click', () => onSelect(entry));
    row.append(button);
    return row;
}

/**
 * Renders only the category rows. The surrounding Programmes tab and all other
 * Live TV tabs remain owned by Jellyfin Web.
 */
export function renderCategoryLanding(container, state, onSelect) {
    if (!container || typeof container.replaceChildren !== 'function') {
        throw new TypeError('container must be a DOM element');
    }
    if (!state || !Array.isArray(state.entries)) {
        throw new TypeError('state.entries must be an array');
    }
    if (typeof onSelect !== 'function') {
        throw new TypeError('onSelect must be a function');
    }

    const documentRef = container.ownerDocument;
    const fragment = documentRef.createDocumentFragment();

    if (state.error) {
        const message = documentRef.createElement('div');
        message.className = 'padded-left padded-right padded-bottom';
        message.setAttribute('role', 'status');
        message.textContent = 'Live TV categories could not be loaded. All Channels is still available.';
        fragment.append(message);
    } else if (state.entries.length === 1) {
        const message = documentRef.createElement('div');
        message.className = 'padded-left padded-right padded-bottom';
        message.setAttribute('role', 'status');
        message.textContent = 'No Live TV categories are available.';
        fragment.append(message);
    }

    for (const entry of state.entries) {
        fragment.append(createEntry(documentRef, entry, onSelect));
    }

    container.replaceChildren(fragment);
}
