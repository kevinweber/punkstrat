import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import LogoLinkHome from '../components/LogoLinkHome.js';

const html = htm.bind(h);

export default function Home() {
  return html`
    <div class="home">
      <h1 class="title wordmark">PunkStrat</h1>
      <p><span class="highlight">Rethink Success, Rewrite the Rules.</span></p>
      <p>PunkStrat℠ is coaching for tech leaders ready to reinvent themselves for long-term success and fulfillment.</p>
      <p>I combine 12+ years of tech experience with a personalized coaching approach to help you find your voice as a leader and drive meaningful impact while prioritizing well-being and personal growth.</p>     
      <!--<p>To learn more about our approach, read the <a href="/case-studies" title="PunkStrat Case Studies">case studies</a>.</p>-->
      <p>Let's rethink success, together. <a href="https://www.linkedin.com/in/kevinchrisweber/" title="Kevin Weber on LinkedIn">Contact me</a>.</p>
      <${LogoLinkHome}/>
    </div>
  `;
}