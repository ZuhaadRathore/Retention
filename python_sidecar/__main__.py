from __future__ import annotations

import asyncio
import os
import socket
import sys

import uvicorn


def find_available_port(start_port: int, max_attempts: int = 10) -> int:
    """Find an available port starting from start_port."""
    for offset in range(max_attempts):
        port = start_port + offset
        try:
            # Try to bind to the port to check availability
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            # Port is in use, try next one
            continue
    raise RuntimeError(f"Could not find available port in range {start_port}-{start_port + max_attempts - 1}")


async def _serve() -> None:
    preferred_port = int(os.getenv("FLASH_AI_PORT", "27888"))

    # Find an available port, starting with the preferred one
    try:
        port = find_available_port(preferred_port)
        if port != preferred_port:
            print(f"Port {preferred_port} is in use, using port {port} instead", file=sys.stderr, flush=True)

        # Write the actual port being used to stdout so Rust can read it
        print(f"SIDECAR_PORT={port}", flush=True)

    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    config = uvicorn.Config("python_sidecar.app:app", host="127.0.0.1", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


def main() -> None:
    asyncio.run(_serve())


if __name__ == "__main__":
    main()
