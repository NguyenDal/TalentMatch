# Public entry measurement

This comparison measures the JavaScript and CSS listed as entrypoints in the
production asset manifest. It measures asset bytes, not load time or paint time.

Both builds use the same installed dependencies, Node version, production build
command, and `GENERATE_SOURCEMAP=false`. Each asset is compressed separately at
gzip level 5, matching the backend's configured compression level. Browser cache,
network latency, Render cold starts, and later route chunks are outside this metric.

Run from `frontend/` in PowerShell:

```powershell
$env:GENERATE_SOURCEMAP = 'false'
npm run build
node scripts/measure-build.cjs
```

`before.json` records the baseline before the authenticated shell was split out;
`after.json` records the same measurement after the change.

Measured locally with Node v24.14.0:

| Public entry assets | Before, bytes | After, bytes | Reduction |
| --- | ---: | ---: | ---: |
| JavaScript, uncompressed | 307,069 | 301,668 | 5,401 |
| CSS, uncompressed | 50,913 | 44,888 | 6,025 |
| JavaScript, gzip level 5 | 96,925 | 95,932 | 993 (1.02%) |
| CSS, gzip level 5 | 11,041 | 10,029 | 1,012 (9.17%) |
| Combined, gzip level 5 | 107,966 | 105,961 | 2,005 (1.86%) |

The authenticated navigation and its styles now load only when entering the
signed-in workspace. Public visitors avoid these assets; signed-in visitors load
an additional cacheable JavaScript/CSS chunk pair. The landing page's first-screen
walkthrough and the existing authentication behavior are unchanged.

These are modest, reproducible transfer-size savings, not measured latency gains.
The comparison excludes HTML, images, and later route chunks. Deployment builds
may have different exact bytes if their Node version or dependencies differ.

Validation: 58 frontend tests across 12 suites passed, including signed-in home,
account-menu, and direct settings-route coverage. The production build succeeded.

## Cumulative comparison

`baseline-0168352.json` records a fresh production build of commit
`01683525fcf05261334ece9292f2b95f2ade26af`, before route splitting and the later
authenticated-shell split. Its frontend was extracted into an isolated, ignored
directory and built with the same installed dependencies, Node v24.14.0,
`GENERATE_SOURCEMAP=false`, and measurement script as the current build.
Both `package.json` and `package-lock.json` are unchanged between the two versions.
The lockfile's SHA-256 is
`40262115CCE97B03379073A6CD14C0772664CCED2C456B3878879141B9BC26B6`.

| Public entry assets | Baseline bytes | Current bytes | Reduction |
| --- | ---: | ---: | ---: |
| JavaScript, uncompressed | 390,156 | 301,668 | 88,488 |
| CSS, uncompressed | 95,167 | 44,888 | 50,279 |
| JavaScript, gzip level 5 | 114,695 | 95,932 | 18,763 (16.36%) |
| CSS, gzip level 5 | 18,618 | 10,029 | 8,589 (46.13%) |
| Combined, gzip level 5 | 133,313 | 105,961 | 27,352 (20.52%) |

This cumulative comparison spans the frontend changes between that commit and
the current version, including styling updates; it is not a controlled timing
benchmark of an individual optimization. Route assets are deferred until needed,
not eliminated from the application's overall download size.
