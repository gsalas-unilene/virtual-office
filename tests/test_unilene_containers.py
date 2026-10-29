"""Exercise the container runner without Docker or private credentials."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class RunnerTests(unittest.TestCase):
    def run_fixture(self, *, missing=False, fail_build=False, legacy="0", args=()):
        with tempfile.TemporaryDirectory(prefix="unilene-run-") as directory:
            root = Path(directory)
            (root / "reserva-unilene-backend").mkdir()
            shutil.copy(ROOT / "run.sh", root / "run.sh")
            (root / "compose.yaml").touch()
            credentials = root / "reserva-unilene-backend/credentials.sh"
            credentials.write_text(
                "echo synthetic-secret\n"
                "export RESERVA_SQLSERVER_SERVER=synthetic-server\n"
                "export RESERVA_SQLSERVER_DATABASE=synthetic-db\n"
                "export RESERVA_SQLSERVER_USER=synthetic-user\n"
                "export SECRET_KEY_LOGIN=synthetic-login-key\n"
                "export RESERVA_ALLOW_LEGACY_TLS=0\n"
                + ("" if missing else "export RESERVA_SQLSERVER_PASSWORD=synthetic-secret\n")
            )
            docker = root / "docker"
            docker.write_text(
                '#!/bin/bash\n'
                'printf "%s\\n" "$*" >> "$CALL_LOG"\n'
                '[[ "$RESERVA_ALLOW_LEGACY_TLS" == "$EXPECTED_LEGACY" ]] || exit 8\n'
                'if [[ "$*" == *" build" && "${FAIL_BUILD}" == 1 ]]; then exit 9; fi\n'
            )
            docker.chmod(0o755)
            log = root / "calls"
            environment = {
                "PATH": f"{root}:/usr/bin:/bin",
                "HOME": directory,
                "CALL_LOG": str(log),
                "FAIL_BUILD": "1" if fail_build else "0",
                "RESERVA_ALLOW_LEGACY_TLS": legacy,
                "EXPECTED_LEGACY": legacy,
            }
            result = subprocess.run(
                ["bash", str(root / "run.sh"), *args], env=environment,
                cwd="/", text=True, capture_output=True,
            )
            calls = log.read_text().splitlines() if log.exists() else []
            return result, calls

    def test_order_and_private_output(self):
        result, calls = self.run_fixture()
        self.assertEqual(result.returncode, 0, result.stderr)
        lifecycle = [line.rsplit(" ", 1)[-1] for line in calls if line.endswith((" down", " build"))]
        self.assertEqual(lifecycle, ["down", "build"])
        self.assertTrue(calls[-1].endswith("up -d --wait --wait-timeout 90"))
        self.assertNotIn("synthetic-secret", result.stdout + result.stderr + "".join(calls))
        self.assertFalse(any("--volumes" in line for line in calls))

    def test_missing_settings_do_not_stop_running_stack(self):
        result, calls = self.run_fixture(missing=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(line.endswith(" down") for line in calls))

    def test_build_failure_does_not_start_stack(self):
        result, calls = self.run_fixture(fail_build=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(" up " in line for line in calls))

    def test_invalid_tls_setting_fails_before_down(self):
        result, calls = self.run_fixture(legacy="invalid")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("RESERVA_ALLOW_LEGACY_TLS must be 0 or 1", result.stderr)
        self.assertFalse(any(line.endswith(" down") for line in calls))

    def test_explicit_tls_override_wins_over_script_default(self):
        result, calls = self.run_fixture(legacy="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(calls[-1].endswith("up -d --wait --wait-timeout 90"))


class DownTests(unittest.TestCase):
    run_fixture = RunnerTests.run_fixture
    def test_down_stops_only_this_project_without_credentials(self):
        result, calls = self.run_fixture(missing=True, args=("down",))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertIn("--project-name unilene-reservations", calls[0])
        self.assertTrue(calls[0].endswith(" down"))
        self.assertNotIn("--volumes", calls[0])

    def test_unknown_arguments_are_rejected_before_docker(self):
        result, calls = self.run_fixture(args=("down", "--volumes"))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(calls, [])


class PublishedPortsTests(unittest.TestCase):
    def test_only_the_frontend_publishes_a_host_port(self):
        compose = (ROOT / "compose.yaml").read_text()
        backend, frontend = compose.split("  frontend:")
        self.assertNotIn("ports:", backend)
        self.assertIn('"0.0.0.0:8080:8080"', frontend)


if __name__ == "__main__":
    unittest.main()
