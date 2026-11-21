"""Check budgets around uncached suggestions; provider calls are mocked."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from test_google_auth import TEST_ENV
from app import main
from app.match_limits import MatchLimiter
from app.profile_trends_cache import ProfileTrendsCache


class ProfileTrendsBudgetTests(unittest.TestCase):
    def test_profile_edits_cannot_bypass_hourly_budget_and_cache_hits_are_free(self):
        cache = ProfileTrendsCache()
        limiter = MatchLimiter(per_user=2, total=3)
        user = SimpleNamespace(id=1, profession="Developer", bio="React")
        with patch.object(main, "profile_trends_cache", cache), patch.object(main, "trends_limiter", limiter), \
                patch.object(main, "generate_profile_trends", return_value=[{"title": "React"}]) as create:
            main.get_profile_trends(user)
            main.get_profile_trends(user)
            self.assertEqual(create.call_count, 1)
            self.assertEqual(len(limiter.events), 1)
            user.bio = "Python"
            main.get_profile_trends(user)
            user.bio = "Java"
            self.assertEqual(main.get_profile_trends(user), {"trends": []})
            self.assertEqual(create.call_count, 2)
            user.id = 2
            main.get_profile_trends(user)
            user.id = 3
            self.assertEqual(main.get_profile_trends(user), {"trends": []})
            self.assertEqual(create.call_count, 3)

    def test_profile_input_is_bounded_and_empty_profiles_do_not_spend_budget(self):
        limiter = MatchLimiter()
        with patch.object(main, "profile_trends_cache", ProfileTrendsCache()), \
                patch.object(main, "trends_limiter", limiter), patch.object(main, "generate_profile_trends", return_value=[]) as create:
            main.get_profile_trends(SimpleNamespace(id=1, profession="", bio=""))
            create.assert_not_called()
            self.assertFalse(limiter.events)
            main.get_profile_trends(SimpleNamespace(id=1, profession="p" * 1000, bio="b" * 10_000))
            profession, bio = create.call_args.args
            self.assertEqual(len(profession), 200)
            self.assertEqual(len(bio), 5000)


if __name__ == "__main__":
    unittest.main()
