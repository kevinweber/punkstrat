import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import logo from '../logo.js';

const html = htm.bind(h);

export default function Home() {
  return html`
    <div class="home">
      <h1 class="title wordmark">PunkStrat</h1>
      <p>I co-innovate with <span class="highlight">purpose-driven leaders</span> through <span class="highlight">business coaching</span>. Let me do us a favor: I skip my marketing gibberish. Your friends probably referred you here, ask them. Then let's get to it:</p>
      <ol>
        <li>You book a free 20-30 min coaching session with me.</li>
        <li>We vibe – or we don't.</li>
        <li>It's time to transform your business.</li>
      </ol>
      <p>To learn about my experience, read the <a href="/case-studies" title="PunkStrat Case Studies">case studies</a>.</p>
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}