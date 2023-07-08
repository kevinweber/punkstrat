import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import logo from '../logo.js';

const html = htm.bind(h);

export default function CaseStudies() {
  return html`
    <div class="subpage">
      <div class="title-bar"><h1 class="title wordmark">PunkStrat</h1><h2 class="title wordmark-reverse">for CryptoPunks</h2></div>
      
      <p>If you're the owner of a <a href="https://cryptopunks.app/">CryptoPunk collectible</a>, you're eligible for a <span class="highlight">free full coaching session</span> on top of a discovery call. Search or ask for <span class="highlight">punk1423</span> in the official CryptoPunks community on Discord or Telegram.</p>
      
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}