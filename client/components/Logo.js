import { h } from '../libs/preact.js';
import htm from '../libs/htm.js';

const html = htm.bind(h);

export default function Logo() {
    return html`
        <svg clip-rule="evenodd" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" viewBox="0 0 11 11" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <path d="m0 0h11v11h-11z" fill="none"/>
            <path fill="currentColor" d="m11 2h-11v-2h11zm-11 1h3v2h2v-2h3v2h2v-2h1v8h-11zm8 4v-1h-2v1zm0 3v-1h-3v1z"/>
        </svg>`;
}