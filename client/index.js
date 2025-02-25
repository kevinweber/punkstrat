import { h, render, Router } from './libs/preact.js';
import htm from './libs/htm.js';
import Home from './views/Home.js';
import CaseStudies from './views/CaseStudies.js';
import CryptoPunks from './views/CryptoPunks.js';
import PersonalAgent from './views/PersonalAgent.js';
import Wheel from './tools/views/Wheel.js';
import Unknown from './views/Unknown.js';

const html = htm.bind(h);

function App() {
  function handleRouteChange({ current }) {
    if (document.title !== current.props.title) {
      document.title = current.props.title;
    }
  }

  return html`
    <${Router} onChange="${handleRouteChange}">
      <${Home} path="/" title="PunkStrat" />
      <${CaseStudies} path="/case-studies" title="PunkStrat Case Studies" />
      <${CryptoPunks} path="/cryptopunks" title="PunkStrat for CryptoPunks" />
      <${PersonalAgent} path="/personal-agent" title="PunkStrat Personal Agent" />
      <${Wheel} path="/tools/wheel" title="PunkStrat Wheel" />
      <${Unknown} default title="PunkStrat 404" />
    <//>
  `;
}

render(html`<${App} />`, document.getElementById('root'));