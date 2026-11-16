#!/usr/bin/env python3
"""Persist the browser sentinel state in a GitHub Issue for ephemeral Actions runners.

Issue body contains ONLY public monitoring state, never tokens or email addresses.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ISSUE_TITLE = '[Sentinel state] Avengers Doomsday — machine managed'
GITHUB_API = 'https://api.github.com'
STATE_DIR = Path(os.environ.get('SENTINEL_DATA', './data'))
STATE_FILE = STATE_DIR / 'last_state.json'


def request(method, path, body=None):
    token = os.environ.get('GITHUB_TOKEN')
    repo = os.environ.get('GITHUB_REPOSITORY')
    if not token or not repo or '/' not in repo:
        raise RuntimeError('Missing GITHUB_TOKEN or GITHUB_REPOSITORY')
    url = f'{GITHUB_API}/repos/{repo}{path}'
    raw = json.dumps(body, ensure_ascii=False).encode('utf-8') if body is not None else None
    req = Request(url, data=raw, method=method, headers={
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {token}',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sentinelle-doomsday',
        **({'Content-Type': 'application/json'} if raw is not None else {})
    })
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        # Avoid logging private response bodies, request credentials, URLs with tokens.
        raise RuntimeError(f'GitHub API returned HTTP {exc.code} on {method} {path.split("?")[0]}') from None


def find_issue():
    # Dedicated repository: issue can appear among the first 100.
    for issue in request('GET', '/issues?state=all&per_page=100'):
        if issue.get('title') == ISSUE_TITLE and 'pull_request' not in issue:
            return issue
    return None


def read_public_state(body):
    if not body:
        return {}
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError('Expected JSON object in state issue')
    return data


def pull():
    issue = find_issue()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not issue:
        print('No prior state issue: initial baseline will be created after first check')
        return
    data = read_public_state(issue.get('body', ''))
    STATE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Previous monitoring state restored from issue')


def push():
    if not STATE_FILE.exists():
        raise RuntimeError('Sentinel did not produce a state file')
    data = json.loads(STATE_FILE.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise RuntimeError('Invalid state format')
    body = json.dumps(data, ensure_ascii=False, indent=2)
    # GitHub issue body limits apply; clear excessive stale entries to avoid silent loss.
    if len(body) > 60000:
        raise RuntimeError('Sentinel state issue too large; manual inspection required')
    issue = find_issue()
    if issue:
        request('PATCH', f"/issues/{issue['number']}", {'body': body})
        print('Monitoring state saved to issue')
    else:
        request('POST', '/issues', {'title': ISSUE_TITLE, 'body': body})
        print('Monitoring state issue created')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['pull', 'push'])
    args = parser.parse_args()
    (pull if args.operation == 'pull' else push)()
