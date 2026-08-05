"""판정 서비스 클라이언트.

전투 규칙은 TypeScript에 한 벌만 있다(/arbiter). 여기서는 그걸 HTTP로 부르고
결과를 받아오는 일만 한다 — 규칙을 파이썬으로 옮겨 적는 순간 구현이 둘이 되고,
둘은 반드시 어긋난다.

호출을 의존성으로 주입할 수 있게 만들어 둔 이유는 두 가지다.

  1. 테스트가 Node 프로세스에 의존하지 않아야 한다. pytest가 판정 서비스를
     띄워야만 돌아간다면 아무도 테스트를 돌리지 않게 된다.
  2. 판정 서비스가 죽었을 때 서버 전체가 아니라 대전 기능만 멈춰야 한다.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Protocol

ARBITER_URL = os.environ.get("ARBITER_URL", "http://127.0.0.1:8787")
ARBITER_TIMEOUT = float(os.environ.get("ARBITER_TIMEOUT", "10"))


class ArbiterError(RuntimeError):
    """판정 서비스에 닿지 못했거나 오류를 돌려줬다."""

    def __init__(self, message: str, status: int | None = None, payload: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload


class Arbiter(Protocol):
    """판정 서비스의 최소 계약. 테스트는 이걸 만족하는 가짜를 끼운다."""

    def duel(self, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        ...


class HttpArbiter:
    """실제 판정 서비스."""

    def __init__(self, base_url: str = ARBITER_URL, timeout: float = ARBITER_TIMEOUT) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def duel(self, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return self._post("/duel", body)

    def _post(self, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return res.status, json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            #  422(검증 실패)는 정상적인 답이다. 본문에 이유가 들어 있으므로
            #  예외로 만들지 않고 그대로 올려보낸다.
            raw = e.read().decode("utf-8")
            try:
                return e.code, json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ArbiterError("판정 서비스가 JSON이 아닌 답을 보냈다", e.code, raw) from exc
        except urllib.error.URLError as e:
            raise ArbiterError(f"판정 서비스에 닿지 못했다 — {e.reason}") from e


_arbiter: Arbiter = HttpArbiter()


def get_arbiter() -> Arbiter:
    """요청마다 판정 서비스를 얻는다. 테스트가 갈아끼울 수 있게 의존성으로 둔다."""
    return _arbiter
