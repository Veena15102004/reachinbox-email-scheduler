import axios from "axios";
import { config } from "../../config";

export async function exchangeSlackCode(code: string): Promise<{
  accessToken: string;
  teamId: string;
  teamName: string;
  userId: string;
}> {
  const response = await axios.post(
    "https://slack.com/api/oauth.v2.access",
    null,
    {
      params: {
        client_id: config.slack.clientId,
        client_secret: config.slack.clientSecret,
        code,
        redirect_uri: config.slack.callbackUrl,
      },
    }
  );

  const data = response.data;
  if (!data.ok) {
    throw new Error(data.error || "Slack OAuth failed");
  }

  return {
    accessToken: data.access_token,
    teamId: data.team.id,
    teamName: data.team.name,
    userId: data.authed_user.id,
  };
}
