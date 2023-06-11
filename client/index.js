import { h, render, Router } from './libs/preact.js';
import htm from './libs/htm.js';
import Home from './views/Home.js';
import CaseStudies from '../views/CaseStudies.js';

const html = htm.bind(h);

function App() {
  return html`
    <${Router}>
      <${Home} path="/" />
      <${CaseStudies} path="/case-studies" />
    <//>
  `;
}

render(html`<${App} />`, document.getElementById('root'));