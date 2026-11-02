import {readFileSync} from "node:fs";
import {test} from "node:test";
import assert from "node:assert/strict";

const source=readFileSync(new URL("../components/family-power-client-settings.tsx",import.meta.url),"utf8");

test("Family Power settings avoid internal staff names and blocked session routes",()=>{
  assert.doesNotMatch(source,/Ángel Berigüete/);
  assert.doesNotMatch(source,/href="\/crm\/sessions"/);
  assert.match(source,/consulta de sesiones está pendiente de habilitación segura/);
  assert.match(source,/permisos de la plataforma están protegidos/);
});

test("Family Power retains its official brand and authorized integrations links",()=>{
  assert.match(source,/Family Power · Administración/);
  assert.match(source,/href="\/crm\/integrations"/);
  assert.match(source,/href="\/crm\/quotations"/);
});
