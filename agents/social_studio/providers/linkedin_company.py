"""LinkedIn Company Page provider (ported from social-studio reference repo)."""
from __future__ import annotations
import logging
from .linkedin import API_BASE, LINKEDIN_HEADERS, LinkedInProvider
from .types import AccountProfile, PublishContent, PublishResult

logger = logging.getLogger(__name__)


class LinkedInCompanyProvider(LinkedInProvider):
    """LinkedIn provider scoped to Company Page posting."""

    @property
    def platform_name(self) -> str:
        return "LinkedIn (Company)"

    @property
    def required_scopes(self) -> list[str]:
        return [
            "r_basicprofile", "w_member_social",
            "w_organization_social", "r_organization_social",
            "rw_organization_admin",
        ]

    def get_profile(self, access_token: str) -> AccountProfile:
        org_id = self.credentials.get("org_id")
        if not org_id:
            pages = self.get_user_pages(access_token)
            if pages:
                org_id = pages[0]["id"]
            else:
                return super().get_profile(access_token)
        resp = self._request("GET", f"{API_BASE}/v2/organizations/{org_id}",
            access_token=access_token, headers=LINKEDIN_HEADERS)
        data = resp.json()
        logo_url = None
        logo_els = data.get("logoV2", {}).get("original~", {}).get("elements", [])
        if logo_els:
            ids = logo_els[0].get("identifiers", [])
            if ids:
                logo_url = ids[0].get("identifier")
        name = data.get("localizedName", "")
        return AccountProfile(platform_id=str(org_id), name=name, avatar_url=logo_url, extra=data)

    def publish_post(self, access_token: str, content: PublishContent) -> PublishResult:
        org_id = self.credentials.get("org_id")
        if not org_id:
            profile = self.get_profile(access_token)
            org_id = profile.platform_id
        content.extra["author"] = f"urn:li:organization:{org_id}"
        return super().publish_post(access_token, content)

    def get_account_metrics(self, access_token: str, date_range=None):
        from .types import AccountMetrics
        org_id = self.credentials.get("org_id")
        if not org_id:
            profile = self.get_profile(access_token)
            org_id = profile.platform_id
        
        follower_count = 0
        impressions = 0
        engagements = 0
        reach = 0
        
        try:
            org_urn = f"urn:li:organization:{org_id}"
            
            # Fetch followers
            resp_f = self._request("GET", f"{API_BASE}/v2/networkSizes/{org_urn}",
                access_token=access_token,
                headers=dict(**LINKEDIN_HEADERS, edgeType="CompanyFollowedByMember"))
            data_f = resp_f.json()
            follower_count = data_f.get("firstDegreeSize", 0)
            
            # Fetch share statistics (impressions, engagements, etc) if date_range provided
            if date_range:
                start_time = int(date_range[0].timestamp() * 1000)
                end_time = int(date_range[1].timestamp() * 1000)
                resp_s = self._request(
                    "GET",
                    f"{API_BASE}/rest/organizationalEntityShareStatistics",
                    access_token=access_token,
                    headers=LINKEDIN_HEADERS,
                    params={
                        "q": "organizationalEntity",
                        "organizationalEntity": org_urn,
                        "timeIntervals.timeGranularityType": "DAY",
                        "timeIntervals.timeRange.start": start_time,
                        "timeIntervals.timeRange.end": end_time,
                    },
                )
                data_s = resp_s.json()
                for el in data_s.get("elements", []):
                    stats = el.get("totalShareStatistics", {})
                    impressions += stats.get("impressionCount", 0)
                    engagements += stats.get("engagementCount", 0)
                    # Use uniqueImpressionsCount as proxy for reach
                    reach += stats.get("uniqueImpressionsCount", 0)
        except Exception as e:
            logger.warning(f"Error fetching linkedin account metrics: {e}")

        return AccountMetrics(followers=follower_count, reach=reach, impressions=impressions, engagements=engagements)

    def get_user_pages(self, access_token: str) -> list[dict]:
        params = {"q": "roleAssignee", "role": "ADMINISTRATOR",
                  "projection": "(elements*(organizationalTarget~(id,localizedName,vanityName)))"}
        resp = self._request("GET", f"{API_BASE}/v2/organizationalEntityAcls",
            access_token=access_token, headers=LINKEDIN_HEADERS, params=params)
        data = resp.json()
        pages = []
        for el in data.get("elements", []):
            org = el.get("organizationalTarget~", {})
            org_urn = el.get("organizationalTarget", "")
            org_id = org_urn.split(":")[-1] if org_urn else str(org.get("id", ""))
            pages.append({"id": str(org_id), "name": org.get("localizedName", ""),
                          "handle": org.get("vanityName", ""), "access_token": access_token})
        return pages
