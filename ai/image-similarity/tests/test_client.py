"""The backend-facing client turns every failure into a status (the indicator is simply absent)."""
import httpx
import pytest

from app.client import SimilarityClient


def client_with(handler) -> SimilarityClient:
    return SimilarityClient(transport=httpx.MockTransport(handler))


def test_missing_image_never_calls_the_server(jpeg):
    def handler(request):
        raise AssertionError("should not be called")

    client = client_with(handler)
    assert client.compare(None, jpeg).status == "NO_IMAGE"
    assert client.compare(jpeg, b"").status == "NO_IMAGE"


def test_ok(jpeg):
    client = client_with(lambda r: httpx.Response(200, json={"cosine": 0.83, "model": "ViT-B-32", "pretrained": "x"}))
    result = client.compare(jpeg, jpeg)
    assert result.status == "OK" and result.cosine == 0.83


@pytest.mark.parametrize("exc,status", [(httpx.ReadTimeout("slow"), "TIMEOUT"), (httpx.ConnectTimeout("slow"), "TIMEOUT"),
                                        (httpx.ConnectError("refused"), "UNAVAILABLE")])
def test_transport_failures(jpeg, exc, status):
    def handler(request):
        raise exc

    assert client_with(handler).compare(jpeg, jpeg).status == status


@pytest.mark.parametrize("code,status", [(400, "INVALID_IMAGE"), (413, "INVALID_IMAGE"), (503, "UNAVAILABLE"), (500, "ERROR")])
def test_http_failures(jpeg, code, status):
    assert client_with(lambda r: httpx.Response(code, json={})).compare(jpeg, jpeg).status == status


@pytest.mark.parametrize("body", [{"cosine": "x"}, {}, {"cosine": 1.5}, {"cosine": float("nan")}])
def test_malformed_or_out_of_range_responses(jpeg, body):
    def handler(request):
        return httpx.Response(200, json=body) if body.get("cosine") == body.get("cosine") else httpx.Response(200, text='{"cosine": NaN}')

    assert client_with(handler).compare(jpeg, jpeg).status == "ERROR"
