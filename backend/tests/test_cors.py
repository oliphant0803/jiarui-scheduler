import os

from fastapi.testclient import TestClient

os.environ["CORS_ORIGINS"] = (
    "https://www.jiarui-edu.com,"
    "https://jiarui-edu.com,"
    "https://jiarui-scheduler.onrender.com"
)

from app.main import _parse_cors_origins, app


def test_parse_cors_origins_trims_empty_values_and_trailing_slashes() -> None:
    assert _parse_cors_origins(
        " https://www.jiarui-edu.com/ , https://jiarui-edu.com ,"
        " https://jiarui-scheduler.onrender.com/ ,, "
    ) == [
        "https://www.jiarui-edu.com",
        "https://jiarui-edu.com",
        "https://jiarui-scheduler.onrender.com",
    ]


def test_register_preflight_allows_production_frontend() -> None:
    for origin in (
        "https://www.jiarui-edu.com",
        "https://jiarui-scheduler.onrender.com",
    ):
        response = TestClient(app).options(
            "/auth/register",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
