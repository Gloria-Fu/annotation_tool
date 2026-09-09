from fastapi import HTTPException


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=409, detail=detail)
