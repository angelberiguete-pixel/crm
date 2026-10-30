#!/usr/bin/env node
/**
 * 360dialog FREE Sandbox lab, Look Social Media.
 * Local-only, no data or credentials enter the CRM.
 * Usage: node scripts/360dialog-sandbox-lab.mjs webhook|send
 * Requires Node >= 22. Never paste your API key into GitHub/ChatGPT/webhook.site.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BASE = "https://waba-sandbox.360dialog.io";
export function validateWebhookUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error("Introduce una URL HTTPS válida."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("Webhook requiere HTTPS sin credenciales ni fragmentos.");
  }
  if (/^(localhost|.+\.localhost|.+\.local)$/i.test(url.hostname)) {
    throw new Error("El webhook debe estar publicado en HTTPS.");
  }
  return url.href;
}
export function buildSandboxMessage(kind, target, body) {
  if (!["phone", "bsuid"].includes(kind)) throw new Error("Tipo de destinatario no admitido.");
  if (typeof body !== "string" || !body.trim() || body.length > 1000) {
    throw new Error("Mensaje de prueba inválido.");
  }
  const text = {messaging_product:"whatsapp",recipient_type:"individual",type:"text",text:{body:body.trim()}};
  if (kind === "phone") {
    const number = target.replace(/[\s()+-]/g,"");
    if (!/^[1-9][0-9]{7,14}$/.test(number)) throw new Error("Número internacional no válido.");
    text.to = number;
  } else {
    if (!/^[a-zA-Z0-9._:@-]{6,160}$/.test(target)) throw new Error("BSUID no válido.");
    text.recipient = target;
  }
  return text;
}
function secretFromTerminal() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Ejecuta la herramienta desde una terminal interactiva, no en CI.");
  }
  stdout.write("Clave Sandbox (oculta, no se guardará): ");
  return new Promise((resolveSecret,rejectSecret)=>{
    let key="";
    stdin.resume();
    stdin.setRawMode(true);
    const finish=(value,error)=>{
      stdin.off("data",onData);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) rejectSecret(error); else resolveSecret(value);
    };
    const onData=(buf)=>{
      for (const char of buf.toString("utf8")) {
        if (char === "\r" || char === "\n") { finish(key); return; }
        if (char === "\u0003") { finish(null,new Error("Cancelado.")); return; }
        if (char === "\u007f" || char === "\b") {key=key.slice(0,-1);continue;}
        if (char >= " " && key.length < 300) key+=char;
      }
    };
    stdin.on("data",onData);
  });
}
async function callSandbox(path,key,body) {
  const controller=new AbortController();
  const guard=setTimeout(()=>controller.abort(),20000);
  try{
    const result=await fetch(BASE+path,{
      method:"POST",signal:controller.signal,
      headers:{"Content-Type":"application/json","D360-API-KEY":key},
      body:JSON.stringify(body)
    });
    // Do not print response bodies: error bodies might disclose private metadata.
    return result.status;
  } finally {clearTimeout(guard);}
}
export async function main(command) {
  if (!["webhook","send"].includes(command)) {
    console.log("Uso: node scripts/360dialog-sandbox-lab.mjs webhook|send");
    console.log("webhook: registra tu nuevo Webhook.site HTTPS");
    console.log("send: envía UN mensaje de prueba a tu número autorizado, con confirmación");
    return;
  }
  const key=await secretFromTerminal();
  if (!key || key.length<12 || /[\s]/.test(key)) throw new Error("Clave de Sandbox inválida.");
  const rl=createInterface({input,output:stdout});
  try {
    if (command==="webhook") {
      const url=validateWebhookUrl((await rl.question("Webhook HTTPS privado y recién generado: ")).trim());
      const answer=(await rl.question("Registrar este webhook SOLO para Sandbox? Escribe SI: ")).trim();
      if (answer!=="SI"){console.log("Operación cancelada.");return;}
      const status=await callSandbox("/v1/configs/webhook",key,{url});
      console.log("Respuesta del registro:",status,status===200?"Correcto":"No se pudo confirmar; comprueba URL y clave.");
      return;
    }
    const kind=(await rl.question("Destinatario (phone o bsuid según tu mensaje START): ")).trim();
    const target=(await rl.question("Tu número internacional o BSUID autorizado: ")).trim();
    const message=(await rl.question("Texto ficticio para la prueba: ")).trim();
    const payload=buildSandboxMessage(kind,target,message);
    const answer=(await rl.question("Esto consume 1 de las 25 solicitudes. Escribe ENVIAR: ")).trim();
    if (answer!=="ENVIAR"){console.log("Operación cancelada.");return;}
    const status=await callSandbox("/v1/messages",key,payload);
    console.log("Respuesta del envío:",status,status===201?"Solicitud aceptada":"No se pudo confirmar; NO reintentar automáticamente.");
  } finally {rl.close();}
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  main(process.argv[2]).catch(error=>{
    // Sanitized local error without response contents, phone numbers or secrets.
    console.error("No completado:",error?.name==="AbortError"?"Tiempo agotado":error.message);
    process.exitCode=1;
  });
}
