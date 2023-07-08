import { h, render, route, Router, useEffect } from './libs/preact.js';
import htm from './libs/htm.js';
import Home from './views/Home.js';
import CaseStudies from '../views/CaseStudies.js';

const html = htm.bind(h);

function useComponentDidMount(callback) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useEffect(callback, []);
}

function App() {
  useComponentDidMount(() => {
    const isHome = window.location.pathname;
    const isHashPath = window.location.hash.startsWith('#/');
    const wasRedirectedFrom404 = isHome && isHashPath;
    if (wasRedirectedFrom404) {
      // "path+search+hash" got attached after `#`. Replace that first `#` and replace history entry with the attachment
      route(window.location.hash.replace('#', ''), true);
    }
  });

  return html`
    <${Router}>
      <${Home} path="/" />
      <${CaseStudies} path="/case-studies" />
    <//>
  `;
}

render(html`<${App} />`, document.getElementById('root'));