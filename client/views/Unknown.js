import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

export default function Home() {
  return html`
<div class="subpage">
  <div class="title-bar"><h1 class="title wordmark">PunkStrat</h1><h2 class="title wordmark-reverse">404</h2></div>
  <${LogoLinkHome}/>
</div>
  `;
}