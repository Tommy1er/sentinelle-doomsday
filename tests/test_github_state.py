import os
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
import github_state

class GitHubStateTests(unittest.TestCase):
    def test_read_state_json(self):
        self.assertEqual(github_state.read_public_state('{"status":"NO_SESSIONS"}'), {'status':'NO_SESSIONS'})

    def test_invalid_state_rejected(self):
        with self.assertRaises(ValueError):
            github_state.read_public_state('[]')

    def test_pull_restores(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(github_state, 'STATE_DIR', Path(temp)), patch.object(github_state, 'STATE_FILE', Path(temp)/'last_state.json'), patch.object(github_state, 'find_issue', return_value={'body':'{"status":"NO_SESSIONS"}'}):
                github_state.pull()
                self.assertEqual((Path(temp)/'last_state.json').read_text(), '{\n  "status": "NO_SESSIONS"\n}')

    def test_push_creates_issue(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'last_state.json'
            p.write_text('{"status":"NO_SESSIONS"}')
            with patch.object(github_state,'STATE_FILE',p), patch.object(github_state,'find_issue',return_value=None), patch.object(github_state,'request',return_value={}) as req:
                github_state.push()
                self.assertEqual(req.call_args.args[0:2], ('POST','/issues'))

if __name__ == '__main__': unittest.main()
