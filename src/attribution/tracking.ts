import type {
  TrackingService,
  TrackingIdentity,
  UtmParameters,
} from "./contracts";
export class UrlTrackingService implements TrackingService {
  buildUrl(
    destination: string,
    identity: TrackingIdentity,
    utm: UtmParameters,
  ) {
    const url = new URL(destination);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !identity.workspaceId
    )
      throw new Error("Destino ou workspace inválido.");
    const parameters = {
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
      traffic_workspace_id: identity.workspaceId,
      traffic_campaign_id: identity.campaignId,
      traffic_adset_id: identity.adsetId,
      traffic_ad_id: identity.adId,
      traffic_creative_id: identity.creativeId,
    };
    for (const [key, val] of Object.entries(parameters)) {
      url.searchParams.delete(key);
      if (val) url.searchParams.set(key, val);
    }
    return url.toString();
  }
}
