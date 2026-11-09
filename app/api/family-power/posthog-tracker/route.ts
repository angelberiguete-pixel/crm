import { NextResponse } from "next/server";

// The public PostHog project token may be sent to a browser. Do NOT expose personal API keys.
export const dynamic = "force-dynamic";
export function GET() {
 const token = process.env.FP_POSTHOG_TOKEN;
 const host = process.env.FP_POSTHOG_HOST;
 if (!token || !host || !/^phc_[a-z0-9]+$/i.test(token) ||
     !/^https:\/\/(?:us|eu)\.i\.posthog\.com$/.test(host)) {
  return new NextResponse("/* Family Power analytics not yet configured */", {
   status:200,headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store"}
  });
 }
 const config = JSON.stringify({token,host});
 const script = [
  "(function(){",
  "if(window.__fpBehaviorLoaded)return;window.__fpBehaviorLoaded=true;",
  "if(location.hostname!=='family-power-v136-demo.vercel.app')return;",
  "if(navigator.globalPrivacyControl===true||navigator.doNotTrack==='1')return;",
  "var options="+config+";",
  "var consentKey='fp_website_analytics_consent_v1';",
  "var choice='';try{choice=localStorage.getItem(consentKey)||'';}catch(e){}",
  "function remember(v){try{localStorage.setItem(consentKey,v);}catch(e){}}",
  "function start(){",
  // Standard PostHog HTML loader, executed only after affirmative consent.
  "!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],u.toString=function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e},u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep'.split(' '),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);",
  "window.posthog.init(options.token,{api_host:options.host,defaults:'2026-08-30',",
  "  capture_pageview:false,autocapture:false,disable_session_recording:true,",
  "  persistence:'memory',disable_persistence:true,person_profiles:'never',",
  "  disable_surveys:true,enable_recording_console_log:false,",
  "  session_recording:{maskAllInputs:true,maskTextSelector:'*',recordCanvas:false}});",
  "var ph=window.posthog;",
  "var q=new URLSearchParams(location.search);",
  "function safe(x){return typeof x==='string'?x.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,60):'';}",
  "var campaign={utm_source:safe(q.get('utm_source')),utm_medium:safe(q.get('utm_medium')),utm_campaign:safe(q.get('utm_campaign'))};",
  "function send(event,properties){ph.capture(event,Object.assign({app:'family_power',page_path:location.pathname,device:innerWidth<768?'mobile':innerWidth<1100?'tablet':'desktop'},campaign,properties||{}));}",
  "send('$pageview',{$current_url:location.origin+location.pathname});",
  "function zone(el){var s=el&&el.closest?el.closest('section,[data-track-section],main,header,footer'):null;return safe(s&&(s.getAttribute('data-track-section')||s.id||s.tagName.toLowerCase()))||'general';}",
  "document.addEventListener('click',function(ev){",
  " var el=ev.target&&ev.target.closest?ev.target.closest('a,button,[role=button]'):null;if(!el)return;",
  " var href=(el.getAttribute('href')||'').toLowerCase();",
  " var key=safe(el.getAttribute('data-analytics')||el.id||((href.indexOf('wa.me')>=0||href.indexOf('whatsapp')>=0)?'whatsapp':href.indexOf('tel:')===0?'telefono':href.indexOf('#')===0?'enlace_seccion':el.tagName.toLowerCase()));",
  " send('fp_button_click',{target_key:key,section_key:zone(el),x_percent:Math.round(ev.clientX/Math.max(1,innerWidth)*100),y_percent:Math.round(ev.clientY/Math.max(1,innerHeight)*100)});",
  " if(key==='whatsapp')send('fp_whatsapp_click',{section_key:zone(el)});",
  " if(key==='telefono')send('fp_phone_click',{section_key:zone(el)});",
  "},true);",
  "var milestones={};function scroll(){var h=Math.max(1,document.documentElement.scrollHeight-innerHeight);var value=Math.min(100,Math.round(scrollY/h*100));",
  " [25,50,75,90,100].forEach(function(d){if(value>=d&&!milestones[d]){milestones[d]=true;send('fp_scroll_depth',{depth_percent:d});}});}",
  "addEventListener('scroll',scroll,{passive:true});scroll();",
  "var seenForm=false;document.addEventListener('focusin',function(ev){if(seenForm)return;if(ev.target&&ev.target.closest&&ev.target.closest('form')){seenForm=true;send('fp_form_start',{section_key:'cotizacion'});}},true);",
  "document.addEventListener('submit',function(ev){if(ev.target&&ev.target.matches&&ev.target.matches('form'))send('fp_form_submit',{section_key:'cotizacion'});},true);",
  "var sections=[].slice.call(document.querySelectorAll('section,[data-track-section]'));",
  "var live=new Map();if('IntersectionObserver'in window){var observer=new IntersectionObserver(function(entries){entries.forEach(function(e){var key=safe(e.target.getAttribute('data-track-section')||e.target.id||e.target.tagName.toLowerCase());",
  " if(e.isIntersecting){live.set(e.target,Date.now());}else if(live.has(e.target)){var seconds=Math.min(600,Math.round((Date.now()-live.get(e.target))/1000));live.delete(e.target);if(seconds>1)send('fp_section_dwell',{section_key:key,seconds:seconds});}});},{threshold:0.5});",
  " sections.forEach(function(el){observer.observe(el);});}",
  "var last=Date.now();function pulse(){var now=Date.now();if(document.visibilityState==='visible'&&document.hasFocus()){var sec=Math.min(30,Math.round((now-last)/1000));if(sec>0)send('fp_active_time',{seconds:sec});}last=now;}",
  "setInterval(pulse,15000);addEventListener('pagehide',function(){pulse();send('$pageleave',{});});",
  "}",
  "function consentBanner(){if(document.getElementById('fp-analytics-consent'))return;",
  "var panel=document.createElement('div');panel.id='fp-analytics-consent';",
  "panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Preferencias de analítica');",
  "panel.style.cssText='position:fixed;z-index:999999;bottom:14px;left:14px;right:14px;max-width:410px;background:#fff;color:#132938;border:1px solid #dce4e8;border-radius:14px;box-shadow:0 10px 38px #102d3d26;padding:15px;font:13px/1.45 system-ui,sans-serif';",
  "var caption=document.createElement('div');caption.textContent='¿Nos permites medir visitas y uso de la página? No guardamos lo que escribas en formularios.';panel.appendChild(caption);",
  "var actions=document.createElement('div');actions.style.cssText='display:flex;gap:9px;margin-top:11px';",
  "function button(label,color,action){var b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='background:'+color+';color:'+(color==='#fff'?'#193044':'#fff')+';border:1px solid #dce4e8;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer';",
  "b.addEventListener('click',function(){remember(action);panel.remove();if(action==='yes')start();});return b;}",
  "actions.appendChild(button('Solo lo necesario','#fff','no'));actions.appendChild(button('Permitir analítica','#be1e37','yes'));panel.appendChild(actions);document.body.appendChild(panel);",
  "}",
  "if(choice==='yes')start();else if(choice!=='no'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',consentBanner,{once:true});else consentBanner();}",
  "})();"
 ].join("\n");
 return new NextResponse(script,{status:200,headers:{
  "Content-Type":"application/javascript; charset=utf-8",
  "Cache-Control":"public, max-age=120, s-maxage=120",
  "X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"https://family-power-v136-demo.vercel.app"
 }});
}
