import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import logo from '../logo.js';

const html = htm.bind(h);

export default function Home() {
  return html`
    <div class="home">
      <h1 class="title wordmark">PunkStrat</h1>
      <p>I partner with <span class="highlight">technical founders and executives</span> like CTOs, CIOs and CXOs to help them <span class="highlight">envision and deliver cutting-edge technology products and engineering culture</span> by providing coaching that unleashes their leadership skills, strategic thinking and innovation capabilities.</p>
      <!--<p>To learn more about my approach, read the <a href="/case-studies" title="PunkStrat Case Studies">case studies</a>.</p>
      <p>If you are ready to take your technology leadership to the next level, schedule a discovery call with me today.</p>-->
      <div class="logo-wrapper">${logo()}</div>
    </div>
  `;
}