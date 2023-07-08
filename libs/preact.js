
/**
 * Run `npm run build:libs:preact` for one optimized Preact bundle that suits all the app's needs.
 * This is necessary because if we would import the module versions of those packages on the fly, the conflicting Preact versions would throw a cryptic error:
 * "Cannot read properties of null (reading '__H')"
 */
import { h, render, Component } from 'preact';
// import { useEffect } from 'preact/hooks';
import { Router } from 'preact-router';

export {
    h, render, Component,
    Router,
};