import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';
import Logo from './Logo.js';

const html = htm.bind(h);

export default function LogoLinkHome() {
    return html`<a href="/" class="unstyled logo-wrapper" title="Navigate to PunkStrat main web page"><${Logo}/></a>`;
}