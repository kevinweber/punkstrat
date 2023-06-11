import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import logo from '../logo.js';

const html = htm.bind(h);

export default function CaseStudies() {
  return html`
    <div class="subpage">
      <div class="title-bar"><h1 class="title wordmark">PunkStrat</h1><h2 class="title wordmark-reverse">Case Studies</h2></div>
      
      <article>
        <h3 class="title">Case 1……</h3>
        <p>Challenge: abc</p>
        <p>Approach: abc</p>
        <p>Results: abc</p>
      </article>

      <article>
        <h3 class="title">Case 2……</h3>
        <p>Challenge: abc</p>
        <p>Approach: abc</p>
        <p>Results: abc</p>
      </article>
      
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}