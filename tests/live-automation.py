"""Opt-in real Supabase/Edge E2E using disposable QA fixtures, never customers."""
import json
import os
import time
import urllib.request
import urllib.error

fixture = json.load(open(os.environ['CRM_LIVE_QA_FIXTURE_FILE']))
assert fixture['email_a'].startswith('qa-e2e-') and fixture['email_a'].endswith('@example.invalid')
base = 'https://ygipjqgyreeahslzorik.supabase.co'
headers = {'apikey': 'sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7', 'Content-Type': 'application/json'}

def api(path, body=None):
    request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # Report only the API message; no authorization headers or token responses.
        data = json.load(error)
        raise AssertionError(data.get('message', data.get('msg', 'QA API request failed'))) from None

session = api('/auth/v1/token?grant_type=password', {'email': fixture['email_a'], 'password': fixture['password']})
headers['Authorization'] = 'Bearer ' + session['access_token']
rpc = lambda name, body: api('/rest/v1/rpc/' + name, body)
rows = lambda table, query: api('/rest/v1/' + table + '?tenant_id=eq.' + fixture['tenant_a'] + '&' + query)

def wait_event(event_id):
    end = time.monotonic() + 90
    while time.monotonic() < end:
        try:
            result = rows('automation_events', 'id=eq.' + event_id + '&select=id,status,last_error')
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(5)
            continue
        assert len(result) == 1
        if result[0]['status'] in ['succeeded', 'failed', 'skipped']:
            return result[0]
        time.sleep(5)
    raise AssertionError('QA event did not finish within 90 seconds')

for key in ['flow_rule', 'blocked_rule']:
    rpc('save_automation_flow_version', {'p_rule_id': fixture[key], 'p_publish': True})
before = rows('tasks', 'select=id')
test = rpc('queue_automation_test', {'p_rule_id': fixture['flow_rule']})
assert wait_event(test['event_id'])['status'] == 'succeeded'
assert rows('tasks', 'select=id') == before, 'test mode created business tasks'
test_runs = rows('automation_runs', 'rule_id=eq.' + fixture['flow_rule'] + '&select=id,status,context')
assert any(run['status'] == 'succeeded' and run['context']['execution_contract'] == 'safe-v2' for run in test_runs)
print('PASS: deployed worker completed dry run with logs and zero business tasks.', flush=True)

rpc('activate_automation_flow', {'p_rule_id': fixture['flow_rule']})
headers['Prefer'] = 'return=representation'
lead = api('/rest/v1/contacts', {'tenant_id': fixture['tenant_a'], 'display_name': 'QA E2E automation lead', 'status': 'lead'})[0]
events = rows('automation_events', 'event_type=eq.lead_created&entity_id=eq.' + lead['id'] + '&select=id')
assert len(events) == 1
assert wait_event(events[0]['id'])['status'] == 'succeeded'
tasks = rows('tasks', 'select=id,contact_id,source,metadata')
assert len(tasks) == len(before) + 1 and tasks[-1]['contact_id'] == lead['id'] and tasks[-1]['source'] == 'automation'
print('PASS: real lead event produced exactly one tenant-scoped task through deployed Edge Function.', flush=True)

blocked = rpc('queue_automation_test', {'p_rule_id': fixture['blocked_rule']})
result = wait_event(blocked['event_id'])
assert result['status'] == 'failed' and 'whatsapp_channel_not_connected' in result['last_error']
failed_runs = rows('automation_runs', 'rule_id=eq.' + fixture['blocked_rule'] + '&select=id,status,error_message')
assert failed_runs and all(run['status'] == 'failed' for run in failed_runs)
assert len(rows('tasks', 'select=id')) == len(before) + 1
print('PASS: disconnected WhatsApp fails both run/event with explicit reason and no messages.', flush=True)
api('/auth/v1/logout?scope=local', {})
