import { h, render } from './libs/preact.js';
import htm from './libs/htm.js';
import logo from './logo.js';

const html = htm.bind(h);

function App() {
  return html`
    <div>
      <div class="logo-wrapper">${logo()}</div>
      <p>We partner with founders who are shaping the future. Our services encompass principled <span class="highlight">strategies</span> and confidential executive <span class="highlight">coaching</span>.</p>
      <p>We prefer to keep a low profile ourselves and take on new clients <span class="highlight">by referral only</span>. Our sole focus is your success.</p>
      <h1 class="wordmark">PunkStrat</h1>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('root'));