# Family Power · Website behavioral analytics (v136)

Website: https://family-power-v136-demo.vercel.app/
CRM: https://crm-look.vercel.app/crm/web-analytics
PostHog project: https://us.posthog.com/project/673237

## Preserving analytics across site redesigns

Keep this ONE script tag on the HTML page shell's <head> in every release:

<script defer src="https://crm-look.vercel.app/api/family-power/posthog-tracker"></script>

Do not add additional copies. This URL is stable across tracker updates: future modifications should change the CRM endpoint, not every website page. HTML re-uploads that remove the tag will stop measurement; use the deployment check and Git-backed source to avoid losing it.

## Events recorded after consent

- $pageview / $pageleave
- fp_button_click (stable button ID, section and viewport coordinates only)
- fp_whatsapp_click, fp_phone_click
- fp_scroll_depth at 25, 50, 75, 90, 100 percent
- fp_section_dwell (time visible for each named section)
- fp_active_time (visible focused time, 15-second slices)
- fp_form_start, fp_form_submit (NO field contents)
- UTM sources, campaign and coarse device class

Consent is required; Do Not Track and Global Privacy Control are honored. There is NO email/phone capture, fingerprinting, keystroke collection or age estimation. Session replay is disabled. Geolocation is approximate when available; never infer age from browser attributes.

## Service architecture and outstanding gap

- Connected PostHog project is the live event destination for the site.
- CRM stores configuration in private Vercel env FP_POSTHOG_TOKEN and FP_POSTHOG_HOST.
- CRM's Supabase marketing_behavior_overview graph supports a separate private event ledger, but the public Supabase Edge collector could not be deployed through available controls. The CRM's native cards must not be described as mirroring PostHog data until a secure connector is verified.
- Advanced event graphs live in the authenticated PostHog project, linked from the CRM module.
- Apply migration 20261107110000_family_power_behavior_telemetry.sql (applied to CRM Supabase).

## Acceptance checks

1. Site HTML includes the exact tracker script after any redeploy.
2. CRM production serves a nonempty tracker JS with a public PostHog token sourced from private Vercel configuration.
3. Reject analytics consent: NO external capture requests.
4. Accept analytics consent: check events in PostHog Live Events, with the host matched to the Family Power site.
5. Verify click, depth, section and form events; no text/value or session replay.
6. Confirm the original site's quote form, WhatsApp links, branding, and mobile layout still work.

## Privacy note

Before enabling replay, heatmaps via DOM autocapture or other invasive analytics, review consent and masking in the site's privacy notice. Do not enable replay on quote forms until masking of all fields and sensitive page content is verified.