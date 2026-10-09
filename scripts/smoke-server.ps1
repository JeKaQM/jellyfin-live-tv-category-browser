param(
    [string]$ServerVersion = '12.2.0',
    [string]$ServerDirectory,
    [string]$PluginDirectory = 'artifacts/plugin',
    [string]$BasePath = '',
    [int]$Port = 18096,
    [switch]$SkipBrowser
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$metadata = Get-Content (Join-Path $projectRoot 'web/compatibility.json') -Raw | ConvertFrom-Json
if ($ServerVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Use a complete numeric ServerVersion, such as 12.2.0' }
if ($BasePath -and $BasePath -notmatch '^/[a-zA-Z0-9_-]+$') { throw 'BasePath must be empty or one safe path segment' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw 'The selected test port is already in use' }
$line = ($ServerVersion -split '\.')[0..1] -join '.'
$artifactVersion = if (($ServerVersion -split '\.')[2] -eq '0') { $line } else { $ServerVersion }
if (-not $ServerDirectory) {
    $downloadRoot = Join-Path $projectRoot "build/server-$ServerVersion"
    $ServerDirectory = Join-Path $downloadRoot 'system/jellyfin'
    if (-not (Test-Path -LiteralPath (Join-Path $ServerDirectory 'jellyfin.exe'))) {
        New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null
        $zipPath = Join-Path $downloadRoot "jellyfin_$artifactVersion-amd64.zip"
        Invoke-WebRequest -Uri "https://repo.jellyfin.org/files/server/windows/stable/v$artifactVersion/amd64/jellyfin_$artifactVersion-amd64.zip" -OutFile $zipPath
        $extractionDirectory = Join-Path $downloadRoot 'system'
        New-Item -ItemType Directory -Force -Path $extractionDirectory | Out-Null
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractionDirectory
    }
}
$ServerDirectory = (Resolve-Path -LiteralPath $ServerDirectory).Path
$PluginDirectory = (Resolve-Path -LiteralPath $PluginDirectory).Path
$runRoot = Join-Path $projectRoot ('build/server-smoke-' + $line + '-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runRoot | Out-Null
foreach ($folder in @('data', 'cache', 'config', 'logs', 'data/plugins/Live TV Categories_test')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $runRoot $folder) | Out-Null
}
Copy-Item -LiteralPath $PluginDirectory -Destination (Join-Path $runRoot 'plugin-source') -Recurse
Get-ChildItem -LiteralPath (Join-Path $runRoot 'plugin-source') | Copy-Item -Destination (Join-Path $runRoot 'data/plugins/Live TV Categories_test') -Recurse
$fixturePath = Join-Path $runRoot 'fixture.m3u'
$playlist = [System.Collections.Generic.List[string]]::new()
$playlist.Add('#EXTM3U')
foreach ($number in 1..205) {
    $playlist.Add("#EXTINF:-1 tvg-id=`"smoke-news-$number`" group-title=`"News`",News channel $number")
    $playlist.Add("http://127.0.0.1:18097/news/$number")
}
foreach ($entry in @(@('sport', 'Sports', 'Smoke Sport'), @('world', 'Café & World', 'Smoke World'), @('ungrouped', '', 'Smoke Ungrouped'))) {
    $playlist.Add("#EXTINF:-1 tvg-id=`"smoke-$($entry[0])`" group-title=`"$($entry[1])`",$($entry[2])")
    $playlist.Add("http://127.0.0.1:18097/$($entry[0])")
}
[IO.File]::WriteAllLines($fixturePath, $playlist, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $runRoot 'config/network.xml'), @"
<?xml version="1.0" encoding="utf-8"?>
<NetworkConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <EnableIPv4>true</EnableIPv4><EnableIPv6>false</EnableIPv6>
  <InternalHttpPort>$Port</InternalHttpPort><PublicHttpPort>$Port</PublicHttpPort>
  <BaseUrl>$BasePath</BaseUrl><EnableRemoteAccess>false</EnableRemoteAccess>
  <LocalNetworkAddresses><string>127.0.0.1</string></LocalNetworkAddresses>
</NetworkConfiguration>
"@)
$baseUrl = "http://127.0.0.1:$Port$BasePath"
$clientHeader = 'MediaBrowser Client="LiveTvCategoriesTests", Device="Smoke", DeviceId="ltvc-ci-smoke", Version="0.6.0.0"'
$headers = $null
$process = $null
$checks = 0
function Assert-Test([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
    $script:checks++
    Write-Output "PASS: $message"
}
function Request-Status([string]$route, [hashtable]$requestHeaders = @{}) {
    return [int](Invoke-WebRequest -Uri "$baseUrl$route" -Headers $requestHeaders -SkipHttpErrorCheck).StatusCode
}
function Json-Post([string]$route, $body, [hashtable]$requestHeaders = @{}) {
    return Invoke-RestMethod -Method Post -Uri "$baseUrl$route" -Headers $requestHeaders -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20)
}
try {
    $arguments = @('--service', '--nonetchange', '-d', ('"' + (Join-Path $runRoot 'data') + '"'), '-C', ('"' + (Join-Path $runRoot 'cache') + '"'), '-c', ('"' + (Join-Path $runRoot 'config') + '"'), '-l', ('"' + (Join-Path $runRoot 'logs') + '"'), '-w', ('"' + (Join-Path $ServerDirectory 'jellyfin-web') + '"'))
    $process = Start-Process -FilePath (Join-Path $ServerDirectory 'jellyfin.exe') -ArgumentList $arguments -WorkingDirectory $ServerDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runRoot 'stdout.log') -RedirectStandardError (Join-Path $runRoot 'stderr.log')
    $public = $null
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if ($process.HasExited) { throw "Test server exited; logs: $runRoot" }
        try {
            $public = Invoke-RestMethod -Uri "$baseUrl/System/Info/Public" -TimeoutSec 2
            if ((Request-Status '/LiveTvCategories/ui/') -eq 200 -and (Request-Status '/Startup/User') -eq 200) { break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    Assert-Test ($public.Version -eq $ServerVersion) 'Expected official Jellyfin version starts'
    Assert-Test ((Request-Status '/LiveTvCategories/ui/') -eq 200) 'Independent category UI is available without replacing stock Web'
    $ui = Invoke-WebRequest -Uri "$baseUrl/LiveTvCategories/ui/" -SkipHttpErrorCheck
    Assert-Test (($ui.Headers['Cache-Control'] -join ',') -match 'no-store') 'Independent UI does not keep stale upgrade assets'
    $web = Invoke-WebRequest -Uri "$baseUrl/web/index.html" -SkipHttpErrorCheck
    $expectedBundledWeb = $ServerVersion -eq $metadata.serverWebVersion -and (Test-Path -LiteralPath (Join-Path $PluginDirectory 'web/index.html'))
    Assert-Test ((-not [string]::IsNullOrWhiteSpace(($web.Headers['X-Live-TV-Categories-Web'] -join ''))) -eq $expectedBundledWeb) 'Full Web replacement remains restricted to the exact tested version'
    Assert-Test ((Request-Status '/LiveTvCategories') -eq 401) 'Category API requires authentication'
    Assert-Test ((Request-Status '/LiveTvCategories/Compatibility') -eq 401) 'Compatibility report requires authentication'
    Invoke-RestMethod -Uri "$baseUrl/Startup/User" | Out-Null
    $password = [Guid]::NewGuid().ToString('N') + '!'
    Json-Post '/Startup/User' @{ Name = 'fixture-admin'; Password = $password } | Out-Null
    Invoke-RestMethod -Method Post -Uri "$baseUrl/Startup/Complete" | Out-Null
    $login = Json-Post '/Users/AuthenticateByName' @{ Username = 'fixture-admin'; Pw = $password } @{ Authorization = $clientHeader }
    $headers = @{ Authorization = $clientHeader + ', Token="' + $login.AccessToken + '"' }
    Assert-Test (-not [string]::IsNullOrWhiteSpace($login.AccessToken)) 'Modern session authentication succeeds'
    $tuner = @{ Type = 'm3u'; Url = $fixturePath; FriendlyName = 'Smoke M3U'; TunerCount = 1; AllowStreamSharing = $true }
    Json-Post '/LiveTv/TunerHosts' $tuner $headers | Out-Null
    $channels = $null
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        $channels = Invoke-RestMethod -Uri "$baseUrl/LiveTv/Channels?userId=$($login.User.Id)&addCurrentProgram=false" -Headers $headers
        if ($channels.TotalRecordCount -eq 208) { break }
        Start-Sleep -Milliseconds 500
    }
    Assert-Test ($channels.TotalRecordCount -eq 208) 'Native guide refresh persists the complete M3U fixture'
    $categories = Invoke-RestMethod -Uri "$baseUrl/LiveTvCategories" -Headers $headers
    Assert-Test ($categories.Count -eq 4) 'Dynamic categories include Unicode and ungrouped channels'
    $news = $categories | Where-Object name -eq 'News'
    Assert-Test ($news.channelCount -eq 205) 'Category counts match native channels'
    Assert-Test (($categories | Where-Object name -eq 'Café & World').channelCount -eq 1) 'Unicode category metadata is retained'
    $first = Invoke-RestMethod -Uri "$baseUrl/LiveTvCategories/$($news.id)/Channels?startIndex=0&limit=100" -Headers $headers
    $second = Invoke-RestMethod -Uri "$baseUrl/LiveTvCategories/$($news.id)/Channels?startIndex=100&limit=100" -Headers $headers
    Assert-Test ($first.Items.Count -eq 100 -and $second.Items.Count -eq 100 -and $first.Items[0].Id -ne $second.Items[0].Id -and $first.TotalRecordCount -eq 205) 'Bounded category pages contain distinct Jellyfin channels'
    Assert-Test ($first.Items[0].Type -eq 'TvChannel') 'Channel DTOs remain stock-Jellyfin compatible'
    Assert-Test ((Request-Status "/LiveTvCategories/$($news.id)/Channels?limit=251" $headers) -eq 400) 'Oversized page limits are rejected'
    Assert-Test ((Request-Status '/LiveTvCategories/missing/Channels' $headers) -eq 404) 'Missing categories return 404'
    Invoke-RestMethod -Method Post -Uri "$baseUrl/Auth/Keys?app=LiveTvCategoriesSmoke" -Headers $headers | Out-Null
    $keys = Invoke-RestMethod -Uri "$baseUrl/Auth/Keys" -Headers $headers
    $apiKey = ($keys.Items | Where-Object AppName -eq 'LiveTvCategoriesSmoke').AccessToken
    $keyHeaders = @{ Authorization = 'MediaBrowser Token="' + $apiKey + '"' }
    $keyCategories = Invoke-RestMethod -Uri "$baseUrl/LiveTvCategories?userId=$($login.User.Id)" -Headers $keyHeaders
    Assert-Test ($keyCategories.Count -eq 4) 'Supported API-key authentication works without legacy headers'
    $viewer = Json-Post '/Users/New' @{ Name = 'fixture-viewer' } $headers
    $viewerPassword = [Guid]::NewGuid().ToString('N') + '!'
    Json-Post "/Users/$($viewer.Id)/Password" @{ CurrentPw = ''; NewPw = $viewerPassword } $headers | Out-Null
    $viewerLogin = Json-Post '/Users/AuthenticateByName' @{ Username = 'fixture-viewer'; Pw = $viewerPassword } @{ Authorization = $clientHeader }
    $viewerHeaders = @{ Authorization = $clientHeader + ', Token="' + $viewerLogin.AccessToken + '"' }
    Assert-Test ((Request-Status '/LiveTvCategories' $viewerHeaders) -eq 200) 'Normal non-administrator users can browse categories'
    Assert-Test ((Request-Status '/LiveTvCategories/Diagnostics' $viewerHeaders) -eq 403) 'Detailed diagnostics remain administrator-only'
    Assert-Test ((Request-Status ('/LiveTvCategories?userId=' + $login.User.Id) $viewerHeaders) -eq 403) 'Sessions cannot request another user category view'
    $compatibility = Invoke-RestMethod -Uri "$baseUrl/LiveTvCategories/Compatibility" -Headers $viewerHeaders
    Assert-Test ([string]$compatibility.apiContractVersion -eq '1') 'Authenticated capability report identifies the category contract'
    Assert-Test ($compatibility.psobject.Properties.Name -ccontains 'apiContractVersion') 'Capability field names remain stable under Jellyfin JSON settings'
    if (-not $SkipBrowser) {
        $env:LTVC_TEST_URL = $baseUrl
        $env:LTVC_TEST_USERNAME = 'fixture-viewer'
        $env:LTVC_TEST_PASSWORD = $viewerPassword
        $env:LTVC_TEST_BUNDLED_WEB = [string]$expectedBundledWeb
        node (Join-Path $PSScriptRoot 'browser-smoke.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Real-server browser flow failed' }
        Assert-Test $true 'Real browser login, channel handoff, Back and focus pass'
    }
    $viewerPolicy = $viewer.Policy
    $viewerPolicy.EnableLiveTvAccess = $false
    Json-Post "/Users/$($viewer.Id)/Policy" $viewerPolicy $headers | Out-Null
    Assert-Test ((Request-Status '/LiveTvCategories' $viewerHeaders) -eq 403) 'Revoked Live TV permission is enforced after caching'
    [pscustomobject]@{ Server = $ServerVersion; BasePath = $BasePath; PassedChecks = $checks; Logs = $runRoot } | Format-List
} finally {
    Remove-Item Env:LTVC_TEST_URL, Env:LTVC_TEST_USERNAME, Env:LTVC_TEST_PASSWORD, Env:LTVC_TEST_BUNDLED_WEB -ErrorAction SilentlyContinue
    if ($headers) { try { Invoke-RestMethod -Method Post -Uri "$baseUrl/System/Shutdown" -Headers $headers | Out-Null } catch { } }
    if ($process -and -not $process.HasExited -and -not $process.WaitForExit(10000)) { Stop-Process -Id $process.Id }
}
