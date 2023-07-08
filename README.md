# PunkStrat

## Adding new pages

* The site is served using static GitHub Pages. During development, a node server tries to emulate static rendering behavior.
* When adding a new page, make sure to create a matching HTML file that is an exact copy of `client/index.html`.
* Then add a route to `client/index.js` pointing to the respective view file that includes the content for the page.
* If DevTools during development show "404 (Not Found)" for a page but the content is still shown, it likely means that there's no matching HTML file for the current URL and GitHub Pages will show a 404 once the code is deployed.

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

## Known challenges

* Manually creating HTML files is tedious. HTML code redundancies could be reduced using Jekyll. But adding support for this adds complexity to this project. Another approach could be to automatically redirect from the 404.html to the index.html, then rely on client-rendering for every page. This, however, results in at least a brief flicker of the URL when the redirect is happening and crawlers like Brave's WayBack Machine integration could falsely assume that a non-existing page is shown.
