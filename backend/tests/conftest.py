import os

os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/annotate_tool_test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")

import pytest

from app.database import Base, SessionLocal, engine


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session

