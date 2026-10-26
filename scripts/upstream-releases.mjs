export function releaseVersion(tag) {
    const match = typeof tag === 'string' && /^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag);
    if (!match) throw new Error('Upstream release uses an unrecognized version format; review compatibility');
    return `${match[1]}.${match[2]}.${match[3] ?? '0'}`;
}

export async function latestRelease(repository, { fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
    if (!['jellyfin', 'jellyfin-web'].includes(repository)) throw new Error('Unexpected upstream repository');
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(`https://api.github.com/repos/jellyfin/${repository}/releases/latest`, {
        headers, signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`Could not check latest ${repository} stable release: ${response.status}`);
    const release = await response.json();
    releaseVersion(release.tag_name);
    if (release.draft || release.prerelease) throw new Error('Expected a published stable upstream release');
    return release;
}

export function assertStableSupport(metadata, serverRelease, webRelease) {
    const serverVersion = releaseVersion(serverRelease.tag_name);
    const webVersion = releaseVersion(webRelease.tag_name);
    const normalize = value => /^\d+\.\d+\.\d+(?:\.0)?$/.test(value) ? value.split('.').slice(0, 3).join('.') : null;
    const apiSupported = (metadata.apiSupportedServerVersions ?? []).map(normalize);
    const webSupported = (metadata.supportedServerVersions ?? []).map(normalize);
    const problems = [];
    if (!apiSupported.includes(serverVersion)) problems.push(`Server ${serverVersion} has not been declared runtime-tested`);
    if (!webSupported.includes(serverVersion)) problems.push(`Bundled Web is not declared tested on latest Server ${serverVersion}`);
    if (metadata.serverWebVersion !== webVersion) {
        problems.push(`Web ${webVersion} differs from the pinned, tested integration ${metadata.serverWebVersion}`);
    }
    if (problems.length) throw new Error(`Jellyfin stable release drift: ${problems.join('; ')}. Review upstream changes and run compatibility tests before updating declarations. Nothing was auto-enabled.`);
    return { serverVersion, webVersion };
}
