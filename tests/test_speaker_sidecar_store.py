import json
import tempfile
import threading
import unittest
from pathlib import Path

from src.speaker_sidecar_store import SpeakerSidecarStore, StaleDiarizationRun


class SpeakerSidecarStoreTests(unittest.TestCase):
    def setUp(self):
        self._temporary_directory = tempfile.TemporaryDirectory()
        self.output_dir = Path(self._temporary_directory.name)
        self.store = SpeakerSidecarStore(self.output_dir)
        self.path = self.output_dir / "meeting_speakers.json"
        self.path.write_text(json.dumps({
            "meeting_id": "meeting",
            "diarization_run": {"run_id": "current-run"},
            "channels": {
                "mic": {
                    "clusters": {
                        "SPEAKER_0": {},
                        "SPEAKER_1": {},
                    },
                },
            },
        }))

    def tearDown(self):
        self._temporary_directory.cleanup()

    def test_mutation_rejects_a_stale_diarization_run(self):
        with self.assertRaises(StaleDiarizationRun):
            self.store.mutate("meeting", "old-run", lambda document: document)

    def test_two_locked_mutations_preserve_both_cluster_updates(self):
        barrier = threading.Barrier(2)

        def update(speaker_id, key, value):
            barrier.wait()

            def mutation(document):
                document["channels"]["mic"]["clusters"][speaker_id][key] = value

            self.store.mutate("meeting", "current-run", mutation)

        first = threading.Thread(
            target=update,
            args=("SPEAKER_0", "contains_multiple_speakers", True),
        )
        second = threading.Thread(
            target=update,
            args=("SPEAKER_1", "review_state", "generic"),
        )
        first.start()
        second.start()
        first.join()
        second.join()

        document = self.store.read("meeting")
        clusters = document["channels"]["mic"]["clusters"]
        self.assertTrue(clusters["SPEAKER_0"]["contains_multiple_speakers"])
        self.assertEqual(clusters["SPEAKER_1"]["review_state"], "generic")

    def test_missing_run_is_rejected_when_an_expected_run_is_supplied(self):
        document = json.loads(self.path.read_text())
        document.pop("diarization_run")
        self.path.write_text(json.dumps(document))
        with self.assertRaises(StaleDiarizationRun):
            self.store.mutate("meeting", "current-run", lambda value: value)

    def test_legacy_run_token_ignores_review_metadata_but_tracks_acoustic_data(self):
        document = json.loads(self.path.read_text())
        document.pop("diarization_run")
        self.path.write_text(json.dumps(document))

        token = self.store.run_token(document)
        self.assertRegex(token, r"^legacy-[0-9a-f]{64}$")
        self.assertEqual(token, self.store.run_token(self.store.read("meeting")))

        self.store.mutate(
            "meeting",
            token,
            lambda value: value["channels"]["mic"]["clusters"]["SPEAKER_0"].update(
                {"review_state": "generic"},
            ),
        )
        self.store.mutate("meeting", token, lambda value: value)

        replaced = self.store.read("meeting")
        replaced["channels"]["mic"]["clusters"]["SPEAKER_0"]["embedding"] = [0.0, 1.0]
        self.path.write_text(json.dumps(replaced))
        with self.assertRaises(StaleDiarizationRun):
            self.store.mutate("meeting", token, lambda value: value)


if __name__ == "__main__":
    unittest.main()
