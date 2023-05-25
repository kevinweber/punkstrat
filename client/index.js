import { h, render } from './libs/preact.js';
import htm from './libs/htm.js';
import logo from './logo.js';

const html = htm.bind(h);

function App() {
  return html`
    <div>
      <h1 class="wordmark">PunkStrat</h1>
      <p>We partner with founders who are shaping the future. Our services include <span class="highlight">business strategy</span>, <span class="highlight">executive coaching</span>, and <span class="highlight">group coaching</span>.</p>
      <p>We prefer to keep a low profile and take on new clients <span class="highlight">by referral only</span>. Our sole focus is your success.</p>
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('root'));