"""백엔드 스켈레톤 테스트."""

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    """헬스체크가 200과 status=ok를 돌려준다."""
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
