import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import logo from '../logo.js';

const html = htm.bind(h);

export default function Home() {
  return html`
    <div class="home">
      <h1 class="title wordmark">PunkStrat</h1>
      <p>I co-innovate with <span class="highlight">purpose-driven leaders</span> to <span class="highlight">adapt and create</span> for the future. I do so by developing an <span class="highlight">innovation strategy</span> tailored to your business and by unlocking your team's potential through <span class="highlight">coaching</span>.</p>
      <p>Read the <a href="/case-studies" title="PunkStrat Case Studies">case studies</a> to learn about my approach. To fully focus on ongoing client partnerships, new clients are added via referral only.</p>
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}