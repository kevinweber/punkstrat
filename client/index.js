import { h, render, Router } from './libs/preact.js';
import htm from './libs/htm.js';
import Home from './views/Home.js';
import CaseStudies from '../views/CaseStudies.js';
import CryptoPunks from '../views/CryptoPunks.js';
import Unknown from '../views/Unknown.js';

const html = htm.bind(h);

function App() {
  return html`
    <${Router}>
      <${Home} path="/" />
      <${CaseStudies} path="/case-studies" />
      <${CryptoPunks} path="/cryptopunks" />
      <${Unknown} default />
    <//>
  `;
}

render(html`<${App} />`, document.getElementById('root'));