import axios from "axios";
import { config } from "../../config";

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  idToken: string;
}> {
  const response = await axios.post("https://oauth2.googleapis.com/token", {
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.callbackUrl,
    grant_type: "authorization_code",
  });

  return {
    accessToken: response.data.access_token,
    idToken: response.data.id_token,
  };
}

export async function getGoogleUserInfo(accessToken: string): Promise<{
  googleId: string;
  name: string;
  email: string;
  avatar: string;
}> {
  const response = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return {
    googleId: response.data.id,
    name: response.data.name,
    email: response.data.email,
    avatar: response.data.picture,
  };
}
