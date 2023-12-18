import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

export default function Home() {
  return html`
    <div class="home">
      <h1 class="title wordmark">PunkStrat</h1>
      <p><span class="highlight">We partner with tech founders and executives to shape the future through visionary leadership and cutting-edge technology products.</span></p>
      <p>PunkStrat℠ coaching involves tailored strategies, leadership development, and innovation acceleration, with a unique blend of expertise and creativity.</p>
      <!--<p>To learn more about my approach, read the <a href="/case-studies" title="PunkStrat Case Studies">case studies</a>.</p>
      <p>If you are ready to take your technology leadership to the next level, schedule a discovery call with me today.</p>-->
      <${LogoLinkHome}/>
    </div>
  `;
}