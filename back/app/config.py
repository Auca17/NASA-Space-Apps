"""Environment variable access. Missing vars surface as HTTP 503, never traces."""

import os


class MissingEnv(Exception):
    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def get_env(name: str) -> str | None:
    value = os.environ.get(name)
    return value if value else None


def require_env(name: str) -> str:
    value = get_env(name)
    if value is None:
        raise MissingEnv(name)
    return value


def front_origin() -> str:
    return get_env("FRONT_ORIGIN") or "*"
