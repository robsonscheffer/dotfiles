"""Exercise the chezmoi skill linker without touching the real home directory."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "home/run_always_link-skills.sh"


class LinkSkillsTest(unittest.TestCase):
    def test_links_shared_skills_into_existing_hermes_homes(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            home = Path(tmp)
            source = home / ".claude/skills/example"
            source.mkdir(parents=True)
            (source / "SKILL.md").write_text("---\nname: example\n---\n")
            destinations = [
                home / ".agents/skills",
                home / ".codex/skills",
                home / ".hermes/skills",
                home / ".hermes/profiles/alice/skills",
                home / ".hermes/profiles/other/skills",
            ]
            for destination in destinations:
                destination.mkdir(parents=True)
            env = dict(os.environ, HOME=str(home), HERMES_HOME=str(home / ".hermes/profiles/alice"))
            subprocess.run(["bash", str(SCRIPT)], env=env, check=True, capture_output=True)
            for destination in destinations:
                link = destination / "example"
                self.assertTrue(link.is_symlink(), str(link))
                self.assertEqual(link.resolve(), source.resolve())

    def test_preserves_local_skills_and_foreign_links_on_repeated_runs(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            home = Path(tmp)
            source = home / ".claude/skills"
            for name in ("local", "foreign", "shared"):
                (source / name).mkdir(parents=True)
            destination = home / ".hermes/profiles/alice/skills"
            (destination / "local").mkdir(parents=True)
            marker = destination / "local/SKILL.md"
            marker.write_text("local skill")
            foreign = home / "foreign-skill"
            foreign.mkdir()
            (destination / "foreign").symlink_to(foreign)
            (destination / "stale").symlink_to(source / "stale")
            (destination / "foreign-dangling").symlink_to(home / "missing")
            env = dict(os.environ, HOME=str(home))
            for _ in range(2):
                subprocess.run(["bash", str(SCRIPT)], env=env, check=True, capture_output=True)
            self.assertEqual(marker.read_text(), "local skill")
            self.assertEqual((destination / "foreign").resolve(), foreign.resolve())
            self.assertEqual((destination / "shared").resolve(), (source / "shared").resolve())
            self.assertFalse((destination / "stale").is_symlink())
            self.assertTrue((destination / "foreign-dangling").is_symlink())

    def test_does_not_create_hermes_when_not_installed(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            home = Path(tmp)
            (home / ".claude/skills/example").mkdir(parents=True)
            subprocess.run(["bash", str(SCRIPT)], env=dict(os.environ, HOME=str(home)),
                           check=True, capture_output=True)
            self.assertFalse((home / ".hermes").exists())

    def test_skips_missing_skill_source(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            home = Path(tmp)
            (home / ".hermes").mkdir()
            subprocess.run(["bash", str(SCRIPT)], env=dict(os.environ, HOME=str(home)),
                           check=True, capture_output=True)
            self.assertFalse((home / ".hermes/skills").exists())


if __name__ == "__main__":
    unittest.main()
