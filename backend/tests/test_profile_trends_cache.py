import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi import HTTPException

from app.profile_trends_cache import ProfileTrendsCache


class ProfileTrendsCacheTests(unittest.TestCase):
    def test_hits_expiry_and_bounded_storage(self):
        clock = [0]
        cache = ProfileTrendsCache(ttl=15, max_entries=2, clock=lambda: clock[0])
        calls = []

        def create():
            calls.append(1)
            return [{"title": "React"}]

        result = cache.get_or_create((1, "profile-a"), create)
        result[0]["title"] = "Changed by caller"
        self.assertEqual(cache.get_or_create((1, "profile-a"), create)[0]["title"], "React")
        self.assertEqual(len(calls), 1)
        clock[0] = 16
        cache.get_or_create((1, "profile-a"), create)
        self.assertEqual(len(calls), 2)
        cache.get_or_create((1, "profile-b"), create)
        cache.get_or_create((2, "profile-a"), create)
        self.assertEqual(len(cache.values), 2)
        self.assertNotIn((1, "profile-a"), cache.values)

    def test_concurrent_duplicate_requests_share_one_provider_call(self):
        cache = ProfileTrendsCache(max_inflight=1)
        entered, release, waiter = Event(), Event(), Event()
        calls = []

        def create():
            calls.append(1)
            entered.set()
            if not release.wait(5):
                raise TimeoutError("Test release not received")
            return [{"title": "React"}]

        def duplicate():
            waiter.set()
            return cache.get_or_create("same-profile", create)

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(cache.get_or_create, "same-profile", create)
            self.assertTrue(entered.wait(5))
            second = executor.submit(duplicate)
            self.assertTrue(waiter.wait(5))
            with self.assertRaises(HTTPException):
                cache.get_or_create("other-profile", create)
            release.set()
            self.assertEqual(first.result(), second.result())
        self.assertEqual(calls, [1])
        self.assertFalse(cache.pending)

    def test_failure_is_not_cached_and_releases_capacity(self):
        cache = ProfileTrendsCache(max_inflight=1)

        def fail():
            raise ValueError("provider unavailable")

        with self.assertRaises(ValueError):
            cache.get_or_create("profile", fail)
        self.assertFalse(cache.pending)
        self.assertFalse(cache.values)
        self.assertEqual(cache.get_or_create("profile", lambda: []), [])


if __name__ == "__main__":
    unittest.main()
