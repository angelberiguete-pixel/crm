import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const css=readFileSync(new URL('../components/customer-history.module.css',import.meta.url),'utf8');
test('commercial dossier exposes keyboard focus',()=>{assert.match(css,/:focus-visible\{outline:3px/);});
test('commercial dossier honors reduced motion',()=>{assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);});
