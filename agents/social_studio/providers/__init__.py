"""Providers package — adapted from brightbean-studio (MIT licence)."""
from .bluesky import BlueskyProvider
from .linkedin import LinkedInProvider
from .linkedin_company import LinkedInCompanyProvider
from .threads import ThreadsProvider
from .instagram import InstagramProvider
from .instagram_login import InstagramLoginProvider
from .twitter import TwitterProvider
from .facebook import FacebookProvider
from .tiktok import TikTokProvider
from .youtube import YouTubeProvider
from .base import SocialProvider
from .types import PublishContent, PublishResult, AccountProfile, PostType
from .exceptions import ProviderError, PublishError, RateLimitError, APIError

PROVIDERS: dict[str, type[SocialProvider]] = {
    "bluesky": BlueskyProvider,
    "linkedin": LinkedInProvider,
    "linkedin_company": LinkedInCompanyProvider,
    "threads": ThreadsProvider,
    "instagram": InstagramProvider,
    "instagram_login": InstagramLoginProvider,
    "twitter": TwitterProvider,
    "facebook": FacebookProvider,
    "tiktok": TikTokProvider,
    "youtube": YouTubeProvider,
}

__all__ = [
    "BlueskyProvider", "LinkedInProvider", "LinkedInCompanyProvider",
    "ThreadsProvider", "InstagramProvider", "InstagramLoginProvider", "TwitterProvider", "FacebookProvider",
    "TikTokProvider", "YouTubeProvider", "SocialProvider", "PublishContent",
    "PublishResult", "AccountProfile", "PostType", "ProviderError", "PublishError",
    "RateLimitError", "APIError", "PROVIDERS",
]
