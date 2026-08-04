"""STONEAGE-REBUILD 백엔드 스켈레톤.

Phase 0에서는 헬스체크만 둔다. 게임 로직은 일절 넣지 않는다.

전투 엔진은 클라이언트의 순수 TypeScript로 굴러가고, 서버는 Phase 8에서
권위 검증을 맡을 때 같은 엔진을 실행하게 된다. 지금은 그 자리를 비워둔다.
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="STONEAGE-REBUILD", version="0.1.0")


class Health(BaseModel):
    """헬스체크 응답."""

    status: str
    version: str


@app.get("/health", response_model=Health)
def health() -> Health:
    """서버가 떠 있는지 확인한다."""
    return Health(status="ok", version=app.version)
