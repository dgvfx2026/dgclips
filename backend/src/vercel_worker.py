"""Start ARQ only when external services are ready; idle safely in demo mode."""
import logging
import os
import signal
import sys
from threading import Event
from .vercel_runtime import missing_configuration


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    missing = missing_configuration()
    if missing:
        # Log variable names, never values. A new deployment reloads configuration.
        logging.info("DGCLIPS worker aguardando configuração: %s", ", ".join(missing))
        stopped = Event()
        signal.signal(signal.SIGTERM, lambda *_: stopped.set())
        signal.signal(signal.SIGINT, lambda *_: stopped.set())
        while not stopped.wait(30):
            pass
        return
    binary = os.path.join(os.path.dirname(sys.executable), "arq")
    os.execv(binary, [binary, "src.workers.tasks.WorkerSettings"])


if __name__ == "__main__":
    main()
