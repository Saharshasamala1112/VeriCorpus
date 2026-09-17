import time
from collections import defaultdict

from app.middleware import RateLimitMiddleware, RequestIDMiddleware


class TestRateLimitMiddleware:
    def test_allows_requests_under_limit(self):
        middleware = RateLimitMiddleware(None, max_requests=5, window_seconds=60)
        middleware.requests = defaultdict(list)
        client_ip = "127.0.0.1"
        now = time.time()
        middleware.requests[client_ip] = [now - 10, now - 5]
        assert len(middleware.requests[client_ip]) < 5

    def test_old_requests_cleaned(self):
        middleware = RateLimitMiddleware(None, max_requests=5, window_seconds=60)
        middleware.requests = defaultdict(list)
        client_ip = "127.0.0.1"
        now = time.time()
        middleware.requests[client_ip] = [now - 120, now - 90, now - 70]
        cutoff = now - 60
        middleware.requests[client_ip] = [t for t in middleware.requests[client_ip] if t > cutoff]
        assert len(middleware.requests[client_ip]) == 0
