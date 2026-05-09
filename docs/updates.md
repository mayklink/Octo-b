# Octob Updates

Octob uses `electron-updater` with GitHub Releases.

## Repository

The update feed is configured in `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: mayklink
  repo: Octo-b
  private: true
  releaseType: release
```

## Private Repository Token

Because the repository is private, the installed app must have a token available when it checks
for updates. Octob reads either of these environment variables:

```powershell
$env:OCTOB_GITHUB_TOKEN = 'ghp_...'
```

or:

```powershell
$env:GH_TOKEN = 'ghp_...'
```

The token needs read access to releases/assets in `mayklink/Octo-b`.

## Release Artifacts

Build/publish with `electron-builder` so GitHub Releases contains the generated artifacts and
metadata, including the Windows installer and `latest.yml`. The updater will check the private
GitHub release feed and download the artifact after authentication.

Do not ship a broad personal token inside the application source. For external customers, prefer
a public release feed or a narrow backend proxy that controls access.
