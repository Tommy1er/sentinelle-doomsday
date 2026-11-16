import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sentinel import classify, clean

class SentinelTest(unittest.TestCase):
    def test_no_session_not_open(self):
        t = 'Avengers : Doomsday\nSortie : 16 Dec 2026\nIl n\'y a pas de séance programmée pour ce film'
        self.assertEqual(classify(t, []), 'NO_SESSIONS')

    def test_release_date_alone_not_open(self):
        self.assertNotEqual(classify('Avengers : Doomsday Sortie : 16 Dec 2026', []), 'BOOKING_POSSIBLE')

    def test_session_with_cta(self):
        t = 'Avengers : Doomsday\nSéances mercredi 16 décembre 2026 20h30\nIMAX Laser\nRéserver'
        self.assertEqual(classify(t, []), 'BOOKING_POSSIBLE')

    def test_noise_filtering(self):
        self.assertNotIn('74 avis au total', clean('Avengers : Doomsday\n74 avis au total'))

if __name__ == '__main__':
    unittest.main()
