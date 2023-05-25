# PunkStrat

## Dev notes

* Run `npm install` to get the latest NPM dependencies.
* Run `npm run build:libs:preact` and `npm run build:libs:htm` to update the Preact and HTM dependencies.
* Run `npm run dev` to run a Node server in development, then view the site on <http://localhost:8000/>.

To upgrade dependencies to latest minor version quickly:

* Run `npm upgrade --save`

Tech stack:

* No build for the app code. Less headaches.
* Third-party dependencies are imported from absolute URLs via skypack or unpkg, or they were bundled manually using esbuild.
* Preact instead of React: <https://preactjs.com/>
* HTM instead of JSX: <https://github.com/developit/htm>
* Routing: <https://github.com/preactjs/preact-router>
